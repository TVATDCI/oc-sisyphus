# Shared Spec — Stale-Claims Vocabulary & Audit Manifest (`scaffolding-audit`)

- **Spec id:** `scaffolding-audit-shared-spec` v1.0 (2026-09-12)
- **Authority:** PRD `~/.sisyphus/prds/scaffolding-audit-prd.md` §10 (v0.2); plan
  `~/.sisyphus/plans/scaffolding-audit.md` Task 1.1; OPEN-1 ruling (vendored hash-pinned copies +
  audit-time hash-identity check) and OPEN-2 ruling (session-start wiring via existing slots),
  operator default-if-silent 2026-09-12.
- **Consumed by:** pi landing `~/.pi/agent/skills/scaffolding-audit/` (`surface-scope: pi`) ·
  sis twin `~/.config/opencode/skills/scaffolding-audit/` (`surface-scope: sis`).

## 0. Single source & vendoring (OPEN-1 ruling)

This document is the single vocabulary + manifest-schema authority. Each landing vendors a
byte-identical copy at `<skill-dir>/spec/spec-shared.md`. A hash-pinned twin of this file is
staged at `~/.sisyphus/evidence/scaffolding-audit/staged/spec-shared.md` until the Wave-2 twin
landing drops it into the twin skill dir.

**Audit-time hash-identity check (mandatory; runs as part of every audit):** compute `sha256`
over each landing's vendored `spec/spec-shared.md`. Whenever both copies are reachable on the
desk, the hashes MUST be identical; a mismatch is a hard audit failure (vocabulary divergence,
AC-13) — the report prints both hashes and stops. On a desk where only one copy is reachable,
the report records that copy's `sha256` so the operator can compare across desks. Neither
landing may re-word, re-define, or locally extend the class definitions locally (divergence);
extensions are made HERE and re-vendored to both landings in the same change.

## 1. Vocabulary classes (five — D3 wording verbatim)

1. **Class 1** — model identifiers, current AND historical, in prompts/skills/agents/config prose.
2. **Class 2** — workaround language tied to named failure modes ("because \<model\> does X").
3. **Class 3** — quota/limit constants pinned to a plan/model era.
4. **Class 4** — tier/doctrine references — flash-first assignments, flagship locks, fallback
   chain orderings, "current model is X" prose.
5. **Class 5** — knowledge now redundant with the new model's training data.

Classes are spec data (extensible here without code surgery). Classification is
evidence-quote-required and operator-arbitrated; the routine never acts on its own
classification. v1 detection coverage: classes 1–4 carry deterministic rules (§7); class 5
carries a narrow deterministic rule plus operator review — accepted residual doctrine.

## 2. Flag record

Every flag carries, verbatim, these fields:

- `file:line` — path (repo-relative where a repo exists) + 1-based line number.
- `class` — integer 1–5 per §1.
- `verbatim evidence quote` — the flagged line, trimmed; bounded to 200 chars (first 197 + "…"
  when longer). The finding hash is computed over the bounded form.
- `suggested action` — propose-only wording; every action string begins
  `PROPOSE ONLY — operator arbitrates:`. Actions are never executed by the routine.
- `finding hash` — first 16 hex chars of `sha256(file + "\n" + line + "\n" + quote)`.
  Stability contract: identical `file`+`line`+`quote` MUST yield the identical hash on every
  run; a change in ANY component MUST yield a different hash (re-detection key; adjudicated
  findings stay suppressed via the recorded hash until their evidence actually changes).

## 3. Manifest schema

Serialization: JSON, UTF-8, 2-space indent, LF line endings, trailing newline. Owned inside
each skill's state dir at `<skill-dir>/state/manifest.json`. Written ONLY on an explicit
(non-dry) audit run; superseded by each new audit; no cleanup job.

Fields:

| Field | Type | Meaning |
|---|---|---|
| `recorded-at` | string | ISO 8601 timestamp of the explicit audit run |
| `surface-scope` | string | `pi` \| `sis` |
| `last-audit-commit` | object | per-repo git anchor: repo-root label → commit sha |
| `model-state` | object | snapshot of current model bindings for the surface (below) |
| `finding-hashes` | array of string | finding hashes recorded by the run |

`model-state` (pi surface): `{ "source": { "path", "sha256" }, "assignments": { "<category>":
{ "primary": "provider/id", "fallbacks": ["provider/id", …] } }, "judging-locks": {
"categories": ["unspecified-high", "deep", "ultrabrain"], "chains": { … } } }` — enumerated
from tier-map assignments incl. judging locks.

