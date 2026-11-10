# Maintenance record

## 26.11.10-lhg (2026-11-10 UTC)

- Fork base: `0e7c92fe689c2f45b589a2ef365c19119ab465b7`.
  Upstream remains `jiangr100/dsh-in-convo-mode-change@238fa0899ec80194c13d64eaf245a168e5182f82`.
  Original MIT license and authorship retained; no upstream code update to merge.
- Official host source: [dsh-v0.2.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1),
  commit `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`.
  `packages/core/agent/src/index.ts` owns `turnBoundaryOf`; the official
  `packages/plan/plan-mode/src/index.ts` checks `openTurnStartSeq !== null`.
- Replace removed `session.events` usage with the host-owned boundary. Real npm
  rc.5 lacks that method and also lacks the old events field, so fallback uses its
  public `snapshotEvents()` instead. Preserve event-array support for older hosts.
  Unknown state, malformed state and state read exceptions fail closed.
- Tests now use real Session and AgentRegistry rather than an events-shaped fake.
  Preset fixtures adapt to rc.1's executor-based PTC while rc.5 uses presentAs.
  They verify stopped-switch, running refusal, untouched history, real registry
  errors and the next-turn run_code tool view, with no paid model call.
- Both rc.1 and rc.5: 37 host + 8 queue + 6 SlotCore + 15 client + 14 real host +
  8 React DOM = 88 checks. Mode-switch behavior and queue cleanup remain intact.
- Syntax, whitespace, package contents/import and official rc.1 CLI isolated Web
  profile local-tarball installation/config composition verified. No compilation
  step or GitHub Actions workflow exists. No package uploaded or npm published.
- Visual limitation: sandbox-enabled Chromium cannot create a local socket in
  this environment (Operation not permitted), including the authorized elevated
  execution attempt. Browser sandbox was not disabled. DOM geometry regression
  is not a user-desktop visual acceptance claim. Cross-client recompose/start
  race limitation remains as documented below.


## 26.10.31-lhg.2 (Asia/Shanghai 2026-10-31)

Local UI fix on top of b56049d103e2cc21ba96b01f98520eb7447f4e83; upstream remains
238fa0899ec80194c13d64eaf245a168e5182f82. MIT and original author retained.

The old 320px absolute menu was right-aligned inside the header. At left-side
anchors it extended outside the viewport and could be clipped/covered by sibling
conversation content. Render the menu into document.body using the host-provided
React DOM (rc.5 exposes react-dom in its module loader), with fixed positioning
and viewport clamping. Reposition on resize, captured scroll and panel/anchor size
changes. Portal-aware outside-click handling retains confirmation interactions.
No host switching, running guards, queue logic, permissions or official DSH code
changed. React DOM is an optional host peer, not bundled.

Verification: 70 existing host, queue, SlotCore, client and real rc.5 registry
checks pass. JavaScript is hand-written release code; no build transformation.
8 focused React DOM assertions with explicit geometry pass: body portal,
viewport clamping, resize/scroll anchoring, internal clicks, and close/unmount
resource cleanup. Existing switching tests are reused rather than duplicated.
The original client fails this portal regression (red/green). These are DOM
tests, not visual tests.
Official rc.5 isolated Web-profile local tarball installation passes. Shipped
files are checked against the package. A temporary Chromium fixture could not run in this execution environment; the existing cloud browser
could not reach the local fixture server. No Windows desktop or real-account UI
visual acceptance is claimed. No browser/security policy was weakened.


## 26.10.31-lhg (Asia/Shanghai 2026-10-31)

Upstream: https://github.com/jiangr100/dsh-in-convo-mode-change
Base commit: 238fa0899ec80194c13d64eaf245a168e5182f82 (Git ancestor, not just equivalent code).
Original author/license retained: jiangr100, MIT.

Changes:
- Keep the exact settled Promise stored in the per-session map and compare that
  same identity in finally. Successful and failed requests release their entry;
  an earlier request cannot remove a later queued request.
- Official DSH 0.2.1-rc.5 renamed the preset implementation and uses stable
  RemoteError codes rather than the old UnknownPresetError/PresetMountError
  classes. Remove the obsolete package import and map rc.5 not-found/invalid
  codes to the existing 404/422 response contract.
- Use rc.5 remote.agentPresets.list() and projectionValues.agentPreset; remove
  obsolete client selection events/store mutation and rely on host projections.
- Disable confirmation (and its click handler) when a turn starts with the
  confirmation dialog open. Host-side running and subagent guards remain.
- Make the test runner portable without deleting existing dependencies.

Verification:
- 27 host checks; 8 queue assertions; 6 official rc.5 SlotCore checks;
  15 client component/wiring checks; 14 real rc.5 registry integration checks.
- Queue regression with original Promise identity logic fails (retained map size
  1 rather than 0); patched logic passes, including success, failure, response
  exception and overlapping same-session requests.
- Real rc.5 registry/scope/loader/tools/prompt with minimal test compositions:
  running rejected; after turn/end switch standard/native to code/PTC; next-turn
  tool view is run_code; history preserved; missing/invalid preset errors mapped;
  switching back works. This uses no remote model or user account.
- JavaScript syntax checks, git diff whitespace check, npm packaging and isolated
  package installation/import checked.
  Shipped lib files are hand-written JavaScript: no generated build or native code.

Limits:
- Not tested in the user's desktop UI or with a live model; test compositions are
  deliberately small fixtures, not an end-to-end boot of all shipped presets.
- Does not hot-switch an executing turn or automatically stop/resume a task.
  Stop, wait for completion, switch, then send a continuation message.
- As upstream, switching is not an atomic lock against a new turn started from
  another client during asynchronous recomposition. Avoid simultaneous control.
- This is tested for rc.5; no claim of compatibility with older DSH releases.

