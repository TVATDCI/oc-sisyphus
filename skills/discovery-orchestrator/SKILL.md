---
name: discovery-orchestrator
description: "Turns vague or ambiguous user requests into a planning brief via social Q&A (one question at a time, max 7). (1) Use when the request is underspecified or scope is unclear. (2) Use when multiple interpretations are possible. (3) Use before any planning when the user has 'an idea' or wants to 'add a feature'. Triggers: 'I have an idea', 'help me think this through', 'this is fuzzy', 'not sure about scope', 'clarify requirements', 'ambiguous goal', 'grill me', 'stress-test this idea', 'I want to add', 'help scope this', 'explore this concept', 'vague request'. Not for: concrete well-defined tasks (use sisyphus-plan directly), single-file bug fixes, or work that already has a PRD or detailed spec."
compatibility: opencode
triggers:
  - "I have an idea"
  - "help me think this through"
  - "this is fuzzy"
  - "not sure about scope"
  - "discovery session"
  - "clarify requirements"
  - "what do I need"
  - "ambiguous goal"
  - "vague request"
  - "grill me"
  - "stress-test this idea"
  - "explore this concept"
  - "I want to build"
  - "I want to add"
  - "add a feature"
  - "add something"
  - "help scope this"
  - "make it better"
  - "improve this"
mode: human-in-loop
inputs:
  - "User request (required) — vague or ambiguous goal"
  - "project_root (optional) — defaults to ~/Main-vault"
outputs:
  - "Planning brief (structured alignment document)"
  - "Notepad log of discovery session"
  - "Handoff to sisyphus-plan for PRD creation"
produces_artifacts:
  - ".sisyphus/notepads/{name}/discovery-{timestamp}.md"
  - "Planning brief (ephemeral or kept in notepads)"
requires_artifacts:
  - "None — starts from user request"
gates:
  - "User approves brief: 'approved', 'looks good', 'create PRD', 'proceed'"
  - "User rejects or extends brief: more questions, different direction"
metadata:
  version: 1.0.0
  category: planning
  complexity: advanced
---

# Discovery Orchestrator

A social, conversational skill for turning vague ideas into actionable plans. This skill asks clarifying questions one at a time, inspects existing work, provides recommendations, and collaborates with the user to create a shared understanding before any planning begins.

## Identity & Scope

**Purpose:** Turn vague, ambiguous, or underspecified user requests into a planning brief that sisyphus-plan can consume.

**Triggers:** "I have an idea", "help me think this through", "this is fuzzy", "not sure about scope", "discovery session", "clarify requirements", "what do I need", "ambiguous goal", "vague request", "grill me", "stress-test this idea", "explore this concept", "I want to build", "I want to add", "add a feature", "help scope this", "make it better", "improve this"

**Not For:**
- Concrete, well-defined tasks ("Add dark mode toggle to the navbar" — use sisyphus-plan directly)
- Single-file bug fixes (skip discovery entirely)
- Tasks where the user has already provided a PRD or detailed spec

**Entry Criteria:**
- [ ] User request is vague, ambiguous, or underspecified
- [ ] Scope is unclear or multiple interpretations possible
- [ ] No validated brief exists for this initiative

**Produces:**
- Planning brief at `.sisyphus/notepads/{name}/discovery-{timestamp}.md`
- Shared understanding document with context, objectives, verification criteria
- Notepad log of discovery session
- If project involves UI: recommendation to create `DESIGN.md` in project root

**Next if Approved:**
- Brief approved → Delegate to `brief-loader` for validation before PRD creation

**Next if Rejected:**
- Brief rejected or incomplete → Continue discovery session, ask more clarifying questions
- User changes direction → Restart discovery with new requirements

**Handoff Contract:**
```
discovery-orchestrator (produces brief)
  ↓
brief-loader (validates brief completeness)
  ↓
prd-writer (creates PRD from validated brief)
```