`model-state` (sis surface): `{ "source": { "path", "sha256" }, "bindings": { "<agent>": … },
"fallback-chains": { "<agent>": […] } }` — `omo.jsonc` agent→model + `fallback_models`
chains, legacy vocabulary only (INV-3).

The `source.sha256` digest is a fixed 64-hex anchor over the model-binding source-of-truth
file — never file contents. Rationale: doctrine edits that leave assignments numerically
identical (comment-level doctrine revision — the recorded `0ce0b18` class) are exactly the
drift this anchor catches; pure assignment enumeration would miss them.

Example (pi, abridged):

```json
{
  "recorded-at": "2026-09-12T20:49:09.840Z",
  "surface-scope": "pi",
  "last-audit-commit": { "~/.pi/agent": "0ce0b189a0bccb2167bd62182b9522bd13fec6fc" },
  "model-state": {
    "source": { "path": "extensions/orchestration-engine/tier-map.ts", "sha256": "…" },
    "assignments": {
      "quick": { "primary": "zai-coding-cn/glm-5.3-flash", "fallbacks": ["opencode-go/gpt-5.6-luna", "opencode/glm-5.3-flash", "opencode/ling-3.0-flash-fin-free"] }
    },
    "judging-locks": {
      "categories": ["unspecified-high", "deep", "ultrabrain"],
      "chains": { "unspecified-high": ["zai-coding-cn/glm-5-turbo", "opencode-go/gpt-5.6-luna", "opencode-go/kimi-k2.7-code", "opencode/glm-5.2"] }
    }
  },
  "finding-hashes": ["0123456789abcdef0123456789abcdef"]
}
```

## 4. Drift-check semantics (config-drift; manifest-diff only)

- **Bounded read (INV-2):** the check opens exactly two things — the recorded manifest and the
  surface's model-binding source of truth (pi: tier-map assignments; sis: `omo.jsonc`
  bindings). It never reads skill bodies, prompts, or prose. Cost O(manifest).
- **Stale** (recorded `model-state` ≠ current state): stdout is exactly
  `routing state drifted since last audit — run scaffolding-audit` and nothing else; exit 0.
- **Fresh:** no output; exit 0.
- **Missing manifest** (= never audited): the same single flag line; exit 0; NO manifest is
  written (explicit error boundary; no auto-rebuild).
- **Unreadable manifest** (present but unparseable): explicit error on stderr; exit 1; no
  silent rebuild.
- Runtime behavior (quota-driven fallback walks) is invisible to this check by design.
- **Wiring (OPEN-2 ruling):** session-start slots invoke the read-only check only (pi:
  `session_start` extension point; opencode: session-begin path). Zero writes at session
  start; the manifest is written only on explicit (non-dry) audit runs. Startup-identical is
  preserved: no new infra, no daemon, no store.

## 5. Scope modes (invocation-selected — never auto-detected)

- `diff-scope` — scan only audited-surface files with git changes since the manifest's
  `last-audit-commit`; requires an existing manifest.
- `full-scope` — scan all audited surfaces (model-change days; first/baseline runs).
- The operator supplies the mode as an explicit argument. An invocation without an explicit
  mode MUST terminate with a usage error; no code path may select the mode from ambient state
  (the routine never guesses model-change days).

## 6. Audited surfaces

- **pi:** `extensions/orchestration-engine/tier-map.ts`; `~/.pi/agent/AGENTS.md`; pi skill
  bodies — `skills/*/SKILL.md` **self-enumerated at run time** (never a hardcoded count) —
  EXCLUDING the `scaffolding-audit` skill dir itself (self-exclusion: the skill's own docs and
  vendored spec legitimately quote specimens and token lists).
- **sis:** `~/.omo/omo.jsonc` agents + fallback chains (JSONC-aware parsing only);
  `~/.config/opencode/skills/`; `~/.config/opencode/AGENTS.md` routing text; repo-root
  routing/count docs incl. `COMPLETE-CODEBASE.md`.

## 7. Deterministic classification rule table v1

Single detection source for BOTH implementations (parsed from this spec; compiled as
ECMAScript regex). Determinism: no network, no model calls; same inputs → same outputs.
One flag per `(file, line, class)` — the first matching rule in table order wins; line-level
exclusions run before matching. `where: comment` rules match only comment lines in `.ts`
files (every line counts as prose in `.md`); `where: any` matches all lines.

