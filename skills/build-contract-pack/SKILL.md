---
name: build-contract-pack
description: "Generates an Implementation Contract Pack (fidelity-index.md, component-contracts/, framework-reference.md, red-flag-checks.md) from an initiative's approved PRD + plan at the plan/wave boundary, converting plan prose into per-component Invariants/Verification/Forbidden contracts. (1) Use when asked to generate, build, or create a contract pack, fidelity pack, fidelity index, or component contracts for an initiative whose plan contains UI/UX or High-risk logic components. (2) Use when the orchestrator requests pack generation before wave execution begins. Triggers: 'generate contract pack', 'build contract pack', 'create fidelity pack', 'generate component contracts', 'contract pack for this plan', 'fidelity index for this initiative'. Not for: discussing plan-fidelity concepts or the plan-fidelity-protocol vault page (read-only discussion — stay quiet), implementing contracted components (wave-executor), reviewing or scoring existing packs, creating plans (plan-writer), vault capture (archivist)."
compatibility: opencode
---

# Build Contract Pack

Generator skill: reads an initiative's PRD + plan (+ optional DESIGN.md) and emits a 4-artifact Implementation Contract Pack into `<repo-root>/.sisyphus/contract-pack/`. The pack converts descriptive plan prose into executable per-component constraints (April 2026 design, ported wave-native per the substrate lock). This skill GENERATES packs; it does not enforce them — enforcement is the wave-executor loading convention.

**On activation, output:** `<activated_skill>build-contract-pack</activated_skill>`

## Core Responsibilities

- Generate Implementation Contract Packs for initiatives whose plans contain UI/UX components or High-risk logic components.
- Classify plan components into risk tiers (High / Medium / Low) from plan-stated complexity + the five April flagging criteria, with EVERY assignment citing plan evidence.
- Convert plan prose into per-component contracts — separate Invariants / Verification / Forbidden blocks — for High + flagged-Medium components only.
- Assemble framework-reference.md from REAL vault pages (grep `~/Main-vault/wiki` by stack keywords), flagging coverage gaps instead of inventing citations.
- Emit red-flag-checks.md: the April 5 baseline checklist + plan-derived additions, each justified.
- Refuse cleanly — no artifacts, no directory — when the plan contains no components to contract.

**Not enforcement:** reading contracts pre-build, verifying post-build, and deviation reporting during waves belong to the wave-executor convention, not this skill.

## Process / Workflow

### Step 0 — Activation

Output the activation tag (above). All subsequent tool use must match § Tool Usage.

### Step 1 — Read inputs

- Required: PRD path, plan path. Optional: DESIGN.md (design contract — colors, typography, spacing; when present, its tokens inform Invariants).
- Read all inputs fully before classifying anything. Generation is read-only on every input.

### Step 2 — Component extraction

- Enumerate every component the plan names (component inventory, slices, specs). Record each with its plan-stated complexity rating where the plan states one.
- **Refusal gate:** if the plan contains NO UI/UX or logic components (e.g., infra-only: scripts, CI pipelines, config), take the refusal path (Step 8f). Do NOT create the pack directory.

### Step 3 — Tier classification pass

1. Start from the plan's own complexity ratings (High/Medium/Low). Where the plan states none, infer from the component's described scope and cite the describing lines.
2. A Medium component is **flagged** (→ contracted) when any of the five April criteria apply — name the criterion in the citation:
   - motion (animations, transitions, scroll behavior)
   - tokens (colors, gradients, shadows, theming)
   - responsive (breakpoint-dependent layout, mobile-specific behavior)
   - API boundaries (data fetching, store coupling, prop drilling risk)
   - >3 distinct states (not counting simple boolean toggles)
3. EVERY tier assignment — High, Medium (flagged or not), Low — cites the plan line/section that justifies it. An assignment without a citation is invalid: fix it or flag the gap.
4. Low components are listed in the tier table and NEVER contracted. Do not inflate a Low to justify a contract.

