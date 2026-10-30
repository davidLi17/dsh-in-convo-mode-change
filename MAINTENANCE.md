# Maintenance record

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
