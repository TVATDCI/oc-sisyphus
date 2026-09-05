# Sisyphus System Recovery Runbook

> **RECOVERY BASELINE COPY (2026-09-05) — staged in the oc-sisyphus repo.**
> The LIVE runtime copy is `~/.sisyphus/RECOVERY.md` and remains the
> authoritative state for the running system. This repo copy is the
> recovery baseline only: if the live file is lost, restore the live copy
> from this one. Do not treat this copy as the source of truth.

**Last updated:** 2026-06-06 (post-Wave-4 + Wave-4C CI/CD setup)
**Audience:** Operator/user of this OpenCode + Sisyphus system
**Use when:** The agent is misbehaving, gates are blocking legitimate work, state is corrupt, or you need to start fresh.

---

## 1. Quick Reference

| Problem | First action | If that fails |
|---------|--------------|---------------|
| Plugin blocking everything | `rm -f ~/.sisyphus/state.json` → restart | Restore plugin from snapshot |
| Tests failing | `cd ~/.config/opencode/plugins/sisyphus-gates && npm test` | Restore plugin from `~/.sisyphus/backups/` |
| Plugin behavior is wrong / unknown | `cd ~/.config/opencode/plugins/sisyphus-gates && npm run self-test` (Wave 4B) | See §13 Self-Test Harness; restore plugin from snapshot |
| Bad plugin release deployed, want quick rollback without git revert | Pin a known-good version in `opencode.json` (`sisyphus-gates@0.2.0`), restart | See §8 Procedure F; or use `git revert` for source-level fixes |
| Upstream (`oh-my-openagent`, `@opencode-ai/plugin`) released a new version | Run `node ~/.config/opencode/scripts/verify-plugin-compat.js` to see drift | Read GitHub release notes; update pin in `opencode.json` if compatible |
| State file corrupt | Plugin auto fail-closes (no action needed) | Delete state, re-run reviews |
| Agent using wrong model | Check `~/.config/opencode/oh-my-openagent.json` | Restore from `~/.sisyphus/backups/2026-06-05-pre-wave2/` |
| Lost all state | Restore from snapshot | Re-run Wave 0/1/2 steps |
| `~/.sisyphus/workflow.yaml` missing | Plugin fail-closes (W1.E) | Recreate from `~/.sisyphus/workflow.yaml` (only place it lives) |
| Gate verdict says PASS but should be FAIL | Check `<!-- SISYPHUS_GATE -->` block in review file | Re-run `/skill:momus-prd-reviewer` |
| Plugin API drift / unexpected upgrade | `node ~/.config/opencode/scripts/verify-plugin-compat.js` | Re-pin in `opencode.json`, restart opencode |
| Provider claim in docs conflicts with JSON | JSON is canon: `~/.config/opencode/oh-my-openagent.json` (5/17 on openrouter, 12/17 on opencode native) | Edit JSON, run `node ~/.config/opencode/scripts/verify-plugin-compat.js` |

## 2. Snapshots Available

```
~/.sisyphus/backups/
├── 2026-06-05-pre-wave0/      # opencode-config + sisyphus-live (full system)
├── 2026-06-05-pre-wave1/      # sisyphus-gates plugin (pre-refactor)
├── 2026-06-05-pre-wave1b/     # sisyphus-gates plugin (pre-verdict-parser)
├── 2026-06-05-pre-wave1c/     # sisyphus-gates plugin (pre-command-policy)
├── 2026-06-05-pre-wave1e/     # sisyphus-gates plugin (pre-yaml-loader)
├── 2026-06-05-pre-wave2/      # agents/ + sidecar + JSON canon
├── 2026-06-06-pre-wave4/      # sisyphus-gates plugin + RECOVERY.md (pre-Wave-4B)
└── 2026-06-06-pre-overview-cleanup/  # opencode-config tar.gz before pin + sidecar move
```

Plus `~/.config/opencode/.backups/omo-2026-06-05/` (archived `.omo/`, 24 files).

**Quarantine (not snapshots):** `~/.sisyphus/backups/stale-config-2026-06-06/` holds
2 stale config files moved out of `~/.config/opencode/` on 2026-06-06 (a 35-day-old
`oh-my-openagent.json.backup-2026-05-02T17-29-14-803Z` and a deprecated
`scripts/validate-skills-v1.sh.bak`). Delete after forensic review.

## 3. Procedure A — Reset Plugin State

When sisyphus-gates is blocking everything or state is corrupt:

