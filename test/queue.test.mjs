// Observe the private queue without adding a production API. Map is replaced
// only during synchronous apply(), then restored before any request runs.
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';

let pending;
const NativeMap = globalThis.Map;
let registered;
let recompose = async (_ctx, id) => ({ id });
const session = { header: { origin: 'root' }, events: [], append() {} };
const ctx = {
  webServer: { register(route) { registered = route; return () => {}; } },
  agents: { get() { return { ctx: {}, session }; } },
  get() { return { recompose: (...args) => recompose(...args) }; },
};
try {
  globalThis.Map = class extends NativeMap { constructor(...args) { super(...args); pending = this; } };
  apply(ctx);
} finally { globalThis.Map = NativeMap; }
function request(id = 'session', preset = 'code', failResponse = false) {
  const listeners = {};
  const req = { method: 'POST', on(event, callback) { listeners[event] = callback; return this; } };
  const res = { writeHead() {}, end() { if (failResponse) throw new Error('disconnected'); } };
  const task = registered.handler(req, res);
  listeners.data(Buffer.from(JSON.stringify({ sessionId: id, agentPreset: preset })));
  listeners.end();
  return task;
}
await request();
assert.equal(pending.size, 0, 'completed session must leave the queue');
recompose = async () => { throw new Error('mount failed'); };
await request();
assert.equal(pending.size, 0, 'failed switch must leave the queue');
await assert.rejects(request('session', 'code', true), /disconnected/);
assert.equal(pending.size, 0, 'response failure must leave the queue');
let releaseFirst, releaseSecond;
let calls = 0;
recompose = async (_ctx, id) => {
  calls++;
  await new Promise(resolve => { if (calls === 1) releaseFirst = resolve; else releaseSecond = resolve; });
  return { id };
};
const first = request();
const second = request();
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls, 1, 'same-session second request waits');
releaseFirst();
await first;
await new Promise(resolve => setImmediate(resolve));
assert.equal(pending.size, 1, 'older completion must retain the newer request');
assert.equal(calls, 2);
releaseSecond();
await second;
assert.equal(pending.size, 0, 'final completion must remove the session');
console.log('8 queue cleanup assertions passed');
