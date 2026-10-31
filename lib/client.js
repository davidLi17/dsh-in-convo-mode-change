// dsh-in-convo-mode-change — web client half (module-loader bundle).
//
// This file is the package's prebuilt client bundle: it registers one module
// with the web shell's module loader (window.__ModuleLoader__) and exports a
// Cordis client plugin. It requires only `react`; everything else comes from
// client services (`slots`, `connection`, `remote`, `sessions`).
//
// What it contributes: it takes the session header's `agent-preset` cell —
// normally a read-only label naming the preset the session started with — and
// replaces it with a working mode switcher. Clicking it opens a menu of the
// deployment's agent presets (Standard / Code / Minimal / Creator and any
// custom copies); picking one asks for confirmation, then POSTs to the host
// route registered by lib/index.js (`/change-convo-mode/switch`), which
// re-composes the live session's agent onto the new preset between turns.
//
// The menu disables picking while the session is running a turn (the host
// refuses anyway); the built-in new-session hero chip keeps working as before.

window.__ModuleLoader__.load({
  id: 'dsh-in-convo-mode-change',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')
    var ReactDOM = require('react-dom')

    // ---------- copy ----------
    var LANG = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '') ? 'zh' : 'en'
    function L(zh, en) {
      return LANG === 'zh' ? zh : en
    }

    // Display copy for the shipped presets, mirroring the built-in surface.
    var BUILTIN = {
      standard: {
        name: { zh: '标准模式', en: 'Standard mode' },
        description: {
          zh: '功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。',
          en: 'Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.',
        },
      },
      code: {
        name: { zh: 'PTC 模式', en: 'Code mode' },
        description: {
          zh: '具备标准模式的全部能力，并通过 Code Mode SDK 呈现工具，让模型用一个 TypeScript 程序组合多步操作。',
          en: 'All Standard mode capabilities, with tools exposed through the Code Mode SDK so the model can combine multi-step operations in one TypeScript program.',
        },
      },
      minimal: {
        name: { zh: '极简模式', en: 'Minimal mode' },
        description: {
          zh: '仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。',
          en: 'Two-tool coding agent with persistent bash and str_replace_editor.',
        },
      },
      cordis: {
        name: { zh: '创造模式', en: 'Creator mode' },
        description: {
          zh: '用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。',
          en: 'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',
        },
      },
    }

    // ---------- styling (cosmetic; never fail the plugin) ----------
    var CSS = [
      '.dcm-root { position: relative; display: inline-flex; }',
      '.dcm-trigger { box-sizing: border-box; max-width: 190px; height: 22px; display: inline-flex; align-items: center; gap: 4px; border: none; border-radius: 6px; background: var(--dsw-alias-fill-tsp-secondary); color: var(--dsw-alias-label-secondary); padding: 0 2px 0 0; font: inherit; font-size: 12px; line-height: 22px; cursor: pointer; }',
      '.dcm-trigger:hover:not(:disabled), .dcm-trigger[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-trigger:disabled { cursor: default; opacity: .6; }',
      '.dcm-icon { opacity: .7; flex: none; display: inline-flex; padding-left: 2px; }',
      '.dcm-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dcm-chevron { color: var(--dsw-alias-label-caption); flex: none; display: inline-flex; }',
      '.dcm-panel { box-sizing: border-box; position: fixed; z-index: 1100; width: 320px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-inverted); background: var(--dsw-specific-menu, #292a2c); backdrop-filter: var(--dsw-menu-backdrop-filter); box-shadow: var(--dsw-shadow-lv3); border-radius: 12px; padding: 10px; color: var(--dsw-alias-label-primary); }',
      '.dcm-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; line-height: 20px; }',
      '.dcm-close { display: inline-flex; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 2px; border-radius: 6px; }',
      '.dcm-close:hover { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-caption { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 1.5; }',
      '.dcm-hint { color: var(--dsw-alias-state-business-primary); font-size: 11px; line-height: 1.5; }',
      '.dcm-rows { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }',
      '.dcm-row { box-sizing: border-box; display: flex; gap: 8px; width: 100%; text-align: left; border: none; background: transparent; color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 6px 8px; cursor: pointer; font: inherit; }',
      '.dcm-row:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-row:disabled { cursor: default; opacity: .55; }',
      '.dcm-rowText { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }',
      '.dcm-rowName { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; line-height: 18px; }',
      '.dcm-rowDesc { color: var(--dsw-alias-label-caption); font-size: 11px; line-height: 15px; }',
      '.dcm-check { flex: none; display: inline-flex; color: var(--dsw-alias-state-business-primary); }',
      '.dcm-trust { flex: none; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 14px; padding: 0 4px; }',
      '.dcm-confirm { display: flex; flex-direction: column; gap: 8px; }',
      '.dcm-confirmTitle { font-size: 13px; font-weight: 600; line-height: 20px; }',
      '.dcm-confirmBody { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }',
      '.dcm-confirmActions { display: flex; justify-content: flex-end; gap: 8px; }',
      '.dcm-btn { border: none; border-radius: 8px; padding: 4px 12px; font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }',
      '.dcm-btn:disabled { opacity: .5; cursor: default; }',
      '.dcm-btnGhost { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
      '.dcm-btnPrimary { background: var(--dsw-alias-button-info-fill); color: #fff; }',
      '.dcm-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.5; }',
      '.dcm-busy { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.5; }',
    ].join('\n')

    // ---------- icons ----------
    function IconModes() {
      return React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M2 4.5h7M13 4.5h1M2 11.5h1M6 11.5h8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        React.createElement('circle', { cx: 11.5, cy: 4.5, r: 1.6, fill: 'var(--dsw-alias-label-secondary)', stroke: 'currentColor', strokeWidth: 1 }),
        React.createElement('circle', { cx: 4.5, cy: 11.5, r: 1.6, fill: 'var(--dsw-alias-label-secondary)', stroke: 'currentColor', strokeWidth: 1 }),
      )
    }
    function IconChevron() {
      return React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M3 4.5L6 7.5L9 4.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }
    function IconCheck() {
      return React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M2.5 6.5L5 9L9.5 3.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }
    function IconClose() {
      return React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M3 3L9 9M9 3L3 9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    // ---------- shared controller state ----------
    var state = {
      options: [], // { id, trust, name?, description? } — healthy presets only
      open: false,
      sessionId: undefined, // the session the menu was opened for
      confirming: null, // preset id awaiting confirmation
      busy: false,
      error: null,
      version: 0,
    }
    var listeners = new Set()
    function subscribe(fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    }
    function notify() {
      var arr = [...listeners]
      for (var i = 0; i < arr.length; i++) arr[i]()
    }
    function mutate(patch) {
      Object.assign(state, patch)
      notify()
    }

    function apply(ctx) {
      var styleTag = null
      try {
        styleTag = document.createElement('style')
        styleTag.textContent = CSS
        document.head.appendChild(styleTag)
      } catch (err) { /* styling is cosmetic */ }

      function api() {
        return ctx.get('remote')
      }

      async function loadRoster() {
        var face = api()
        if (face === undefined) return
        try {
          var response = await face.agentPresets.list()
          if (!response.ok) {
            mutate({ error: response.error.message })
            return
          }
          var presets = response.value.presets
          var options = []
          for (var i = 0; i < presets.length; i++) {
            var preset = presets[i]
            if (preset.broken !== undefined) continue
            options.push({
              id: preset.id,
              trust: preset.trust,
              name: preset.name,
              description: preset.description,
            })
          }
          mutate({ options: options, error: null, version: state.version + 1 })
        } catch (err) {
          mutate({ error: err instanceof Error ? err.message : String(err) })
        }
      }

      async function doSwitch(sessionId, id) {
        mutate({ busy: true, error: null })
        try {
          var res = await fetch('/change-convo-mode/switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, agentPreset: id }),
          })
          var data = null
          try { data = await res.json() } catch (err) { /* non-JSON body */ }
          if (!res.ok || data === null || data.ok !== true || data.error !== undefined) {
            var message = data !== null && data !== undefined && data.error !== undefined && data.error.message !== undefined
              ? data.error.message
              : 'mode switch failed (HTTP ' + res.status + ')'
            mutate({ busy: false, error: message, confirming: null })
            return
          }
          mutate({ busy: false, open: false, confirming: null, error: null })
        } catch (err) {
          mutate({ busy: false, error: err instanceof Error ? err.message : String(err), confirming: null })
        }
      }

      function openMenu(sessionId) {
        mutate({ open: true, sessionId: sessionId, error: null, confirming: null, version: state.version + 1 })
        loadRoster()
      }
      function closeMenu() {
        mutate({ open: false, confirming: null })
      }

      function presetText(option) {
        if (option.trust === 'system') {
          var builtin = BUILTIN[option.id]
          if (builtin !== undefined) {
            return { name: builtin.name[LANG], description: builtin.description[LANG] }
          }
        }
        return {
          name: option.name !== undefined && option.name !== null && option.name !== '' ? option.name : option.id,
          description: option.description,
        }
      }

      // ---------- the header action (replaces the read-only preset label) ----------
      function ModeSwitchAction(props) {
        var snapState = React.useState(state)
        var snap = snapState[0]
        var setSnap = snapState[1]
        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])
        var rootRef = React.useRef(null)
        var panelRef = React.useRef(null)


        var entry
        try {
          entry = props.useSessions(function (s) { return s.byId[props.sessionId] })
        } catch (err) { entry = undefined }
        var current = entry !== undefined && entry !== null ? entry.projectionValues?.agentPreset : undefined
        var running = entry !== undefined && entry !== null && entry.running === true

        // Escape the header's clipping/stacking context, then keep the body
        // portal anchored inside the viewport (including narrow windows).
        React.useLayoutEffect(function () {
          if (!snap.open) return
          function positionPanel() {
            var anchor = rootRef.current
            var panel = panelRef.current
            if (!anchor || !panel) return
            var rect = anchor.getBoundingClientRect()
            var width = panel.offsetWidth
            var height = panel.offsetHeight
            var vw = document.documentElement.clientWidth
            var vh = document.documentElement.clientHeight
            var left = Math.max(8, Math.min(rect.right - width, vw - width - 8))
            var top = rect.bottom + 6
            if (top + height > vh - 8) top = rect.top - height - 6
            top = Math.max(8, Math.min(top, vh - height - 8))
            panel.style.left = left + 'px'
            panel.style.top = top + 'px'
          }
          positionPanel()
          window.addEventListener('resize', positionPanel)
          document.addEventListener('scroll', positionPanel, true)
          var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(positionPanel) : null
          if (observer && panelRef.current) observer.observe(panelRef.current)
          if (observer && rootRef.current) observer.observe(rootRef.current)
          return function () {
            window.removeEventListener('resize', positionPanel)
            document.removeEventListener('scroll', positionPanel, true)
            if (observer) observer.disconnect()
          }
        }, [snap.open, snap.confirming, snap.options, snap.error, running])

        // Close when the session changes or the menu loses focus.
        React.useEffect(function () {
          if (snap.open && props.sessionId !== state.sessionId) closeMenu()
        }, [snap.open, props.sessionId])
        React.useEffect(function () {
          if (!snap.open) return
          function onDown(ev) {
            if (ev.target instanceof Node && (rootRef.current?.contains(ev.target) || panelRef.current?.contains(ev.target))) return
            closeMenu()
          }
          function onKey(ev) {
            if (ev.key !== 'Escape') return
            ev.preventDefault()
            ev.stopPropagation()
            closeMenu()
          }
          document.addEventListener('pointerdown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          return function () {
            document.removeEventListener('pointerdown', onDown, true)
            document.removeEventListener('keydown', onKey, true)
          }
        }, [snap.open])

        if (current === undefined) return null

        var currentOption = null
        for (var i = 0; i < snap.options.length; i++) {
          if (snap.options[i].id === current) { currentOption = snap.options[i]; break }
        }
        var currentText = currentOption !== null ? presetText(currentOption) : null
        var label = currentText !== null ? currentText.name : current

        var triggerTitle = running
          ? L('当前回合运行中，结束后才能切换', 'Waiting for the current run to finish')
          : L('切换对话模式', 'Switch conversation mode') + (currentText !== null && currentText.description !== undefined ? ' — ' + currentText.description : '')

        return React.createElement('span', { className: 'dcm-root', ref: rootRef },
          React.createElement('button', {
            type: 'button',
            className: 'dcm-trigger',
            disabled: snap.busy,
            'aria-haspopup': 'menu',
            'aria-expanded': snap.open,
            title: triggerTitle,
            onClick: function () {
              if (snap.open) closeMenu()
              else openMenu(props.sessionId)
            },
          },
            React.createElement('span', { className: 'dcm-icon' }, IconModes()),
            React.createElement('span', { className: 'dcm-name' }, label),
            React.createElement('span', { className: 'dcm-chevron' }, IconChevron()),
          ),
          snap.open && ReactDOM.createPortal(React.createElement('div', { className: 'dcm-panel', role: 'menu', ref: panelRef },
            React.createElement('div', { className: 'dcm-head' },
              React.createElement('span', null, L('对话模式', 'Conversation mode')),
              React.createElement('button', { type: 'button', className: 'dcm-close', onClick: closeMenu, 'aria-label': L('关闭', 'Close') }, IconClose()),
            ),
            React.createElement('div', { className: 'dcm-caption' },
              L('自下一个回合起生效。切换后，先前模式产生的工具调用在聊天中的展示可能有所不同。', 'Applies from the next turn. Tool calls made under the previous mode may render differently in the chat.'),
            ),
            running && React.createElement('div', { className: 'dcm-hint' }, L('等待当前回合结束…', 'Waiting for the current run to finish…')),
            snap.error !== null && React.createElement('div', { className: 'dcm-error' }, snap.error),
            snap.confirming !== null
              ? (function () {
                  var option = null
                  for (var j = 0; j < snap.options.length; j++) {
                    if (snap.options[j].id === snap.confirming) { option = snap.options[j]; break }
                  }
                  var text = option !== null ? presetText(option) : { name: snap.confirming, description: undefined }
                  return React.createElement('div', { className: 'dcm-confirm' },
                    React.createElement('div', { className: 'dcm-confirmTitle' }, L('切换对话模式？', 'Switch conversation mode?')),
                    React.createElement('div', { className: 'dcm-confirmBody' },
                      L('之后的回合将使用「' + text.name + '」运行，现有记录保持不变。', 'Subsequent turns will run under ' + text.name + '. The existing transcript stays as-is.') + ' ' +
                      L('先前模式产生的工具调用在聊天中的展示可能有所不同。', 'Tool calls made under the previous mode may render differently in the chat.'),
                    ),
                    React.createElement('div', { className: 'dcm-confirmActions' },
                      React.createElement('button', {
                        type: 'button',
                        className: 'dcm-btn dcm-btnGhost',
                        disabled: snap.busy,
                        onClick: function () { mutate({ confirming: null, error: null }) },
                      }, L('取消', 'Cancel')),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dcm-btn dcm-btnPrimary',
                        disabled: running || snap.busy,
                        onClick: function () {
                          if (snap.confirming !== null && !running && !snap.busy) doSwitch(props.sessionId, snap.confirming)
                        },
                      }, L('切换', 'Switch')),
                    ),
                  )
                })()
              : snap.options.length === 0
                ? React.createElement('div', { className: 'dcm-busy' }, L('正在加载模式…', 'Loading modes…'))
                : React.createElement('div', { className: 'dcm-rows' },
                    snap.options.map(function (option) {
                      var text = presetText(option)
                      var selected = option.id === current
                      return React.createElement('button', {
                        type: 'button',
                        key: option.id,
                        className: 'dcm-row',
                        role: 'menuitemradio',
                        'aria-checked': selected,
                        disabled: running || snap.busy,
                        title: running ? L('等待当前回合结束', 'Waiting for the current run to finish') : text.description,
                        onClick: function () {
                          if (running || snap.busy) return
                          if (option.id === current) { closeMenu(); return }
                          mutate({ confirming: option.id, error: null })
                        },
                      },
                        React.createElement('span', { className: 'dcm-rowText' },
                          React.createElement('span', { className: 'dcm-rowName' },
                            React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text.name),
                            option.trust === 'user' && React.createElement('span', { className: 'dcm-trust' }, L('自定义', 'Custom')),
                            selected && React.createElement('span', { className: 'dcm-check' }, IconCheck()),
                          ),
                          React.createElement('span', { className: 'dcm-rowDesc' }, text.description !== undefined && text.description !== null ? text.description : ''),
                        ),
                      )
                    }),
                  ),
            snap.busy && React.createElement('div', { className: 'dcm-busy' }, L('切换中…', 'Switching…')),
          ), document.body),
        )
      }

      // ---------- registration ----------
      var disposers = []
      var slots = ctx.get('slots')
      if (slots !== undefined) {
        disposers.push(ctx.effect(function () {
          return slots.inject('conversation.session.header.actions', function () {
            // Reusing the shipped id "agent-preset" puts us in the built-in
            // label's cell, replacing the read-only label with this menu. The
            // registry keys list cells by (id, priority) and refuses a
            // duplicate id at the SAME priority; the LOWEST priority wins the
            // cell — so a priority strictly below the built-in's default 0
            // both avoids the collision and guarantees we shadow the label.
            return slots.register({
              name: 'conversation.session.header.actions',
              id: 'agent-preset',
              priority: -10,
              order: -10,
            }, ModeSwitchAction)
          })
        }))
      }

      return function () {
        for (var i = 0; i < disposers.length; i++) {
          try { disposers[i]() } catch (err) { /* best effort */ }
        }
        if (styleTag !== null && styleTag.parentNode !== null) styleTag.parentNode.removeChild(styleTag)
      }
    }

    exports.apply = apply
    exports.inject = ['slots', 'remote', 'remote.agentPresets']
    return module.exports
  },
})