<!-- sca-rule-table-v1 -->
```json
{
  "version": 1,
  "rules": [
    {
      "id": "c1-historical-model-id",
      "class": 1,
      "pattern": "glm-4\\.5(?:-air)?|glm-4\\.6v?|glm-4\\.7|glm-5v-turbo|glm-5-turbo|glm-5\\.1|glm-5\\.2(?:-highspeed)?|glm-5\\.3-highspeed|glm-5(?![.\\w-])",
      "flags": "",
      "where": "comment",
      "exclude-line": "alias|→|->",
      "exclude-line-flags": "i",
      "action": "PROPOSE ONLY — operator arbitrates: historical/alias model identifier in prose; verify the reference is still deliberate (live alias documentation often is) or update it to the current identifier."
    },
    {
      "id": "c2-workaround-language",
      "class": 2,
      "pattern": "because\\s+(?:the\\s+)?(?:glm|gpt|kimi|grok|qwen|minimax|deepseek|ling)[\\w.-]*\\s+(?:does|does not|doesn't|cannot|can't|fails?|hangs?|truncates?|refuses?|drops?|ignores?)",
      "flags": "i",
      "where": "any",
      "action": "PROPOSE ONLY — operator arbitrates: failure-mode workaround prose tied to a named model; re-verify the failure mode still exists before keeping the workaround."
    },
    {
      "id": "c3-promo-era",
      "class": 3,
      "pattern": "\\b[Pp]romo\\b|\\bPROMO_[A-Z_]+|\\b[Pp]romo[A-Z]\\w*",
      "flags": "",
      "where": "any",
      "action": "PROPOSE ONLY — operator arbitrates: promo-era scaffolding; if the promo window has ended, propose retiring or archiving the promo-specific text/logic."
    },
    {
      "id": "c3-expired-date-constant",
      "class": 3,
      "pattern": "([A-Z][A-Z0-9_]*(?:SUNSET|EXPIRY|EXPIRES)[A-Z0-9_]*)\\s*=\\s*\"(\\d{4}-\\d{2}-\\d{2})\"",
      "flags": "",
      "where": "any",
      "dated-if-before": true,
      "action": "PROPOSE ONLY — operator arbitrates: era-pinned date constant whose date has passed; propose retiring the constant or rolling it forward deliberately."
    },
    {
      "id": "c4-downshift-residue",
      "class": 4,
      "pattern": "downshift[^.\\n]*→\\s*[a-z0-9.-]+",
      "flags": "i",
      "where": "any",
      "action": "PROPOSE ONLY — operator arbitrates: downshift-target doctrine residue; re-check the target against the current tier doctrine (flash-first peak policy)."
    },
    {
      "id": "c4-current-model-prose",
      "class": 4,
      "pattern": "current model (?:is|:)\\s*[\\w.-]+",
      "flags": "i",
      "where": "any",
      "action": "PROPOSE ONLY — operator arbitrates: 'current model is X' prose; verify X is still the current primary before keeping the claim."
    },
    {
      "id": "c5-training-data",
      "class": 5,
      "pattern": "knowledge cutoff|training data",
      "flags": "i",
      "where": "comment",
      "action": "PROPOSE ONLY — operator arbitrates: dated-knowledge note; if the current model's training covers it, propose removing the note."
    }
  ]
}
```

## 8. Forbidden models-chain tokens (consumed by the sis-side INV-3 gate)

The twin's code, manifest, and schema contain none of: the chain key `"models": [`, the
literal `models-chain`. This vendored spec copy legitimately carries the literal token list
(Task 1.1 requirement — the list IS the gate's payload); the Wave-2 INV-3 gate therefore
excludes the vendored spec copy from its sweep scope by design (E-1 rescope).

## 9. Posture (binding)

Propose-only: flags are suggestions with evidence; the routine never deletes, edits, or
applies anything itself — every mutation is operator-executed (INV-1). Permitted writes,
anywhere in either landing: (a) the skill's own state-dir manifest, on an explicit non-dry
audit run; (b) stdout. Zero vault writes. Live-endpoint probing is composed, never
reimplemented: the pi landing invokes the existing `model-audit` skill for that leg; the sis
validation leg is `omo doctor`.
