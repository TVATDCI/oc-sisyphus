# Momus decision-JSON consumption — spine closure record

**Status: gap = zero (case CLOSED at verification; no code needed).**
Swamp Club Guard 3, Oracle Gate-2 Upgrade 4a (VERIFY, THEN CLOSE IF GAP
EXISTS), verified 2026-10-27 in this repo.

## What was verified

Oracle 4a's open question: *does the spine's consumption path of the momus
strict decision JSON schema-validate, or does it prose-scrape / best-effort
parse (a malformed decision read as pass-adjacent)?*

Two distinct momus JSON artifacts exist; both consumption paths were traced:

### 1. The momus Step-4 strict decision JSON — model-facing, never spine-parsed

`{"decision": "PASS"|"WARNING"|"FAIL", "artifact_path", "summary",
"blockers": [...], "next_action": "proceed"|"fix_then_recheck"|"user_decision"}`
(skills/momus-reviewer/SKILL.md Step 4; skills/momus-prd-reviewer/SKILL.md
Step 4; skills/momus-plan-reviewer).

This contract is **produced** by the momus reviewer personas and consumed
**in-session by the orchestrating model** (the Gate Behavior routing table:
PASS → issue-creator, WARNING → issue-creator with caution, FAIL → return to
writer). **No spine code parses it** — verified by exhaustive search: the
Step-4-specific markers (`artifact_path`, `fix_then_recheck`,
`user_decision`) appear ONLY in skills/ and agents/ (producers), in zero
plugin/script/test source. (`next_action` is NOT a marker: workflow.yaml's
phase schema has its own `next_action` field — phase-machine.js renders it
as phase guidance — collision-verified, different contract.) There is therefore
no best-effort interpretation channel in the spine for this artifact: a
malformed Step-4 JSON can misroute a model turn, but it cannot make a gate
read pass-adjacent, because the spine never reads it.

### 2. The spine gate path — SISYPHUS_GATE signed verdicts — already schema-validated, fail-closed

The thing that actually blocks/allows execution consumes a different
artifact: the operator-signed `<!-- SISYPHUS_GATE {...} -->` +
`<!-- SISYPHUS_GATE_SIG {...} -->` blocks in
`~/.sisyphus/notepads/momus-{prd,plan}-review-*.md`, written ONLY by the
operator-side CLI (`plugins/sisyphus-gates/cli.js` `sign-verdict`,
L239-240 — the agent cannot forge one; signing requires the operator
keyring key). Its consumption already carries the full Garfield-shape
validation chain:

| Step | Where | Behavior on contract mismatch |
|---|---|---|
| Block parse | `src/verdict-parser.js` `parseVerdictBlocks` (~L77-148) | Malformed JSON → block skipped (never best-effort); non-object → skipped |
| Schema validation | `src/verdict-parser.js` `validateVerdict` (~L185-214) | Strict field/type/enum checks: kind ∈ {prd,plan}, decision ∈ {PASS,FAIL,WARN}, blockers: string[], schema_version ≤ 2.0.0, timestamp + reviewer strings |
| Gate mapping | `src/review-scanner.js` `mapVerdictToGate` (~L85-110) | Invalid verdict → gate stays `null`/unknown → `mustBlockExecution` fail-closed (unknown blocks, never permits) |
| Signed path | `src/review-scanner.js` `loadSignedVerdicts` (~L138-302) | HMAC-SHA256 (`src/verdict-signing.js`, `timingSafeEqual`, canonical stableJSON-v1); parse failure → skip; any decision other than PASS/FAIL → gate `null` (uncertain → blocked) |
| Signing input | `cli.js` sign-verdict L208-212 | kind/decision validated against fixed enum sets BEFORE the payload is constructed and signed |

The prose-scraping failure mode Oracle worried about is not merely absent —
it was **deliberately removed** (W1.B): the file headers of
`verdict-parser.js` and `review-scanner.js` record that the brittle
`content.includes("Gate Decision:** PASS")` string-match detection was
replaced by this structured parser precisely because of false positives and
false negatives. Zero `includes("PASS")`-style consumption survives in
spine source (only historical comments and a human-guidance string).

## Standing guarantee (tripwire test)

`plugins/sisyphus-gates/test/swamp-guard-3-momus-json-closure.test.js`
asserts (a) this document exists and states the closure, and (b) no spine
source starts parsing the Step-4 JSON markers (`artifact_path`,
`fix_then_recheck`, `user_decision` — collision-free, unlike `next_action`)
— if a future change introduces spine consumption of the momus decision
JSON, the tripwire fires and THIS DOCUMENT must be revisited
with a real fail-closed schema validation (parse failure = fail-closed
re-invoke, never best-effort interpretation) before it lands.

## Fossilize boundary respected

Per the Oracle Gate-2 fossilize rulings, this closure touches none of:
momus Categories A–F (semantic inference — strong model), WARNING
acknowledgment (human), or any human-decision path. The promotion, merge,
and override words stay where they are.
