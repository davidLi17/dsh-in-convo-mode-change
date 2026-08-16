// Smoke test for the client half (lib/client.js): verifies the module-loader
// bundle registers, apply() wires the slots seat + remote event subscription,
// and the cleanup path disposes everything. The React component itself is not
// rendered here (that needs a DOM); it is exercised in the browser.
// Run from the plugin directory: node test/client.test.mjs

import { readFileSync } from "node:fs";
import vm from "node:vm";

let failures = 0;
function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} ${extra}`);
  }
}

// ---------- capture the module-loader registration ----------
let loaderRecord = undefined;
const loadedFactories = new Map();
const fakeWindow = {
  __ModuleLoader__: {
    load(record) {
      loaderRecord = record;
      loadedFactories.set(record.id, record.factory);
    },
  },
};

const fakeDocument = {
  head: { appendChild() {} },
  createElement(tag) {
    const el = { tagName: tag, textContent: "", parentNode: null };
    Object.defineProperty(el, "textContent", {
      get() {
        return this._text;
      },
      set(value) {
        this._text = value;
      },
    });
    return el;
  },
};

// ---------- fake ctx ----------
function makeFakeCtx() {
  const calls = {
    injectSeat: undefined,
    registerOptions: undefined,
    registerComponent: undefined,
    remoteEvent: undefined,
    noteAgentPreset: [],
    disposers: [],
  };
  const slots = {
    inject(seat, factory) {
      calls.injectSeat = seat;
      calls.registerFactory = factory;
      return () => calls.disposers.push("slots-inject");
    },
    register(options, component) {
      calls.registerOptions = options;
      calls.registerComponent = component;
      return () => calls.disposers.push("slots-register");
    },
  };
  const remote = {
    $on(event, handler) {
      calls.remoteEvent = event;
      calls.remoteHandler = handler;
      return () => calls.disposers.push("remote");
    },
  };
  const sessions = {
    noteAgentPreset(sessionId, agentPreset) {
      calls.noteAgentPreset.push([sessionId, agentPreset]);
    },
  };
  const api = {
    agentPresets: {
      async list() {
        return {
          result: {
            ok: true,
            value: {
              presets: [
                { id: "standard", trust: "system", isDefault: true },
                { id: "minimal", trust: "system" },
                { id: "my-custom", trust: "user", name: "My agent", description: "A copy" },
                { id: "broken", trust: "user", broken: "the composition is not valid YAML" },
              ],
            },
          },
        };
      },
    },
  };
  const ctx = {
    get(name) {
      if (name === "slots") return slots;
      if (name === "connection") return { api };
      if (name === "remote") return remote;
      if (name === "sessions") return sessions;
      return undefined;
    },
    effect(fn) {
      const result = fn();
      return () => {
        if (typeof result === "function") result();
      };
    },
  };
  return { ctx, calls };
}

// ---------- run the bundle ----------
const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const sandbox = {
  window: fakeWindow,
  document: fakeDocument,
  navigator: { language: "en-US" },
  console,
  setTimeout,
  clearTimeout,
  fetch: async () => {
    throw new Error("fetch should not be called in this smoke test");
  },
  Node: class Node {},
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "client.js" });

check("bundle registered with the loader", loaderRecord !== undefined && loaderRecord.id === "dsh-in-convo-mode-change");

const moduleExports = loaderRecord.factory((specifier) => {
  if (specifier === "react") return {};
  throw new Error(`unexpected require("${specifier}")`);
});
check("exports.apply is a function", typeof moduleExports.apply === "function");
check(
  "exports.inject declares the services",
  JSON.stringify(moduleExports.inject) === JSON.stringify(["slots", "connection", "remote", "sessions"])
);

// ---------- apply() wiring ----------
const { ctx, calls } = makeFakeCtx();
const cleanup = moduleExports.apply(ctx);

check("slots seat injected", calls.injectSeat === "conversation.session.header.actions");
check("register factory present", typeof calls.registerFactory === "function");

const registerDisposer = calls.registerFactory();
check("register disposer returned by factory", typeof registerDisposer === "function");
check("replaces the shipped agent-preset cell", calls.registerOptions !== undefined && calls.registerOptions.id === "agent-preset");
check("shadows at a priority below the built-in's 0", calls.registerOptions !== undefined && calls.registerOptions.priority === -10);
check("keeps the label's order", calls.registerOptions !== undefined && calls.registerOptions.order === -10);
check("renders a component", typeof calls.registerComponent === "function");

check("remote event subscribed", calls.remoteEvent === "agent-preset/selected");
calls.remoteHandler("session-1", "minimal");
check(
  "remote selection updates the sessions store",
  calls.noteAgentPreset.length === 1 && calls.noteAgentPreset[0][0] === "session-1" && calls.noteAgentPreset[0][1] === "minimal"
);

cleanup();
check("cleanup disposes slot registration", calls.disposers.length === 2);

// ---------- summary ----------
if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log("\nall client wiring tests passed");