**Skill Usage:**
This skill is loaded via `load_skills` into category-routed tasks:
```typescript
task(
  category="deep",            // or "ultrabrain" for maximum reasoning depth
  load_skills=["discovery-orchestrator"],
  prompt="User wants to add search to wiki. Start discovery session."
)
```

**Category routing:** The framework automatically selects an appropriate reasoning model. Do not micromanage subagent model selection.

## Hard Constraints (NEVER/MUST)

**One question at a time.** Never batch 3+ questions. Each answer shapes the next question.

**Inspect first, ask second.** Always check existing artifacts (plans, codebase, notepads) before asking the user. If the answer is discoverable from artifacts, don't ask.

**Stop at sufficiency.** Don't over-analyze. Stop when Context + Work Objectives + Verification + first execution wave can be filled.

**Maximum 7 questions.** If still unclear after 7, suggest breaking into smaller initiatives or scheduling a follow-up. No "just one more question."

**HARD STOP after Phase 4 brief presentation.** After presenting the brief to the user, you MUST STOP and WAIT. Do NOT proceed to Phase 5 (handoff to sisyphus-plan), do NOT create any files beyond the notepad brief, do NOT start any implementation, and do NOT invoke sisyphus-plan until the user explicitly responds with "approved", "looks good", "create PRD", "proceed", "plan this", or similar approval phrase.

**This is a HARD STOP — not a suggestion.**

**Boundaries (NEVER violate):**
- Do NOT create PRDs (hand off to sisyphus-plan for formal planning)
- Do NOT execute code (discovery is purely conversational and investigative)
- Do NOT deep-dive into codebase (read first 20-30 lines only; if more research needed, recommend athena-research skill)
- Do NOT write execution plans (brief only; sisyphus-plan creates the plan)
- Do NOT ask more than 7 questions
- Do NOT delegate to subagents (Task tool: NEVER — this skill IS the discovery orchestrator; handoff to sisyphus-plan only after brief approval)

**Social intelligence for all models:**
- Provide recommendations with each question — don't ask blank open-ended questions. Offer a specific suggestion the user can accept, modify, or reject.
- Sequence questions by value: scope-defining first, constraint second, clarification third, nice-to-know last.
- After 2 unanswered questions, summarize what you know and ask: "Based on what you've shared, I'm thinking [summary]. Should I proceed with this understanding, or do you want to clarify first?"

**Quick-start shortcut (when user says "just do whatever you think is best"):** Ask ONE specific question with strong recommendation. If they defer again, make the decision and note it in brief as "User deferred — chosen based on [rationale]."

## Core Workflow (Summary)

The 5 phases of a discovery session — see `## Detailed Phases` below for step-by-step procedures.

1. **Phase 1: Intent Parsing (Silent)** — Classify ambiguity signals, extract 2-5 topics, score ambiguity 1-6+
2. **Phase 2: Artifact Inspection (Silent)** — Scan existing plans, codebase (first 20-30 lines), beads before asking user
3. **Phase 3: Question Design (Conversational)** — Ask minimum questions (max 7), one at a time, with recommendations
4. **Phase 4: Brief Assembly** — Write planning brief, save to notepad, present to user, HARD STOP for approval
5. **Phase 5: Handoff** — On user approval, delegate to sisyphus-plan with brief path

**When to use:** "I have an idea", "this is fuzzy", "help me think this through", "discovery session", "I want to build", any ambiguous request.
**When to skip:** Concrete well-defined tasks, single-file bug fixes, user has provided PRD or spec.

## Tool Usage

- **Bash tools**: `ls`, `grep`, `wc` for lightweight artifact scanning (first 20-30 lines only)
- **Read tools**: Read existing PRDs/plans/notepads for context (selective, not exhaustive)
- **Write tools**: Save discovery brief to notepad directory
- **Question tool**: REQUIRED — this skill IS about asking user questions
- **Task tool**: NEVER delegate — this skill IS the discovery orchestrator; handoff to sisyphus-plan only after brief approval

## Integration with sisyphus-plan

