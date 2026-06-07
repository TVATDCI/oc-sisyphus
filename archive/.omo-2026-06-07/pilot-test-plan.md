---
title: "Sisyphus Pilot Test Plan"
type: pilot-test
date_created: 2026-05-21
status: draft
---

# Sisyphus Pilot Test Plan

## Objective

Validate the hybrid OpenCode + Pi architecture on a real project before full migration.
Measure credit efficiency, governance enforcement, and review quality.

---

## What We're Testing

| Component | What Changed | Why |
|---|---|---|
| **sisyphus-gates plugin** | New — blocks tools until gates pass | Governance enforcement without subagent spawning |
| **reviewer agent** | Combined oracle + auditor + post-reviewer | Reduce from 3 review agents to 1 |
| **explorer agent** | Combined athena + research | Reduce from 2 research agents to 1 |
| **MCP servers** | Dropped 2 (GitHub), kept 1 (myfiles) | Cut schema overhead by 66% |
| **Session model** | One main session per project (not per-phase) | 75% cache discount on stable prefix |

---

## Pilot Project Selection

**Criteria:**
- Small-to-medium scope (1-2 days of work)
- Clear acceptance criteria
- No UI/taste decisions (AFK-friendly)
- Existing codebase to explore (not greenfield)

**Suggested candidates:**
- Add a new API endpoint with tests
- Refactor a module with existing test coverage
- Add a feature to an existing CRUD module

---

## Metrics to Track

### 1. Call Count (Primary Metric)
| Metric | Target | How to Measure |
|---|---|---|
| Total API calls per project | < 150 | Check Kimi dashboard or `/usage` |
| Calls per phase | Track individually | Log at each phase transition |
| Subagent calls | < 5 total | Count reviewer/explorer invocations |

**Why:** Allegretto gives ~300-1,200 calls per 5-hour window. Target is < 150 to leave room for 2+ projects per cycle.

### 2. Cache Behavior
| Metric | Target | How to Measure |
|---|---|---|
| Cache hit rate | > 60% | Check Kimi API response headers (`x-cache-hit`) |
| Compaction count | ≤ 3 per project | Track `/compact` invocations |
| Session resets | 0 (one session only) | Verify no new sessions created mid-project |

**Why:** 75% cache discount is the biggest cost saver. Compaction changes the prefix and reduces cache reuse.

### 3. Gate Enforcement
| Metric | Target | How to Measure |
|---|---|---|
| Gates triggered | ≥ 2 (PRD + Plan) | Check plugin logs / system prompt output |
| False blocks | 0 | Did the plugin block something it shouldn't have? |
| Gate bypasses | 0 | Did the model skip a gate without approval? |

**Why:** Governance is the core value proposition. If gates don't work, the architecture fails.

### 4. Review Quality
| Metric | Target | How to Measure |
|---|---|---|
| Blockers found | ≥ 1 (real issue) | Did reviewer catch something important? |
| False positives | < 3 | How many warnings were actually fine? |
| Review time | < 10 calls | How many API calls did review consume? |

**Why:** Combined reviewer agent must be as effective as 3 separate agents.

### 5. Credit Efficiency
| Metric | Target | How to Measure |
|---|---|---|
| Credits per project | < 20% of 7-day quota | Check Kimi subscription dashboard |
| Credits per call | Track average | Credits used ÷ total calls |
| Unused credits at cycle end | < 30% | Credits should be used, not wasted |

**Why:** Allegretto's 7-day refresh means unused credits are lost. Target is efficient usage without waste.

---

## Success Criteria

### Must Pass (Blocking)
- [ ] Total calls < 150 per project
- [ ] Both governance gates triggered (PRD + Plan)
- [ ] No gate bypasses (model didn't skip a gate)
- [ ] Reviewer found at least 1 real issue
- [ ] Build/tests pass after implementation
- [ ] Credits used < 50% of 7-day quota

### Should Pass (Quality)
- [ ] Cache hit rate > 60%
- [ ] Compaction ≤ 3 times
- [ ] Review false positives < 3
- [ ] Subagent calls < 5 total
- [ ] Plugin didn't cause any false blocks

### Nice to Have
- [ ] Credits used > 40% (efficient, not wasteful)
- [ ] Explorer agent used for codebase exploration
- [ ] Session completed without errors or retries

---

## Test Procedure

### Step 0: Setup (Before Pilot)
1. Install sisyphus-gates plugin:
   ```bash
   cd ~/.config/opencode/plugins/sisyphus-gates
   npm install
   ```
2. Add plugin to `opencode.json`:
   ```json
   "plugin": ["oh-my-openagent@latest", "sisyphus-gates@latest"]
   ```
3. Remove GitHub MCP servers from `opencode.json` (keep only `myfiles`)
4. Verify `gh` CLI is authenticated: `gh auth status`
5. Move GitHub PAT from `opencode.json` to env var (if not already done)

### Step 1: Pilot Execution
1. Start a **single OpenCode session** for the pilot project
2. Follow the Sisyphus workflow:
   - Discovery → PRD → Momus PRD Review → Issue Creator → Plan → Momus Plan Review → Wave → Validate → Close
3. Log metrics at each phase transition
4. Use `reviewer` agent for gate reviews (not separate oracle/auditor)
5. Use `explorer` agent for codebase exploration (not athena)

### Step 2: Post-Pilot Analysis
1. Check Kimi dashboard for credit usage
2. Review session logs for gate triggers
3. Count API calls, compactions, subagent invocations
4. Assess review quality (did reviewer catch real issues?)
5. Compare against success criteria

### Step 3: Decision
| Result | Action |
|---|---|
| All Must Pass + ≥ 3 Should Pass | **Proceed with full migration** |
| All Must Pass + < 3 Should Pass | **Tweak and re-test** |
| Any Must Pass failed | **Debug, fix, re-test** |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Plugin blocks legitimate tool calls | Test plugin on a throwaway project first |
| Cache hit rate too low | Reduce compaction frequency, keep session stable |
| Reviewer misses issues | Keep oracle as fallback for complex reviews |
| Credits run out mid-project | Monitor usage, pause if > 70% consumed |
| Plugin causes session errors | Remove plugin from config, revert to baseline |

---

## Logging Template

Copy this for each pilot run:

```markdown
## Pilot Run: {project name}
Date: {date}

### Call Count
- Total calls: {N}
- Discovery: {N}
- PRD: {N}
- PRD Review: {N}
- Issue Creation: {N}
- Plan: {N}
- Plan Review: {N}
- Execution: {N}
- Validation: {N}
- Close: {N}

### Cache Behavior
- Cache hit rate: {N}%
- Compactions: {N}
- Session resets: {N}

### Gate Enforcement
- Gates triggered: {N} (PRD: {Y/N}, Plan: {Y/N})
- False blocks: {N}
- Gate bypasses: {N}

### Review Quality
- Blockers found: {N}
- False positives: {N}
- Review calls: {N}

### Credit Efficiency
- Credits used: {N}% of quota
- Credits per call: {N}
- Unused at cycle end: {N}%

### Verdict
- Must Pass: {N}/{N}
- Should Pass: {N}/{N}
- Decision: Proceed / Tweak / Debug
```
