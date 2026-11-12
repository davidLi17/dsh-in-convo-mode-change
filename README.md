# dsh-in-convo-mode-change

Switch the **agent preset** of a conversation mid-session in the DeepSeek
Harness web UI. The presets are the "conversation modes" shipped with the
harness — **Standard mode**, **Code mode (PTC)**, **Minimal mode**, and
**Creator mode**, plus any custom presets you have authored.

By default the session header's preset icon is a read-only label: a session's
composition is fixed when it starts, and the built-in picker only exists on
the new-session hero screen. This plugin turns the header icon into a real
mode switcher that works on a conversation that has already started.

## 当前自用版：26.11.12-lhg

明确支持 **DSH 0.2.2-rc.2、0.2.2-rc.1**，并保留 **0.2.1-rc.5** 兼容。
修复切换接口缺少鉴权的问题：复用宿主现有登录和来源检查，未登录或跨站请求不能切换会话。
新版使用 `agents.turnBoundaryOf(session).openTurnStartSeq` 判断运行状态；
rc.5 使用 `session.snapshotEvents()`，更旧的事件数组仅作兼容回退。
状态未知或读取失败时拒绝切换。请先停止当前任务，等停止完成后手动切换，再发送继续消息。
保留运行中禁用、同会话串行队列与清理、body portal 和用户已有交互。

验证：rc.5、rc.1 发布包及 rc.2 官方源码构建组件各通过 82 项服务与行为检查，另有 8 项 React DOM 检查。
rc.2 隔离 Web 宿主通过实际安装、HTTP 鉴权、客户端加载，并在开启沙箱的 Chromium 中验证切换、取消、关闭、视口定位和历史保留。
rc.2 npm 包本轮尚未提供，使用官方 tag `ddac9676` 构建；没有测试用户 Windows/macOS Desktop 或付费模型。
手写 JS，无编译步骤或现有 Actions 工作流。详情见维护记录。

测试时准备与目标版本匹配的官方依赖及 React 18/jsdom，使用现有 `node_modules`，
或 `DSH_NODE_MODULES=/path/to/node_modules npm test`；DOM 运行
`UI_NODE_MODULES=/path/to/react18-and-jsdom/node_modules npm run test:dom`。
详见 [维护记录](MAINTENANCE.md)。

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

## 自用修复版：26.10.31-lhg.2（DSH 0.2.1-rc.5）

- 修复模式菜单被正文覆盖、靠左时菜单越出窗口的问题：使用宿主 React DOM 的 body portal，并在窗口缩放和滚动时保持菜单位于视口内。
- 保留菜单内点击、取消、外部点击与 Escape 关闭，以及运行中禁止确认。

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

### UI regression

`UI_NODE_MODULES=/absolute/path/node_modules npm run test:dom` uses React 18.3.1,
React DOM 18.3.1 and jsdom 26.1.0 for the small portal/positioning regression.
These are isolated test dependencies, not shipped or bundled runtime libraries.

