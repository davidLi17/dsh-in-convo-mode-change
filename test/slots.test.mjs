// Regression test for the boot failure the first install hit: registering a
// list-slot entry with an id that already exists at the SAME priority throws
// ("list slot ... already has an entry with id ... at priority 0"), which
// failed the whole client plugin at load. The fix registers at a strictly
// lower priority, which both avoids the collision and wins the cell
// ("lowest renders").
//
// This test drives the REAL SlotCore from @deepseek-ai/dsh-client-ui-slots
// (a pure ESM module, no DOM), so it exercises the exact production registry.
// Run from the plugin directory: node test/slots.test.mjs

import { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";

let failures = 0;
function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} ${extra}`);
  }
}

// Build the same topology the running app has: ui-conversation declares the
// header-actions seat through its root entry's children table, then
// ui-agent-preset registers the read-only label at the default priority 0.
function makeRegistry() {
  const core = new SlotCore();
  core.register(
    {
      name: "root",
      id: "ui-conversation",
      children: {
        "conversation.session.header.actions": { kind: "list", scope: "session" },
      },
    },
    () => "conversation-root"
  );
  // The built-in label (ui-agent-preset): id "agent-preset", order -10,
  // priority unset → 0.
  core.register(
    { name: "conversation.session.header.actions", id: "agent-preset", order: -10 },
    () => "built-in-label"
  );
  return core;
}

// 1. The old behavior must throw: same id at the same priority.
{
  const core = makeRegistry();
  let threw = null;
  try {
    core.register({ name: "conversation.session.header.actions", id: "agent-preset", order: -10 }, () => "dup");
  } catch (error) {
    threw = error;
  }
  check("same (id, priority) duplicate is refused", threw !== null && /already has an entry with id "agent-preset"/.test(threw.message));
}

// 2. The fix: a strictly lower priority registers cleanly and wins the cell.
{
  const core = makeRegistry();
  let threw = null;
  let disposer = undefined;
  try {
    disposer = core.register({ name: "conversation.session.header.actions", id: "agent-preset", priority: -10, order: -10 }, () => "mode-switch");
  } catch (error) {
    threw = error;
  }
  check("lower-priority shadow registration does not throw", threw === null);
  const winners = core.entriesOfSlot("conversation.session.header.actions");
  check(
    "the cell renders only the shadowing entry",
    winners.length === 1 && winners[0].component() === "mode-switch"
  );
  disposer?.();
  const after = core.entriesOfSlot("conversation.session.header.actions");
  check("disposing the shadow restores the built-in label", after.length === 1 && after[0].component() === "built-in-label");
}

// 3. The real registration order is irrelevant: whichever priority wins is
//    decided by value, not by who registered first.
{
  const core = new SlotCore();
  core.register(
    {
      name: "root",
      id: "ui-conversation",
      children: {
        "conversation.session.header.actions": { kind: "list", scope: "session" },
      },
    },
    () => "conversation-root"
  );
  // Plugin registers FIRST (the load-order that made the original bug
  // ambiguous), then the built-in registers after it — the built-in at
  // priority 0, the plugin at -10.
  core.register({ name: "conversation.session.header.actions", id: "agent-preset", priority: -10, order: -10 }, () => "mode-switch");
  let threw = null;
  try {
    core.register({ name: "conversation.session.header.actions", id: "agent-preset", order: -10 }, () => "built-in-label");
  } catch (error) {
    threw = error;
  }
  check("built-in label still registers fine at its own priority", threw === null);
  const winners = core.entriesOfSlot("conversation.session.header.actions");
  check("plugin entry wins regardless of registration order", winners.length === 1 && winners[0].component() === "mode-switch");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log("\nall slots-registry regression tests passed");