This skill is the **Discovery Mode** entry point in the workflow architecture:

```
User: "I want to make the wiki better"
  ↓
discovery-orchestrator (category="deep")
  → Phase 1: Parse intent (ambiguity score = 5)
  → Phase 2: Inspect artifacts (finds existing wiki PRD, notepad about navigation confusion)
  → Phase 3: Ask questions (3-5 questions with recommendations)
  → Phase 4: Assemble brief (Context, Objectives, Verification, first wave)
  → User: "approved"
  ↓
sisyphus-plan (category="quick" or "unspecified-low")
  → Workflow 1b: Create PRD from approved brief
  → Checkpoint 1: momus-prd-reviewer (category="deep") validates PRD
  → Workflow 1c: Break into issues
  → Workflow 1: Create execution plan
  → Checkpoint 2: reference-checker (category="unspecified-low") verifies no conflicts
  → Execution: Slices run by sisyphus-plan executor
```

**Note:** Categories route to appropriate models automatically. Do not specify model names in skill delegation.

## Edge Cases

| Error | Action |
|-------|--------|
| User says "just do whatever you think is best" | Ask ONE specific question with strong recommendation. If they defer again, make the decision and note it in brief as "User deferred — chosen based on [rationale]." |
| No existing artifacts found | Note "Greenfield — no prior work" in brief. Ask standard discovery questions. |
| User contradicts themselves across answers | Note contradictions in brief. Ask: "I want to make sure I understand — earlier you said X, now Y. Which matters more for this phase?" |
| User asks for something outside project scope | Note scope boundary in brief. Suggest: "This sounds like [other project]. Should I focus on [current scope] or switch contexts?" |
| User wants to skip discovery and go straight to code | Warn: "I can start, but without clarifying scope there's a high risk of rework. One quick question: [most critical ambiguity]. Then I'll build." |
| Artifacts inspection reveals active plan on same topic | Note in brief: "Active plan found: [plan name]. Recommend completing or closing before starting new initiative." Ask user. |
| Beads command fails | Note "beads unavailable" and continue with directory scans only. |
| User doesn't respond to questions | After 2 unanswered questions, summarize what you know and ask: "Based on what you've shared, I'm thinking [summary]. Should I proceed with this understanding, or do you want to clarify first?" |

## Scoring Reference

For skill validation, a good discovery session scores high on:
- **Efficiency**: ≤5 questions to reach clarity (for moderately ambiguous requests)
- **Specificity**: Questions cite existing artifacts ("I found X in the codebase..." not "What do you think?")
- **Actionability**: Brief has testable Work Objectives and Verification criteria
- **User satisfaction**: User says "approved" without major corrections
- **Handoff quality**: sisyphus-plan can create PRD from brief without additional clarification

---

## Detailed Phases

### Phase 1: Intent Parsing (Silent)

**Goal:** Understand what the user is really asking without bothering them.

**Step 1.1: Identify ambiguity signals**
Read the user's request and classify:

| Signal | Example | Action |
|--------|---------|--------|
| **Adjective without noun** | "Make it better" | Ask: what aspect? (performance, UX, code quality, features?) |
| **Verb without object** | "I want to build something" | Ask: what category? (tool, automation, integration, visualization?) |
| **Comparative without baseline** | "Faster than before" | Ask: what's the baseline? what's the target? |
| **Broad category** | "Improve the dashboard" | Ask: specific pain points? what do users complain about? |
| **Solution without problem** | "Add AI to this" | Ask: what problem does AI solve? is AI actually needed? |
| **Implicit assumptions** | "Users will love this" | Ask: who are the users? have you validated need? |

**Step 1.2: Extract topics**
From the request, extract 2-5 key topics or themes. These guide artifact inspection.

Example: "Make the wiki better" → topics: wiki, content organization, search, navigation, visual design

