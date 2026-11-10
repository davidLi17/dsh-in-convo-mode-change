// Unit tests for the host half (lib/index.js) with a fully mocked ctx.
// Run from the plugin directory: node test/host.test.mjs
// (requires a local node_modules symlink so "@deepseek-ai/dsh-typert-protocol"
// resolves — see the test runner's setup notes).

import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { apply, inject, name } from "../lib/index.js";

let failures = 0;

function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} ${extra}`);
  }
}

// ---------- fakes ----------
class FakePresets {
  constructor() {
    this.recomposed = [];
    this.failWith = undefined;
  }
  async recompose(agentCtx, id) {
    if (this.failWith !== undefined) throw this.failWith;
    this.recomposed.push([agentCtx, id]);
    return { id };
  }
}

function makeSession(events, origin = "root") {
  const appended = [];
  return {
    header: { origin },
    events,
    append: (type, data) => appended.push({ type, data }),
    appended,
  };
}

function makeCtx({ session, presets, agent = undefined }) {
  const fakePresets = presets ?? new FakePresets();
  return {
    webServer: {
      registered: undefined,
      register(route) {
        this.registered = route;
        this.disposed = false;
        return () => {
          this.disposed = true;
        };
      },
    },
    agentPresets: fakePresets,
    agents: {
      get: (id) => (agent !== undefined && agent.session === session ? agent : undefined),
    },
    get(name) {
      if (name === "agentPresets") return fakePresets;
      if (name === "agents") return this.agents;
      return undefined;
    },
  };
}

// Minimal node:http-like response capture.
function makeRes() {
  const captured = {};
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status;
      captured.headers = headers;
    },
    end(body) {
      captured.body = body;
    },
  };
}

function makeReq(method, body) {
  const req = {
    method,
    on(event, fn) {
      this[`_on_${event}`] = fn;
      return this;
    },
  };
  // Simulate body delivery on next tick.
  if (body !== undefined) {
    setTimeout(() => {
      req._on_data?.(Buffer.from(body));
      req._on_end?.();
    }, 0);
  } else {
    setTimeout(() => req._on_end?.(), 0);
  }
  return req;
}

async function callHandler(route, req, res) {
  await route.handler(req, res);
  return res.captured;
}

// ---------- plugin shape ----------
check("plugin name", name === "dsh-in-convo-mode-change");
check("plugin injects host services", inject.join(",") === "webServer,agentPresets,agents");

// The host-owned projection is authoritative, including sequence zero.
for (const [boundary, expected] of [[{openTurnStartSeq: 0},409],[{openTurnStartSeq: 7},409],[{openTurnStartSeq: null},200],[undefined,409]]) {
  const session = makeSession([]);
  Object.defineProperty(session, 'events', { get() { throw new Error('must not read removed events API'); } });
  const ctx = makeCtx({session, agent:{session, ctx:{}}});
  ctx.agents.turnBoundaryOf = (value) => {
    if (value !== session) throw new Error('wrong projection target');
    return boundary;
  };
  apply(ctx);
  const out = await callHandler(ctx.webServer.registered, makeReq('POST',JSON.stringify({sessionId:'s1',agentPreset:'code'})),makeRes());
  check(`host boundary ${JSON.stringify(boundary)} returns ${expected}`, out.status === expected);
}
{
  const session = makeSession(undefined);
  const ctx = makeCtx({session,agent:{session,ctx:{}}});apply(ctx);
  const out=await callHandler(ctx.webServer.registered,makeReq('POST',JSON.stringify({sessionId:'s1',agentPreset:'code'})),makeRes());
  check('unknown legacy state fails closed',out.status===409);
}

for (const events of [[], [{type:'turn/start'}], [{type:'turn/start'},{type:'turn/end'}]]) {
  const session=makeSession(undefined);session.snapshotEvents=()=>events;
  const ctx=makeCtx({session,agent:{session,ctx:{}}});apply(ctx);
  const out=await callHandler(ctx.webServer.registered,makeReq('POST',JSON.stringify({sessionId:'s1',agentPreset:'code'})),makeRes());
  check(`snapshot history length ${events.length} guards correctly`,out.status===(events.length===1?409:200));
}
for (const method of ['turnBoundaryOf','snapshotEvents']) {
  const session=makeSession([]);const ctx=makeCtx({session,agent:{session,ctx:{}}});
  (method==='turnBoundaryOf'?ctx.agents:session)[method]=()=>{throw new Error('state unavailable')};apply(ctx);
  const out=await callHandler(ctx.webServer.registered,makeReq('POST',JSON.stringify({sessionId:'s1',agentPreset:'code'})),makeRes());
  check(`${method} failure refuses mutation`,out.status===409&&ctx.agentPresets.recomposed.length===0);
}

// ---------- registration ----------
{
  const ctx = makeCtx({ session: makeSession([]) });
  const disposer = apply(ctx);
  const route = ctx.webServer.registered;
  check("registers one exact route", route !== undefined && route.kind === "exact");
  check("route path", route?.path === "/change-convo-mode/switch");
  check("route handler is a function", typeof route?.handler === "function");
  disposer();
  check("disposer unregisters", ctx.webServer.disposed === true);
}

// ---------- method + body validation ----------
{
  const ctx = makeCtx({ session: makeSession([]) });
  apply(ctx);
  const route = ctx.webServer.registered;

  let out = await callHandler(route, makeReq("GET"), makeRes());
  check("GET is refused 405", out.status === 405 && out.body.includes("method-not-allowed"));

  out = await callHandler(route, makeReq("POST", "not json"), makeRes());
  check("bad JSON is 400", out.status === 400 && out.body.includes("bad-request"));

  out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "" })), makeRes());
  check("missing agentPreset is 400", out.status === 400 && out.body.includes("bad-request"));

  out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: 42 })), makeRes());
  check("non-string agentPreset is 400", out.status === 400);
}

// ---------- unknown session ----------
{
  const session = makeSession([]);
  const ctx = makeCtx({ session, agent: undefined }); // no live agent registered
  apply(ctx);
  const route = ctx.webServer.registered;
  const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "ghost", agentPreset: "minimal" })), makeRes());
  check("unknown session is 404 session-not-found", out.status === 404 && out.body.includes("session-not-found"));
}

// ---------- running turn refused, recompose untouched ----------
{
  const presets = new FakePresets();
  const session = makeSession([
    { type: "user/message" },
    { type: "turn/start" }, // open turn: no turn/end yet
    { type: "tool-call" },
  ]);
  const ctx = makeCtx({ session, presets, agent: { session, ctx: { scope: "agent" } } });
  apply(ctx);
  const route = ctx.webServer.registered;
  const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "minimal" })), makeRes());
  check("running turn is 409 turn-running", out.status === 409 && out.body.includes("turn-running"));
  check("recompose not called while running", presets.recomposed.length === 0);
}

// ---------- successful between-turns switch ----------
{
  const presets = new FakePresets();
  const session = makeSession([
    { type: "user/message" },
    { type: "turn/start" },
    { type: "tool-call" },
    { type: "turn/end" },
    { type: "user/message" },
  ]);
  const ctx = makeCtx({ session, presets, agent: { session, ctx: { scope: "agent" } } });
  apply(ctx);
  const route = ctx.webServer.registered;
  const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "minimal" })), makeRes());
  check("switch returns 200 ok", out.status === 200 && out.body.includes('"ok":true') && out.body.includes('"agentPreset":"minimal"'));
  check("recompose called with agent ctx + id", presets.recomposed.length === 1 && presets.recomposed[0][0].scope === "agent" && presets.recomposed[0][1] === "minimal");
  check("agent-preset/selected event appended", session.appended.length === 1 && session.appended[0].type === "agent-preset/selected" && session.appended[0].data.agentPreset === "minimal");
}

// ---------- blank session also allowed (consistent with built-in select) ----------
{
  const presets = new FakePresets();
  const session = makeSession([{ type: "agent/created" }]);
  const ctx = makeCtx({ session, presets, agent: { session, ctx: { scope: "agent" } } });
  apply(ctx);
  const route = ctx.webServer.registered;
  const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "standard" })), makeRes());
  check("blank session switch returns 200", out.status === 200 && presets.recomposed.length === 1);
}

// ---------- subagent-owned session refused ----------
{
  const presets = new FakePresets();
  const session = makeSession([{ type: "turn/start" }, { type: "turn/end" }], "subagent");
  const ctx = makeCtx({ session, presets, agent: { session, ctx: { scope: "child" } } });
  apply(ctx);
  const route = ctx.webServer.registered;
  const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "child-1", agentPreset: "minimal" })), makeRes());
  check("subagent session is 409 agent-busy", out.status === 409 && out.body.includes("agent-busy"));
  check("recompose not called for subagent", presets.recomposed.length === 0);
}

// ---------- unknown / broken preset mapping ----------
{
  {
    const presets = new FakePresets();
    presets.failWith = new RemoteError("agent-preset/not-found", "Unknown preset: nope", { available: ["standard", "minimal"] });
    const session = makeSession([{ type: "turn/start" }, { type: "turn/end" }]);
    const ctx = makeCtx({ session, presets, agent: { session, ctx: {} } });
    apply(ctx);
    const route = ctx.webServer.registered;
    const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "nope" })), makeRes());
    check("unknown preset is 404 agent-preset-not-found", out.status === 404 && out.body.includes("agent-preset-not-found") && out.body.includes('"available":["standard","minimal"]'));
  }
  {
    const presets = new FakePresets();
    presets.failWith = new RemoteError("agent-preset/invalid", "the composition is not valid YAML", { agentPreset: "broken" });
    const session = makeSession([{ type: "turn/start" }, { type: "turn/end" }]);
    const ctx = makeCtx({ session, presets, agent: { session, ctx: {} } });
    apply(ctx);
    const route = ctx.webServer.registered;
    const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "broken" })), makeRes());
    check("broken preset is 422 agent-preset-invalid", out.status === 422 && out.body.includes("agent-preset-invalid"));
  }
  {
    const presets = new FakePresets();
    presets.failWith = new Error("boom");
    const session = makeSession([{ type: "turn/start" }, { type: "turn/end" }]);
    const ctx = makeCtx({ session, presets, agent: { session, ctx: {} } });
    apply(ctx);
    const route = ctx.webServer.registered;
    const out = await callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "minimal" })), makeRes());
    check("unexpected failure is 500 internal", out.status === 500 && out.body.includes('"code":"internal"'));
  }
}

// ---------- per-session serialization ----------
{
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const presets = new FakePresets();
  const original = presets.recompose.bind(presets);
  const calls = [];
  presets.recompose = async (agentCtx, id) => {
    calls.push(`start:${id}`);
    await gate; // hold the first call open
    calls.push(`end:${id}`);
    return original(agentCtx, id);
  };
  const session = makeSession([{ type: "turn/start" }, { type: "turn/end" }]);
  const ctx = makeCtx({ session, presets, agent: { session, ctx: {} } });
  apply(ctx);
  const route = ctx.webServer.registered;

  const first = callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "minimal" })), makeRes());
  const second = callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s1", agentPreset: "standard" })), makeRes());
  const third = callHandler(route, makeReq("POST", JSON.stringify({ sessionId: "s2", agentPreset: "code" })), makeRes());
  // Wait a tick so all three bodies arrived and the queues settled.
  await new Promise((resolve) => setTimeout(resolve, 10));
  check("first s1 request started, second s1 queued behind it", calls[0] === "start:minimal" && !calls.includes("start:standard"));
  check("independent session started without waiting", calls.includes("start:code"));
  release();
  const [o1, o2, o3] = await Promise.all([first, second, third]);
  check("both s1 switches eventually succeed", o1.status === 200 && o2.status === 200 && o3.status === 200);
  const s1Order = calls.filter((entry) => entry.endsWith(":minimal") || entry.endsWith(":standard"));
  check("s1 switches ran strictly in order", s1Order.join(",") === "start:minimal,end:minimal,start:standard,end:standard");
  check("independent session completed", calls.includes("start:code") && calls.includes("end:code"));
}

// ---------- summary ----------
if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log("\nall host tests passed");

