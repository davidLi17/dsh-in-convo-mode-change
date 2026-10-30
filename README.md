# dsh-in-convo-mode-change

Switch the **agent preset** of a conversation mid-session in the DeepSeek
Harness web UI. The presets are the "conversation modes" shipped with the
harness — **Standard mode**, **Code mode (PTC)**, **Minimal mode**, and
**Creator mode**, plus any custom presets you have authored.

By default the session header's preset icon is a read-only label: a session's
composition is fixed when it starts, and the built-in picker only exists on
the new-session hero screen. This plugin turns the header icon into a real
mode switcher that works on a conversation that has already started.

## How it works

- **Client half** (`lib/client.js`) replaces the built-in `agent-preset` cell
  in `conversation.session.header.actions` with a menu button. Picking a mode
  asks for confirmation, then POSTs `{ sessionId, agentPreset }` to the host
  route.
- **Host half** (`lib/index.js`) registers the `POST /change-convo-mode/switch`
  route on the web server. It uses the host's own
  `agentPresets.recompose()` — the same machinery the built-in blank-session
  picker uses — without the "no turn has ever run" restriction, and records
  the switch in the session log as an `agent-preset/selected` event so the
  transcript stays honest.
- Picking is disabled while the session is running a turn; the host refuses
  anyway (defense in depth), because re-parenting the agent's scope chain
  mid-call could strand an in-flight tool invocation.

## Caveats

Switching modes mid-conversation is deliberately *not* offered by the host,
and this plugin bypasses that gate on purpose:

- The switch applies from the **next turn**. The current transcript is
  untouched, but tool calls made under the previous mode may **render
  differently** in the chat afterwards, because the UI resolves tool views
  through the session's current preset.
- Don't switch while a turn is running — the menu is disabled during a run.

## 自用修复版：26.10.31-lhg（DSH 0.2.1-rc.5）

- 修复切换结束后每会话 Promise 队列未清理的问题；保留同会话串行切换。
- 适配 rc.5 的预设错误码、远程接口和会话投影，去掉旧接口及旧包导入。
- 确认窗口打开后若开始运行，也禁止确认切换。
- **不是运行中热切换**：先停止，等回合结束，再切换 Code（PTC），最后发送“继续”。历史不删除，不自动重发消息。

桌面版安装：打开 **插件 → 添加插件 → 包名或地址**，粘贴：

```text
github:davidLi17/dsh-in-convo-mode-change#main
```

安装后重启 DSH。不要同时安装原版与本 Fork（插件名相同）。

原作者 jiangr100，MIT；基于上游 `238fa0899ec80194c13d64eaf245a168e5182f82`。
见 [维护与验证记录](MAINTENANCE.md)。

## Install (standalone Web profile)

From a local checkout:

```sh
dsh plugin --profile web add /path/to/dsh-in-convo-mode-change
```

Or straight from GitHub (the `dsh.bundle.patch` manifest field makes the
dependency join the profile's plugin layers automatically):

```sh
dsh plugin --profile web add github:davidLi17/dsh-in-convo-mode-change#main
```

Then **restart the web server** (stop the `dsh web` process and run `dsh web`
again) so the loader picks up the new plugin row and the client bundle.

After restart, the header of any conversation shows the mode switcher where
the read-only preset label used to be.

## Uninstall

```sh
dsh plugin --profile web remove dsh-in-convo-mode-change
```

and restart `dsh web`. Sessions that already switched modes keep running on
the preset they switched to.

## Development notes

- The client bundle is a hand-written module-loader bundle (no build step),
  following the same pattern as `dsh-rewind`.
- The host row injects `webServer`, `agentPresets`, and `agents`; it imports
  no legacy preset package; rc.5 preset errors are identified by stable codes.
- The client replaces the built-in label by registering the SAME id
  (`agent-preset`) in `conversation.session.header.actions` at a **lower
  `priority`** (the built-in sits at the default 0). The slots registry keys
  list cells by `(id, priority)`: a duplicate id at the same priority throws
  and fails the whole plugin entry at load; the lowest priority wins the
  cell. `test/slots.test.mjs` drives the real `SlotCore` to lock this in.
  Do not remove the `priority: -10` option.

### Tests

Tests require the official rc.5 packages `@deepseek-ai/dsh-agent-preset-registry`,
`@deepseek-ai/dsh-client-ui-slots`, and their dependencies. Install these into an
isolated test directory, then run `DSH_NODE_MODULES=/absolute/path/node_modules npm test`.
The runner never deletes an existing dependency directory. No build step is required;
`lib/` contains the shipped JavaScript. No live model or account is used in tests.