```bash
# 1. Stop any running opencode sessions
# 2. Remove the state file
rm -f ~/.sisyphus/state.json
rm -rf ~/.sisyphus/projects/   # if per-project state is corrupted
# 3. Re-run reviews to re-establish gates
#    (use /skill:momus-prd-reviewer and /skill:momus-plan-reviewer)
# 4. Restart opencode
```

**Note:** The plugin is designed to fail-closed when state is missing. After the reset, gates will block writes/commits until reviews re-establish PASS verdicts.

## 4. Procedure B — Restore Plugin Code

When the plugin code is broken (tests fail, plugin won't load):

```bash
# Pick the most recent snapshot
SNAP=~/.sisyphus/backups/2026-06-05-pre-wave1e/sisyphus-gates-pre-wave1e.tar.gz

# Restore
mkdir -p /tmp/sg-restore
tar -xzf "$SNAP" -C /tmp/sg-restore
# Tar archive structure: sisyphus-gates/* (relative to ~/.config/opencode)
cp -r /tmp/sg-restore/sisyphus-gates/* ~/.config/opencode/plugins/sisyphus-gates/
cd ~/.config/opencode/plugins/sisyphus-gates && npm install  # if node_modules was lost
npm test  # verify
```

Expected: 165/165 tests pass in ~400ms.

## 5. Procedure C — Restore Agent Routing

When agents use wrong models or `model:` lines are missing from `agents/*.md` (Wave 2 enforced JSON canon):

```bash
# Restore JSON canon
cp ~/.sisyphus/backups/2026-06-05-pre-wave2/oh-my-openagent-pre-wave2.json \
   ~/.config/opencode/oh-my-openagent.json

# Restore the 7 agents/ that were stripped of model:
mkdir -p /tmp/agents-restore
tar -xzf ~/.sisyphus/backups/2026-06-05-pre-wave2/agents-pre-wave2.tar.gz \
  -C /tmp/agents-restore
# Archive structure: agents/*.md
cp /tmp/agents-restore/agents/*.md ~/.config/opencode/agents/

# Verify
node -e "const j=require('~/.config/opencode/oh-my-openagent.json'); console.log('agents:', Object.keys(j.agents).length)"
ls ~/.config/opencode/agents/
```

## 6. Procedure D — Full System Restore

When everything is broken and you need a clean slate:

```bash
SNAP=~/.sisyphus/backups/2026-06-05-pre-wave0/

# Restore opencode config
mkdir -p ~/.config/opencode
tar -xzf "$SNAP/opencode-config.tar.gz" -C ~/.config/opencode

# Restore sisyphus state
mkdir -p ~/.sisyphus
tar -xzf "$SNAP/sisyphus-live.tar.gz" -C ~/.sisyphus

# Restore sisyphus-gates plugin (most recent W1 snapshot)
SNAP1E=~/.sisyphus/backups/2026-06-05-pre-wave1e/sisyphus-gates-pre-wave1e.tar.gz
mkdir -p /tmp/sg-restore
tar -xzf "$SNAP1E" -C /tmp/sg-restore
cp -r /tmp/sg-restore/sisyphus-gates/* ~/.config/opencode/plugins/sisyphus-gates/

# Restore Wave 2 JSON canon
cp ~/.sisyphus/backups/2026-06-05-pre-wave2/oh-my-openagent-pre-wave2.json \
   ~/.config/opencode/oh-my-openagent.json

# Verify
cd ~/.config/opencode/plugins/sisyphus-gates && npm test
node -e "import('./dist/index.js').then(m => console.log('plugin loads:', typeof m.server === 'function'))"
```

## 7. Procedure E — Roll Back to a Specific Wave

| To roll back to | Restore |
|-----------------|---------|
| Pre-Wave-1 (W1.A baseline) | `2026-06-05-pre-wave1/sisyphus-gates-pre-wave1.tar.gz` |
| Pre-Wave-1B (verdict parser) | `2026-06-05-pre-wave1b/sisyphus-gates-pre-wave1b.tar.gz` |
| Pre-Wave-1C (command policy) | `2026-06-05-pre-wave1c/sisyphus-gates-pre-wave1c.tar.gz` |
| Pre-Wave-1E (yaml loader) | `2026-06-05-pre-wave1e/sisyphus-gates-pre-wave1e.tar.gz` |
| Pre-Wave-2 (JSON canon) | `2026-06-05-pre-wave2/oh-my-openagent-pre-wave2.json` + `agents-pre-wave2.tar.gz` |
| Pre-Wave-4 (self-test harness) | `2026-06-06-pre-wave4/sisyphus-gates-pre-wave4.tar.gz` + `RECOVERY-pre-wave4.md` |

## 8. Procedure F — Roll Back the Plugin via Version Pin (no snapshot needed)

When the deployed plugin is wrong but git main is fine (e.g., a tagged release is bad, or the running clone is from an older commit), the fastest rollback is to pin a previous version in `opencode.json`. This is the **Layer 2 rollback** from the 4C design — between `git revert` (Layer 1, seconds) and disk-snapshot restore (Layer 3, 10-30 min).

```bash
# 1. Identify the bad version (e.g., the last `npm run install:hooks` or
#    tag-push that broke things)
BAD_VERSION="0.3.0"   # whatever the broken release was

# 2. Edit opencode.json to pin to a known-good prior version
#    Before: "plugin": ["oh-my-openagent@4.7.5", "sisyphus-gates@latest"]
#    After:  "plugin": ["oh-my-openagent@4.7.5", "sisyphus-gates@0.2.0"]
node -e "
  const fs = require('fs');
  const j = JSON.parse(fs.readFileSync('$HOME/.config/opencode/opencode.json','utf8'));
  j.plugin = j.plugin.map(p => p.replace(/^sisyphus-gates@.*/, 'sisyphus-gates@0.2.0'));
  fs.writeFileSync('$HOME/.config/opencode/opencode.json', JSON.stringify(j, null, 2) + '\n');
"

# 3. Verify the pin is valid
node ~/.config/opencode/scripts/verify-plugin-compat.js
#    Expected: STATUS OK or INFO for sisyphus-gates@0.2.0

# 4. Restart opencode — the new pin takes effect on next start
```

**When to use this instead of git revert:** Use the version pin when:
- The bad plugin version has already been **tagged and released** (reverting git doesn't un-tag a release)
- The running clone is on an older commit and you want to catch up to a known-good release tag
- You want the rollback to be **visible in `opencode.json`** (so future `verify-plugin-compat.js` runs continue to enforce it)

**When NOT to use this:** If main is broken, use `git revert`. If the local filesystem is corrupt, use a snapshot restore (§6).

**Documenting the rollback:** After pinning, add a one-line entry to `~/.sisyphus/evidence/` with the timestamp, the pinned version, and why. This becomes the audit trail for "when and why did we pin a specific plugin version."

## 9. Emergency Stop

If the agent is about to do something destructive:

1. **Immediate**: Send `/stop` (or kill the opencode process)
2. **Inspect**: `ls -la ~/.sisyphus/evidence/` to see what was just attempted
3. **Verify state**: `cat ~/.sisyphus/state.json | jq .` (or `python3 -m json.tool`)
4. **Roll back**: Use the appropriate snapshot from §2
5. **Postmortem**: Update `~/.config/opencode/plugins/sisyphus-gates/THREAT-MODEL.md` with the new attack class

## 10. When to Consult Oracle

The `oracle` agent (defined in `oh-my-openagent.json`) is for hard debugging. Use it when:
- Plugin behavior contradicts the threat model
- A bypass succeeded and you need a postmortem
- The phase machine gets stuck or transitions wrong
- Multi-project state collides unexpectedly
- The verdict parser returns wrong results

## 11. Maintenance Schedule

- **Weekly**: `ls -la ~/.sisyphus/evidence/` to scan for anomaly patterns
- **Monthly**: Verify all snapshots exist and tarballs are not corrupt
  ```bash
  for f in ~/.sisyphus/backups/*/*.tar.gz; do
    tar -tzf "$f" >/dev/null 2>&1 && echo "OK: $f" || echo "CORRUPT: $f"
  done
  ```
- **Per destructive change**: Take a new snapshot first
- **Per release**: Update `THREAT-MODEL.md` with new attack vectors and controls
- **Per `opencode.json` change**: Run `node ~/.config/opencode/scripts/verify-plugin-compat.js` to confirm pin is resolvable
- **Monthly**: Run `verify-plugin-compat.js` to detect any drift between pin and cache; rotate `~/.sisyphus/metrics/gate-events.jsonl` if > 1MB

## 12. Forensic Trail Locations

When investigating an incident:
- Plugin gate decisions: `output.args._sisyphus_gate_blocked` annotation
- Workflow YAML: `~/.sisyphus/workflow.yaml`
- State snapshots: `~/.sisyphus/state.json` (current) + `~/.sisyphus/projects/*/state.json` (per-project)
- Review files: `.sisyphus/notepads/*/momus-*-review*.md` (look for `<!-- SISYPHUS_GATE -->` blocks)
- Evidence: `~/.sisyphus/evidence/`
- Plan history: `~/.sisyphus/plans/`
- Boulder (active plan): `~/.sisyphus/boulder.json`
- Hotcache: `~/.sisyphus/hotcache.md`

## 13. Self-Test Harness (Wave 4B)

The plugin ships with an end-to-end self-test harness that boots the
full `server()` in sandboxed environments with synthetic state corruption
and verifies the opencode hooks actually block the right things. Use it
to verify the plugin is enforcing gates correctly — especially after
modifications to `src/gates.js`, `src/command-policy.js`,
`src/sudo-policy.js`, or `src/workflow-loader.js`.

```bash
cd ~/.config/opencode/plugins/sisyphus-gates
npm run self-test          # 15 end-to-end scenarios
npm test                   # 165 unit tests
npm run test:all           # both
```

**Expected output:** `15/15 scenarios PASS in <500ms` and
`165/165 pass 0 fail` from the unit tests.

**What the self-test covers (15 scenarios):**
- State file conditions: missing, corrupt, unknown gates, FAIL gate,
  pending approval, approved (destructive blocked, safe allowed)
- Workflow config: yaml missing, yaml invalid
- Catastrophic commands: `rm -rf /`, `dd if=`, `mkfs.*`,
  `git push --force origin main`
- Sudo: never allowed
- Recovery flow: end-to-end approved → corrupt → fail-closed → repair

**If self-test fails:**
1. Identify which scenario failed (the output names it).
2. Map to the corresponding source file (gates.js for fail-closed,
   command-policy.js for destructive, sudo-policy.js for sudo,
   workflow-loader.js for yaml).
3. Restore that file from `~/.sisyphus/backups/2026-06-05-pre-wave*/`
   or from the most recent pre-change snapshot.
4. Re-run `npm run self-test` to confirm.

See `~/.config/opencode/plugins/sisyphus-gates/test/self-test/README.md`
for full documentation and `test/self-test/scenarios.js` for the
scenario source.

## 14. Metrics (Wave 4D)

The plugin records every block event to an append-only JSONL file at
`~/.sisyphus/metrics/gate-events.jsonl`. Use the metrics to observe
how often gates are firing, which commands are blocked, and which
reasons are most common.

```bash
npm run metrics:summary    # Quick stats: count, by-subtype, top reasons
npm run metrics:clear      # Delete the metrics file (manual reset)
cat ~/.sisyphus/metrics/gate-events.jsonl | jq -c 'select(.event_subtype=="catastrophic")'
```

**Event shape (one JSON object per line):**

```json
{
  "timestamp": "2026-06-06T00:52:00.000Z",
  "event_subtype": "catastrophic",
  "sessionID": "ses_demo1",
  "tool": "bash",
  "phase": "execution",
  "reason": "Catastrophic command blocked in all phases (W1.C isAlwaysBlocked)",
  "command": "rm -rf /"
}
```

**event_subtype values** (auto-classified from the gate reason):
- `catastrophic` — `rm -rf /`, `dd if=`, `mkfs.*`, `git push --force origin main`, etc.
- `sudo` — any `sudo ...` command (never allowed)
- `fail-closed` — state missing/corrupt, gate unknown/FAIL, approval not approved, workflow.yaml missing/invalid
- `destructive` — non-catastrophic destructive commands blocked at the phase-specific layer

**What is NOT recorded in v1:**
- Allowed (non-blocked) tool calls
- Read-only tool calls
- Successful tool executions after the gate (the `tool.execute.after` hook doesn't emit metrics)

These are deliberately out of scope to keep the metrics file small
and focused on gate enforcement activity. A future enhancement
(§14+) could add a separate "activity" log for those.

**File rotation:**

The metrics file is append-only and unbounded. For a typical
single-user session, expect ~1KB/day. For long-running setups, add
a cron job to rotate:

```bash
# Daily rotation: keep 7 days
find ~/.sisyphus/metrics/ -name "gate-events.jsonl.*" -mtime +7 -delete
mv ~/.sisyphus/metrics/gate-events.jsonl ~/.sisyphus/metrics/gate-events.jsonl.$(date +%Y%m%d)
touch ~/.sisyphus/metrics/gate-events.jsonl
```

**Self-test coverage:**

Three self-test scenarios verify the metrics pipeline:
- `metrics-block-recorded` — block event is recorded with correct shape
- `metrics-allow-not-recorded` — safe commands are NOT recorded
- `metrics-multi-event-subtypes` — three distinct subtypes are classified correctly

See `test/self-test/scenarios.js` for the source.
