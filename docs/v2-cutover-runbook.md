# OpenCode V1 -> V2 cutover runbook (oc-sisyphus)

Staged by fm/oc-v2-adapt (2026-10-20) from sandbox-proven evidence.
Everything in this file executes ONLY on the captain's word.
The ship itself never flips anything live; every step below is a live-desk action.
Times assume a healthy machine; free RAM matters (sandbox probes failed once under tmpfs exhaustion).

## What already landed V1-safe (pre-cutover, on main via the PR)

- sisyphus-gates dual entry: `dist/index.js` stays byte-identical (V1 path), `plugins/sisyphus-gates.js` auto-discovery shim carries the V2 `setup(ctx)` definition.
- `scripts/v2-enforcement-proof.sh [version]` — the hard-gate prover for either generation.
- `opencode.json` carries `permission.external_directory: {"*": "ask"}` (V1 object form; V2 normalizes it to the prescribed ask rule).
- `.gitignore` covers `/cli.json` and `/service.json`.
- omo stays pinned at 4.19.4 in `opencode.json` and `package.json`; no variant changes are staged (omo 5.1.40 parses our 4.19.4-shaped variants but does not activate agents under V2 — see the omo posture section).

## A. Preconditions (before the captain window)

1. The fm/oc-v2-adapt PR is merged and the live tree is deployed through the repo's own flow (`git -C ~/.config/opencode pull` after merge).
2. Run the V1 enforcement proof once on the deployed tree: `bash ~/.config/opencode/scripts/v2-enforcement-proof.sh 1.18.31` — must print `verdict: PASS`.
3. If the machine is RAM-tight, export `SCRATCH_ROOT=~/.cache/ocv2-scratch` first (tmpfs exhaustion broke sandbox runs once; disk-backed scratch works).

## B. Field clearing (captain window, ~2 min)

1. Close the live V1 session; no `opencode` process should remain (`pgrep -af opencode`).
2. Confirm port 49374 is free (`ss -tlnp | grep 49374` — empty).
3. DB backup BEFORE anything else: `cp ~/.local/share/opencode/opencode.db ~/.local/share/opencode/opencode.db.pre-v2` then `md5sum` both and record the digest.
4. Snapshot config state: `git -C ~/.config/opencode status --short` (only gitignored artifacts expected) and confirm `~/.local/share/opencode/auth.json` is intact.

## C. Flip + verification battery (~10 min)

1. Pre-seed the service-off posture BEFORE the first V2 launch: `echo '{"disabled": true}' > ~/.config/opencode/service.json`.
   This is the verified WI-4 default-off: clients then use private per-command servers, no fixed-port daemon.
2. Flip the two pins (machine state, not repo):
   - `~/.config/mise/config.toml`: `[tools] opencode = "2.1.0"`.
   - `~/.local/bin/opencode` wrapper: `exec mise x "opencode@2.1.0" -- "$@"` (keep `MISE_MINIMUM_RELEASE_AGE` as-is).
3. Launch `opencode` once interactively; expect `cli.json` to auto-migrate from `tui.json` (which must remain untouched) and `service.json` to keep `disabled: true`.
4. Models: `opencode models` lists the roster including the built-in free line.
5. Credentials: providers from `auth.json` appear (`opencode auth` / provider list); no re-login should be needed (compatibility decoders).
6. Agents: `opencode debug agents` — expect the file-based fleet agents (archivist, athena, auditor, explorer, fullstack-dev-tester, oracle, post-reviewer, reviewer) and built-ins.
   The omo agents (Sisyphus, Prometheus, Atlas) are EXPECTED to be absent under V2 — see the omo posture section before flipping.
7. Permissions: an out-of-project read in a headless `opencode run` must come back ask/auto-rejected (the external_directory rule firing — verified behavior in the sandbox).
8. MCP: the server log shows `mcp connected` for `home` (14 tools) and `codegraph` (1 tool).
9. GATES ENFORCEMENT PROOF — hard gate, do not skip: `bash ~/.config/opencode/scripts/v2-enforcement-proof.sh 2.1.0` — must print `verdict: PASS` (loads once, canary write blocked, file absent).
   If it does not: abort and roll back (D); the port is not done.
10. Smoke: one herdr pane round-trip; one low-stakes real session.

## D. Rollback (proven 2026-10-20)

1. If the service was ever enabled: `opencode service stop`.
2. Revert both pins to `1.18.31` (config.toml + wrapper).
3. Relaunch V1; it ignores `cli.json`/`service.json`.
4. Post-rollback hygiene: mv-aside `cli.json`/`service.json` per the superseded-copy protocol and take the captain's deletion word; never rm live-tree files unilaterally.
5. The DB backup from B3 is the floor if anything ever touches the store.

## Omo posture (read before flipping — captain decision)

- omo 5.1.40 (npm latest) loads under V2 but its own startup notice says agents/tools/hooks are NOT active there ("OpenCode 2 support is limited: the plugin loads, but its agents, tools and hooks are not active here"); the upstream path for full omo is the standalone OmO Native product.
- Therefore at cutover `default_agent: "sisyphus"` dangles and sessions fall back to `build` unless one of:
  - the captain accepts build as the interim default agent;
  - an in-house `agents/sisyphus.md` port is authored first (omo's sisyphus agent is dynamically generated; a faithful port is its own project, not staged here);
  - cutover waits for an omo release that activates agents under V2.
- The variant files (omo.ddd.jsonc / omo.tnt.jsonc) need no shape change for 5.x (verified: the 4.19.4 shape registers the full roster under omo 5.1.40's V1 path), but they only matter while a V1-or-standalone omo consumes them.
- Fallback note for any future omo 5 adoption: `runtime_fallback` must sit at the omo.jsonc ROOT in 5.x (it defaults to disabled there), and the retry classifier matches error-message patterns (rate limit, quota, overloaded, try again, 429/503/529), not raw status codes.
- No hardcoded cross-provider fallback ladder was observed in any 5.1.40 probe: unavailable heads skipped agent registration and configured heads stayed ours through retries.

## TNT parity

After ddd soaks a few days, replay this runbook on TNT (oc-sisyphus twin, same repo, same pins) through the lane-file + md5 convention.

## Known loose ends (post-cutover cleanup, captain word each)

- `tui.jsonc` is inert-by-precedence on both generations (V1 binary never reads it; V2's migration takes tui.json only) — deletion candidate per the superseded-copy protocol.
- The `/tmp` sandbox litter from the adaptation probes (several oc-adapt-proof/omo5 sandboxes) needs a captain-word recursive clear; the recursive-rm seatbelt rightly blocks agents from doing it.
- If the V2 pin is ever moved past 2.1.0, re-verify single-load of plugins/sisyphus-gates.js (a fixed config-object route could double-load the gate alongside auto-discovery).