**Step 1.3: Estimate ambiguity score**
| Score | Meaning | Next Phase |
|-------|---------|------------|
| 1-2 | Mostly clear, minor clarification needed | Skip to Phase 3 (Brief Assembly with 1-2 questions) |
| 3-5 | Moderately ambiguous, several unknowns | Full Phase 2 (3-5 questions) |
| 6+ | Very vague, could mean many things | Full Phase 2 (5-7 questions), possibly suggest breaking into smaller initiatives |

---

### Phase 2: Artifact Inspection (Silent)

**Goal:** Answer as many questions as possible from existing artifacts before asking the user.

**Step 2.1: Scan existing plans**
```bash
ls {project_root}/.sisyphus/prds/ 2>/dev/null
ls {project_root}/.sisyphus/plans/ 2>/dev/null
ls {project_root}/.sisyphus/notepads/ 2>/dev/null
```

Look for artifacts related to extracted topics:
- PRDs about similar features or systems
- Plans that touched related code
- Notepads with decisions, problems, or learnings about related work

**Step 2.2: Search codebase (lightweight)**
```bash
grep -r "wiki\|dashboard\|search" {project_root}/ --include="*.md" --include="*.py" -l 2>/dev/null | head -5
```

Only read first 20-30 lines of relevant files. Do not deep-dive — this is discovery, not research.

**Step 2.3: Check beads issues**
```bash
bd list --open 2>/dev/null | grep -i "wiki\|dashboard\|search" || echo "No matching issues"
```

**Step 2.4: Summarize findings**
Create a concise summary:
```
Existing artifacts found:
- PRD: dashboard-enhancement-prd.md (2026-04-30) — added settings API, mentions "wiki search needs improvement"
- Plan: sisyphus-plan-optimization.md (2026-05-01) — ongoing, not related to wiki
- Notepad: vault-web-dashboard/problems.md — notes "wiki navigation is confusing for new users"
- Code: main.py has wiki search endpoint (basic, no pagination)
- Beads: brain-102 "Wiki content organization" — closed, deferred
```

**Step 2.5: Mark answered questions**
For each topic, check if existing artifacts answer:
- What exists today? → Codebase inspection answers this
- What's been tried before? → Notepads + closed plans answer this
- What was deferred? → Beads issues answer this
- What's already in progress? → Active plans + open beads issues answer this

**Rule:** If an artifact provides a clear answer, don't ask the user. Reference the artifact in your question recommendation.

---

### Phase 3: Question Design (Conversational)

**Goal:** Ask the minimum questions needed to fill the brief. One at a time.

**Step 3.1: Sequence questions by value**
Order questions by how much they reduce ambiguity:
1. **Scope-defining questions** first ("What does 'better' mean?")
2. **Constraint questions** second ("What's the timeline?")
3. **Clarification questions** third ("Do you mean X or Y?")
4. **Nice-to-know questions** last ("What inspired this idea?")

**Step 3.2: Design each question with recommendation**
Format each question as:
```
Q{n}: [Specific question showing you've done homework]

My recommendation: [Specific suggestion based on artifact inspection]
- If you agree: [what that means for scope]
- If different: [ask follow-up to narrow down]
```

**Example (good):**
```
Q1: I found the wiki search endpoint in main.py is basic (no pagination). When you say "make the wiki better," do you mean search/performance, content organization, or visual design?

My recommendation: Focus on search first — the notepad mentions "wiki navigation is confusing for new users," and search is the main navigation mechanism. We could add pagination, filtering, and better result ranking.

- If you agree: Scope = search improvements (pagination + filters + ranking). Estimated: 2-3 days.
- If different: Which area matters most to you?
```

