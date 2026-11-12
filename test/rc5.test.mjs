// Real installed DSH registry/session/turn-boundary/scope/tool/prompt integration.
// Run unchanged against 0.2.1-rc.5 and 0.2.2-rc.1. No model or desktop UI.
// Preset definitions are tiny fixture compositions, not the full shipped presets.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Registry from '@deepseek-ai/dsh-agent-preset-registry';
import Projection from '@deepseek-ai/dsh-session-projection';
import Tools from '@deepseek-ai/dsh-tools';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import { createScope } from '@deepseek-ai/dsh-scope';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import Agents from '@deepseek-ai/dsh-agent';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { apply } from '../lib/index.js';

const ctx = new Context();
ctx.logger.level = 0;
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok    ${name}`); };
try {
  await ctx.plugin(Loader, { baseUrl: import.meta.url });
  await ctx.plugin(Projection);
  await ctx.plugin(Agents);
  await ctx.plugin(Tools, {});
  await ctx.plugin(Prompt, {});
  // Only the language is needed for schema assembly; we never execute PTC/model code.
  ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' });
  const modernExecutors = typeof ctx.tools.setExecutor === 'function';
  const { PtcExecutor } = modernExecutors ? await import('@deepseek-ai/dsh-tool-executor-ptc') : {};
  const { NativeToolExecutor } = modernExecutors ? await import('@deepseek-ai/dsh-tool-executor-native') : {};
  ctx.loader.builtins.presentation = {
    inject: ['tools', 'systemPrompt', 'ptcRuntime'],
    apply(child, { mode }) {
      if (modernExecutors) child.tools.setExecutor(mode === 'ptc' ? new PtcExecutor(child) : new NativeToolExecutor(child));
      else child.tools.presentAs(mode);
    },
  };
  await ctx.plugin(Registry, { default: 'standard' });
  const registry = ctx.get('agentPresets');
  for (const [id, mode] of [['standard', 'native'], ['code', 'ptc']]) {
    await registry.register({ id, plugins: [{ name: 'cordis:presentation', config: { mode } }] });
  }
  await registry.register({ id: 'broken', plugins: [{ nope: true }] });
  const session = Session.create(SessionId('compat-session'));
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'keep history' }], source: { kind: 'human' } }), { surfaceOp: 'append' });
  session.append('turn/start', { turn: 1 });
  const agent = { id: session.id, session };
  const scoped = createScope(ctx, agent);
  agent.ctx = scoped.ctx;
  await registry.mount(agent.ctx, 'standard');
  let route;
  const cleanup = apply({
    connection: { requestRejection: () => undefined },
    webServer: { register(value) { route = value; return () => {}; } },
    agents: { get(id) { return id === session.id ? agent : undefined; },
      ...(typeof ctx.agents.turnBoundaryOf === 'function'
        ? {turnBoundaryOf(value) { return ctx.agents.turnBoundaryOf(value); }} : {}) },
    get(name) { return ctx.get(name); },
  });
  async function switchTo(agentPreset) {
    const req = new EventEmitter(); req.method = 'POST';
    let status, payload;
    const promise = route.handler(req, {
      writeHead(value) { status = value; },
      end(body) { payload = JSON.parse(body); },
    });
    req.emit('data', Buffer.from(JSON.stringify({ sessionId: session.id, agentPreset })));
    req.emit('end');
    await promise;
    return { status, payload };
  }
  check('real DSH initial composition is standard', () => assert.equal(registry.composedPreset(agent.ctx), 'standard'));
  let outcome = await switchTo('code');
  check('open turn refuses switch', () => assert.equal(outcome.status, 409));
  check('refusal leaves real composition unchanged', () => assert.equal(registry.composedPreset(agent.ctx), 'standard'));
  session.append('turn/end', { turn: 1, reason: { kind: 'aborted' } });
  const history = session.snapshotEvents();
  outcome = await switchTo('code');
  check('stopped session switches successfully', () => assert.equal(outcome.status, 200, JSON.stringify(outcome)));
  check('real DSH registry rebinds same agent to code', () => assert.equal(registry.composedPreset(agent.ctx), 'code'));
  check('existing conversation prefix stays intact', () => assert.deepEqual(session.snapshotEvents().slice(0, history.length), history));
  check('selection is recorded exactly once', () => {
    const added = session.snapshotEvents().slice(history.length);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, 'agent-preset/selected');
    assert.equal(added[0].data.agentPreset, 'code');
  });
  // This exercises the next-turn prompt/schema boundary, not a paid model request.
  session.append('turn/start', { turn: 2 });
  const next = await ctx.systemPrompt.assemble({ scope: agent, agent });
  check('next-turn assembly presents PTC run_code', () => assert.deepEqual(next.tools.map(tool => tool.name), ['run_code']));
  outcome = await switchTo('standard');
  check('continued turn again refuses switching', () => assert.equal(outcome.status, 409));
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } });
  outcome = await switchTo('missing');
  check('real registry not-found error maps to 404', () => assert.equal(outcome.status, 404));
  outcome = await switchTo('broken');
  check('real registry invalid error maps to 422', () => assert.equal(outcome.status, 422));
  check('failed selections retain code composition', () => assert.equal(registry.composedPreset(agent.ctx), 'code'));
  outcome = await switchTo('standard');
  check('switch back succeeds after end', () => assert.equal(outcome.status, 200, JSON.stringify(outcome)));
  const native = await ctx.systemPrompt.assemble({ scope: agent, agent });
  check('switch back removes PTC transport', () => assert.deepEqual(native.tools, []));
  cleanup();
  await scoped.dispose();
  console.log(`\n${checks} real DSH integration checks passed (no live model/UI)`);
} finally {
  await ctx.fiber.dispose();
}