### Step 4 — Contract generation (High + flagged-Medium only)

One file per contracted component at `component-contracts/<Component>.md`:

- **Three SEPARATE blocks** (April D2 — never extra table columns): Invariants (≥3), Verification (3–5 items), Forbidden (2–3 patterns).
- **Invariants** state observable properties the build must not violate. Every invariant needs a plan basis; at least 3 invariants ACROSS THE PACK carry quote-level trace — `*(plan: "…")*`. An invariant with no plan basis is invented: delete it.
- **Verification** items are verb-led and checkable (test / resize / grep / observe …). They reference ONLY what the plan actually specifies.
- **Forbidden** patterns name the anti-pattern and the why (store coupling, raw breakpoints, …), derived from plan constraints and the stack's red-flag classes.
- **Each contract links the escalation rules:** `Escalation: ../fidelity-index.md § Escalation Rules`.
- **Plan-silent properties — never invent.** If the plan omits a property a contract would normally constrain (e.g., a modal's transition type), add it to the contract's `Plan Gaps — ESCALATE` block instead: `[ESCALATE] {property} unspecified in plan — needs operator ruling before build`.

### Step 5 — Framework-reference assembly

1. Extract stack keywords from the plan's tech-stack section.
2. Grep `~/Main-vault/wiki` for those keywords (read/grep tools only).
3. Verify each candidate page EXISTS at its path AND is on-topic before citing; skip low-relevance hits.
4. Cite verified pages with full paths; list every cited page in the reference's Sources section.

**HARD RULE — cite-real-or-flag-gap:** if zero relevant pages exist, the reference carries an explicit gap flag and cites NOTHING. NEVER invent a page name or path. (Restated in § Domain-Specific Knowledge and § Edge Cases.)

### Step 6 — Red-flag-checks

1. Always include the April 5 baseline (D12): raw hex/rgb/hsl where a theme token exists; raw `@media` queries (use the designated variant system); static import of client-only libs (dynamic only); inline API calls in components (hooks/services only); token-usage verification (every color/spacing/shadow maps to a token definition).
2. Add plan-derived checks where the plan states constraints the baseline misses — each addition justified by a plan citation.
3. When vault coverage is empty (Step 5 gap flag), additions are marked **plan-derived** — no vault attribution.
4. Record the April D9 carve-out: manual checklist for MVP; hex/@media lint is the designated first automation when the same error recurs in 2+ projects.

### Step 7 — Write the pack

Write to `<repo-root>/.sisyphus/contract-pack/` (the initiative's repo root — the same writable surface as `.sisyphus/evidence/`):

```
contract-pack/
├── fidelity-index.md
├── component-contracts/<Component>.md   (one per High + flagged-Medium; README-only when none)
├── framework-reference.md
└── red-flag-checks.md
```

Writes go ONLY here (§ Tool Usage, § Boundaries).

### Step 8 — Generation report

State, in this order:

1. Components by tier WITH evidence citations; contracts written (count + files).
2. **Ambiguities escalated** — every `[ESCALATE]` item named explicitly at the top of the report; never buried inside a contract only.
3. Vault pages cited (with paths) OR the coverage-gap flag.
4. Red-flag additions with justifications; the cap note if § Edge Cases capped the flags.
5. Pack location.

**8f. Refusal path** (from Step 2) — output this message, write NOTHING anywhere, exit cleanly (no error, no crash, no partial artifacts):

```
No contract pack generated.
- Checked: {plan path} (+ {PRD path}) — component inventory, slices, component specs.
- Why: no UI/UX or logic components found (plan contains only: {scripts / CI / config / …}).
- A pack WOULD be generated if the plan contained: UI components, logic components rated
  High/Medium complexity, or any component touching motion, tokens, responsive layout,
  API boundaries, or >3 distinct states.
```

## Domain-Specific Knowledge

### fidelity-index.md content contract

The index is the pack root (read at the FIRST contracted slice of a wave, per the wave-executor convention). It MUST contain:

- **Tier table** — Component | Tier | Contract? | Plan evidence (citation). Flagging criteria named where used. Low rows present with contract = no.
- **Checkpoint format** — pre-build: read the contract + DESIGN.md + framework-reference, verify required tokens exist; post-build: verify invariants, run the red-flag sweep, report deviations.
- **Escalation rules** — two classes:
  - **STOP IMMEDIATELY:** behavior deviations, visual deviations, token deviations, API-boundary deviations from the plan/contract.
  - **LOG AND PROCEED:** unconstrained implementation details (anything the plan/contract does not constrain).
- **Plan Gaps Escalated** section — mirrors every `[ESCALATE]` item from the contracts.
- **April alias note** — "Originally `project-plan-fidelity.SKILL.md` (April D12); renamed fidelity-index.md for the wave-native port — it is an index, never an installed skill."

### Ambiguity discipline (plan-silent ≠ invent)

- A property the plan does not specify is a GAP, not a design decision. Flag it (`[ESCALATE]`), surface it in fidelity-index.md AND the report, leave the ruling to the operator.
- Verification items may test only what the plan specifies — never a fabricated default.
- Flags are per-component: one component's gap never weakens another component's contract (the remaining contracts keep the full Case-1 quality bar).

### Citation discipline (HARD RULE — 2nd statement)

- **Cite-real-or-flag-gap** (also § Process Step 5, § Edge Cases): every vault citation is a page verified to exist and be on-topic; zero coverage → explicit gap flag + zero citations. An invented citation is the worst failure this skill can produce — it poisons downstream builds with untraceable authority.

### Low components

Listed in the tier table, never contracted, never inflated. Contract scope = High + flagged-Medium (April D3: High-only misses ~42% of observed drift; all-components dilutes attention across 15–30 contracts).

### Determinism (NFR-1)

Same inputs must regenerate the same tier set, contract count, and component list. Structure is stable; prose may vary.

## Output Format

### fidelity-index.md

```
# Fidelity Index — {initiative}

> April alias: originally `project-plan-fidelity.SKILL.md` (Plan C D12); renamed for the
> wave-native port — this is an index, never an installed skill.

Generated: {date} · Plan: {path} · PRD: {path} · DESIGN.md: {path|"absent"}

## Component Risk Tiers

| Component | Tier | Contract | Plan evidence (citation) |
|---|---|---|---|
| {Name} | High | yes → component-contracts/{Name}.md | {plan §line/quote} |
| {Name} | Medium — flagged ({criterion}) | yes → component-contracts/{Name}.md | {plan §line/quote} |
| {Name} | Low | no | {plan §line/quote} |

## Checkpoints (per contracted component)

Pre-build:  read component-contracts/{Component}.md + DESIGN.md (if present) +
            framework-reference.md · verify required tokens exist.
Post-build: verify every Invariant · run red-flag-checks.md sweep · report deviations
            per § Escalation Rules.

## Escalation Rules

STOP IMMEDIATELY (blocking): behavior / visual / token / API-boundary deviations
from the plan or contract.
LOG AND PROCEED: unconstrained implementation details.

## Plan Gaps Escalated

- {Component}: [ESCALATE] {property} unspecified in plan — needs operator ruling before build
```

### component-contracts/<Component>.md

```
# Contract: {Component}

Tier: {High | Medium — flagged ({criterion})} · Evidence: {plan citation}
Escalation: ../fidelity-index.md § Escalation Rules

## Invariants
- {observable property the build must not violate} *(plan: "{quote or §ref}")*
- {≥3 total}

## Verification
- [ ] {verb-led, checkable against what the plan specifies}
- {3–5 total}

## Forbidden
- {anti-pattern} — {why}
- {2–3 total}

## Plan Gaps — ESCALATE
- [ESCALATE] {property} unspecified in plan — needs operator ruling before build
  (omit this section when the plan fully specifies the component)
```

### framework-reference.md

```
# Framework Reference — {stack}

Stack: {verbatim from the plan's tech-stack section}

## {Topic} (source: {vault page})
{stack-specific rules/recipes drawn from the cited page}

## Sources
- {vault page title} — ~/Main-vault/wiki/{path}
- {each cited page listed here}

## Coverage
Either the Sources list above (≥1 verified page), or exactly:
"No vault coverage for this stack — reference is empty; red-flag discipline applies
from plan constraints only."
```

### red-flag-checks.md

```
# Red-Flag Checks — {initiative}

April 5 baseline (Plan C D12):
- [ ] No raw hex/rgb/hsl values where a theme token exists
- [ ] No raw @media queries — use the designated variant system
- [ ] No static import of client-only libs — dynamic import only
- [ ] No inline API calls in components — hooks/services only
- [ ] Token usage verified: every color/spacing/shadow maps to a token definition

Plan-derived additions:
- [ ] {check} — {plan citation} {marked "plan-derived" when vault coverage is empty}

> April D9: manual checklist for MVP. hex/@media lint is the designated first
> automation when the same error recurs in 2+ projects.
```

## Edge Cases

- **Ambiguous plan (plan-silent property, e.g., "appears with a transition" — no type stated):** do NOT invent the missing value. Write the `[ESCALATE]` marker in that component's contract, mirror it in fidelity-index.md § Plan Gaps Escalated, and name it at the top of the report. Verification items for that component reference only what the plan does specify. Other components' contracts proceed at full quality.
- **Low-only plan (no High, no flagged-Medium):** minimal pack — fidelity-index.md (tier table lists the Low rows, no tier inflation), framework-reference.md (still generated — reference knowledge applies regardless of tier), red-flag-checks.md. `component-contracts/` is absent or contains only a README noting "no contracts required — no High or flagged-Medium components". No contract-shaped content hidden in other files.
- **No components at all (infra-only plan):** Step 8f refusal — the actionable message, nothing written, clean exit. Do not create `.sisyphus/contract-pack/`.
- **Stack outside vault coverage (zero relevant pages):** HARD RULE cite-real-or-flag-gap (3rd statement) — framework-reference.md cites ZERO pages and carries the exact gap flag from its Coverage section; NO fabricated page names or paths. Component contracts are STILL fully structured (tiering and contract structure are stack-independent — same bar as the in-coverage case). red-flag-checks.md additions derive from the PLAN's stated constraints only, marked plan-derived.
- **>15 candidate components:** cap the flagged-Medium set at the plan's own complexity ratings (no inferred flags beyond them); note the cap in fidelity-index.md and the report so the scope cut is visible, not silent.

## Tool Usage

- `read`: PRD, plan, DESIGN.md, and vault pages under `~/Main-vault/wiki/`.
- `grep` / `glob`: plan/PRD scanning and vault stack-keyword retrieval (Step 5).
- `write`: pack artifacts ONLY, and ONLY under the initiative's `<repo-root>/.sisyphus/contract-pack/`.
- Explicitly NO writes to `~/Main-vault/` (vault is read-only input here), NO writes to live skills directories, NO git commands.

## Boundaries

- MUST NOT: invent plan content, invariants, or verification items without a plan basis (plan-silent ≠ invent — flag and escalate).
- MUST NOT: invent or approximate vault citations — cite a verified real page or flag the gap (cite-real-or-flag-gap).
- MUST NOT: contract Low components, or inflate a Low tier to justify a contract.
- MUST NOT: install or copy itself anywhere (live-skills-dir placement is a separate, explicitly-gated ship step).
- MUST NOT: modify the initiative's PRD, plan, or DESIGN.md — generation is read-only on ALL inputs.
- MUST NOT: write anything outside `<repo-root>/.sisyphus/contract-pack/` (the refusal path writes nothing at all).
- MUST NOT: enforce contracts during builds — that is the wave-executor loading convention's domain.