**Example (bad — don't do this):**
```
Q1: What do you want?
Q2: When do you need it?
Q3: What's your budget?
```

**Step 3.3: Ask and wait**
- Present Q1 with recommendation
- WAIT for user response (do not ask Q2 until Q1 answered)
- Adapt Q2 based on Q1 answer

**Step 3.4: Hard stop rule**
Stop asking questions when ANY of these are true:
- [ ] Context section can be filled (current state, existing artifacts, constraints)
- [ ] Work Objectives can be filled (2-5 concrete deliverables)
- [ ] Verification criteria can be filled (how we'll know it's done)
- [ ] First execution wave can be described (what's the first slice)

**Maximum:** 7 questions. If still unclear after 7, suggest breaking into smaller initiatives or scheduling a follow-up.

---

### Phase 4: Brief Assembly

**Goal:** Create planning brief that captures shared understanding.

**Step 4.1: Write brief**
Format:
```markdown
# Discovery Brief: {name}
**Date:** {YYYY-MM-DD}
**Discovery session:** {n} questions, {user_name}

## Context
- **Current state:** [what exists today, from artifact inspection]
- **Pain point / opportunity:** [why this matters]
- **Existing work:** [related PRDs, plans, issues found]
- **Constraints:** [timeline, budget, technical limits from discussion]

## Work Objectives
1. [Objective 1: specific, testable]
2. [Objective 2: specific, testable]
3. ...

## Verification
- [ ] [Criterion 1: how we'll know objective 1 is met]
- [ ] [Criterion 2: how we'll know objective 2 is met]

## First Execution Wave
- [ ] [Task 1: first concrete step]
- [ ] [Task 2: next step]

## Open Questions / Risks
- [Risk 1: uncertainty that could block or derail]
- [Risk 2: ...]

## Decisions Made
- D1: [decision from Q1 + rationale]
- D2: [decision from Q2 + rationale]
```

**Step 4.2: Save to notepad**
```bash
mkdir -p {project_root}/.sisyphus/notepads/{name}
echo "{brief content}" > {project_root}/.sisyphus/notepads/{name}/discovery-{YYYY-MM-DD}.md
```

**Step 4.3: Present to user**
```
Here's what we agreed on:

[Summary of brief — 3-5 bullets]

Ready for me to create the detailed PRD and execution plan from this?

Say "approved", "create PRD", or "proceed" and I'll build the .sisyphus plan.
Or tell me what to adjust first.
```

**CRITICAL HALT INSTRUCTION:**
After presenting the brief to the user, you MUST STOP and WAIT. Do NOT proceed to Phase 5 (handoff to sisyphus-plan), do NOT create any files beyond the notepad brief, do NOT start any implementation, and do NOT invoke sisyphus-plan until the user explicitly responds with "approved", "looks good", "create PRD", "proceed", "plan this", or similar approval phrase.

This is a HARD STOP — not a suggestion. The discovery session ends here until the user responds.

**If user asks questions or requests changes:**
- Go back to Step 3 (Questions) or Step 4.1 (Rewrite brief)
- Present updated brief
- HALT again for re-approval

**If user approves:**
- Proceed to Phase 5 (handoff to sisyphus-plan)

---

### Phase 5: Handoff to sisyphus-plan

**Trigger:** User approves brief with "approved", "create PRD", "proceed", "looks good", "plan this"

**Step 5.1: Load sisyphus-plan skill**
```
Load skill: sisyphus-plan
Input: 
  - Brief file path: {project_root}/.sisyphus/notepads/{name}/discovery-{YYYY-MM-DD}.md
  - Brief content (inline if path unavailable): [full brief text]
Trigger: "Approved brief: {name}. Create PRD and execution plan."
```

**Step 5.2: Verify handoff**
Confirm sisyphus-plan received:
- [ ] Brief file path or inline brief content
- [ ] Brief contains: Context, Work Objectives, Verification, first wave
- [ ] project_root resolved
- [ ] Notepad reference included

**Step 5.3: Let sisyphus-plan proceed**
sisyphus-plan executes its Workflow 1b (PRD creation) → Workflow 1c (Issues) → Workflow 1 (Execution plan)

## Examples (Reference Material)

### Example 1: Vague Request → Discovery → Brief → PRD
```
User: "I want to make the wiki better"

Agent loads discovery-orchestrator skill:
Phase 1 (Intent Parsing):
- Adjective without noun: "better" → ambiguous
- Topics: wiki, content, search, navigation, visual design
- Ambiguity score: 5/10 → Full discovery needed

Phase 2 (Artifact Inspection):
- Scan .sisyphus/: finds wiki-related PRD (2026-03), notepad mentions "navigation confusing"
- Search codebase: finds basic wiki search endpoint (no pagination)
- Beads: finds closed issue about wiki organization (deferred)

Phase 3 (Question Design — 3 questions):
Q1: "I found the wiki search is basic (no pagination) and the notepad says navigation is confusing. When you say 'better,' do you mean search/performance, content organization, or visual design?"
  → User: "Search is the biggest pain point. People can't find things."

Q2: "Got it — search. The current endpoint does basic text matching. Are users looking for exact page titles, or do they need full-text search across all content?"
  → User: "Full-text. They type 'deployment' and want every page that mentions deployment."

Q3: "Full-text search across all wiki pages. Do you need advanced filters (date, author, category) or just ranked results by relevance?"
  → User: "Relevance ranking first. Filters can come later."

Phase 4 (Brief Assembly):
Context: Wiki has basic search (title-only). Users need full-text.
Objectives: 1) Full-text search endpoint 2) Relevance ranking 3) Search UI with pagination
Verification: Search for "deployment" returns 5+ relevant pages in <200ms
First wave: Backend search endpoint (schema + API)

Agent: "Ready to create the detailed PRD and plan?"
User: "approved"
→ Handoff to sisyphus-plan
```

### Example 2: Moderately Clear Request → Brief → PRD
```
User: "I want to add a leaderboard to the course platform for gamification"

Agent loads discovery-orchestrator skill:
Phase 1:
- Topics: leaderboard, gamification, course platform, ranking, performance
- Ambiguity score: 3/10 → Minor clarification needed

Phase 2:
- Scan .sisyphus/: finds gamification PRD (points + streaks, no leaderboard)
- Notepad: "leaderboards deferred to v2 — privacy concerns about public rankings"

Phase 3 (1-2 questions):
Q1: "I found a gamification PRD with points and streaks but no leaderboard. The notepad mentions privacy concerns about public rankings. Do you want private rankings (user sees their position only) or public leaderboard?"
  → User: "Private first. Public later if users ask."

Phase 4 (Brief):
Context: Gamification v1 has points + streaks. Leaderboard was deferred.
Objectives: 1) Private leaderboard API 2) Leaderboard UI (user sees own rank) 3) Weekly/monthly timeframes
Verification: User sees their percentile rank, top 10% badge, no public data leak
First wave: Leaderboard schema + API endpoint

→ Handoff to sisyphus-plan
```

### Example 3: Too Vague → Suggest Breakdown
```
User: "I want to build something cool with AI"

Agent loads discovery-orchestrator skill:
Phase 1:
- Topics: AI, machine learning, automation, chatbot, recommendation, analysis
- Ambiguity score: 8/10 → Very vague

Phase 3 (after 7 questions still unclear):
Q1-Q7: Explored domain, data sources, user base, problem, AI type, integration, timeline
- User has many ideas but no specific problem to solve

Agent: "After exploring, it seems you have several exciting AI ideas but no single focused problem yet. I recommend:
1. Pick ONE specific pain point (e.g., 'users can't find relevant content')
2. Validate it with 3-5 users
3. Then come back and I'll plan the AI solution

Shall I create a brief for 'content recommendation engine' as a starting point, or do you want to explore a different direction first?"
```

---

## Length Exception

This SKILL.md exceeds the 500-line guideline (marginally). **Reason:** 7-question Socratic interview protocol with branching logic, full example dialogue, and brief-template output format. Interview scripts need complete coverage to be useful as a reference for new sessions — shortening would drop interview branches. **Pruning done:** None — already tightly scoped to the protocol + one worked example. Validator WARN is expected and accepted per `skill-creator/SKILL.md` L265.