// Real rc.5 registry/scope/tool/prompt integration. No model or desktop UI.
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
import { apply } from '../lib/index.js';

const ctx = new Context();
ctx.logger.level = 0;
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok    ${name}`); };
try {
  await ctx.plugin(Loader, { baseUrl: import.meta.url });
  await ctx.plugin(Projection);
  await ctx.plugin(Tools, {});
  await ctx.plugin(Prompt, {});
  // Only the language is needed for schema assembly; we never execute PTC/model code.
  ctx.provide('ptcRuntime', { language: 'typescript' });
  ctx.loader.builtins.presentation = {
    inject: ['tools'],
    apply(child, { mode }) { child.tools.presentAs(mode); },
  };
  await ctx.plugin(Registry, { default: 'standard' });
  const registry = ctx.get('agentPresets');
  for (const [id, mode] of [['standard', 'native'], ['code', 'ptc']]) {
    await registry.register({ id, plugins: [{ name: 'cordis:presentation', config: { mode } }] });
  }
  await registry.register({ id: 'broken', plugins: [{ nope: true }] });
  const events = [{ type: 'user/message', data: { content: 'keep history' } }, { type: 'turn/start', data: {} }];
  const session = { id: 'rc5-session', header: { origin: 'root', agentPreset: 'standard' }, events,
    append(type, data) { events.push({ type, data }); } };
  const agent = { id: session.id, session };
  const scoped = createScope(ctx, agent);
  agent.ctx = scoped.ctx;
  await registry.mount(agent.ctx, 'standard');
  let route;
  const cleanup = apply({
    webServer: { register(value) { route = value; return () => {}; } },
    agents: { get(id) { return id === session.id ? agent : undefined; } },
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
  check('real rc.5 initial composition is standard', () => assert.equal(registry.composedPreset(agent.ctx), 'standard'));
  let outcome = await switchTo('code');
  check('open turn refuses switch', () => assert.equal(outcome.status, 409));
  check('refusal leaves real composition unchanged', () => assert.equal(registry.composedPreset(agent.ctx), 'standard'));
  session.append('turn/end', { reason: 'aborted' });
  const history = structuredClone(events);
  outcome = await switchTo('code');
  check('stopped session switches successfully', () => assert.equal(outcome.status, 200));
  check('real rc.5 registry rebinds same agent to code', () => assert.equal(registry.composedPreset(agent.ctx), 'code'));
  check('existing conversation prefix stays intact', () => assert.deepEqual(events.slice(0, history.length), history));
  check('selection is recorded exactly once', () => assert.deepEqual(events.at(-1), { type: 'agent-preset/selected', data: { agentPreset: 'code' } }));
  // This exercises the next-turn prompt/schema boundary, not a paid model request.
  session.append('turn/start', {});
  const next = await ctx.systemPrompt.assemble({ scope: agent, agent });
  check('next-turn assembly presents PTC run_code', () => assert.deepEqual(next.tools.map(tool => tool.name), ['run_code']));
  outcome = await switchTo('standard');
  check('continued turn again refuses switching', () => assert.equal(outcome.status, 409));
  session.append('turn/end', {});
  outcome = await switchTo('missing');
  check('real registry not-found error maps to 404', () => assert.equal(outcome.status, 404));
  outcome = await switchTo('broken');
  check('real registry invalid error maps to 422', () => assert.equal(outcome.status, 422));
  check('failed selections retain code composition', () => assert.equal(registry.composedPreset(agent.ctx), 'code'));
  outcome = await switchTo('standard');
  check('switch back succeeds after end', () => assert.equal(outcome.status, 200));
  const native = await ctx.systemPrompt.assemble({ scope: agent, agent });
  check('switch back removes PTC transport', () => assert.deepEqual(native.tools, []));
  cleanup();
  await scoped.dispose();
  console.log(`\n${checks} real rc.5 integration checks passed (no live model/UI)`);
} finally {
  await ctx.fiber.dispose();
}
