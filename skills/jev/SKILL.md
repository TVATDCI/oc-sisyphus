---
name: jev
description: "Pre-annotate bounded decisions with Jev — TypeSafe's System One classifier (opencode/jev-1.13-free) — and get calibrated typed answers with probabilities at zero cost on the free tier. Ruled lane on this desk: calibrated typed PRE-ANNOTATION of the suite-red classifier's UNCLASSIFIED residuals via scripts/preannotate_residuals.py, plus any operator question that can be decomposed into typed CHOICE/BOOL/SCORE questions with explicit criteria. Jev answers typed questions about provided state; it never writes prose. Use when the operator says 'ask jev', 'pre-annotate the residuals', 'second opinion, calibrated', or pipes fm-suite-classify.sh UNCLASSIFIED output. Do NOT use for: open-ended questions that cannot be framed as bounded options, code generation, prose, or any decision the operator has not framed — and NEVER as an auto-verdict."
compatibility: opencode
triggers:
  - "ask jev"
  - "pre-annotate"
  - "preannotate residuals"
  - "unclassified residuals"
  - "second opinion"
  - "what does jev think"
  - "calibrated take"
mode: afk-safe
gates:
  - "NEVER-AUTO-GREEN: annotation only — no gate consumes this output; decisions stay with the operator; nothing writes to bd/vault/firstmate"
---

# jev — calibrated typed pre-annotation (Jev / System One)

Jev answers typed `choice` / `bool` / `score` questions about JSON state with
calibrated probabilities. It never writes prose, so every question must be
decomposed into typed questions with explicit criteria FIRST.

> **NEVER-AUTO-GREEN.** This skill produces annotation beside the item under
> decision — a probability label, not a ruling. It never greenlights, skips,
> reclassifies, or re-routes anything; no gate consumes its output; nothing is
> written to bd, the vault, or firstmate state. Decisions stay with the
> operator. Low confidence IS the finding when a question is genuinely
> ambiguous — surface it as "Jev is split", not a failure.

## Ruled lane: suite-red residual pre-annotation

The deterministic suite-red classifier (firstmate's `bin/fm-suite-classify.sh`)
routes its UNCLASSIFIED residuals to a human. Pipe that output here to get a
calibrated label beside each residual:

```bash
bin/fm-suite-classify.sh <suite-log> | python3 scripts/preannotate_residuals.py
```

The script composes ONE bounded choice question per residual — candidates
`env-infrastructure` / `test-content-defect` / `timing-anomaly` /
`needs-human-eyes`, criteria spelled out in the question — calls Jev, and
prints the residual + label + probability distribution + confidence caveat.
`--dry-run` shows the composed request without calling anything; `--json`
emits ndjson; `--self-test` runs the offline mocked test.

## Decomposing any other bounded question (the craft)

1. **State carries the facts; questions carry the judgment.** Put verbatim
   quotes, numbers, and constraints in `state`; never bury facts in criteria.
2. **One decision per question.** Split "should we do X and when" into a bool
   + a choice.
3. **Criteria are the ONLY place definitions live.** Each option gets a
   one-line meaning; make them mutually exclusive.
4. **Score scales: 3-5 levels, lowest first.** More levels silently return
   empty answers on the free tier.
5. **Batch related questions in ONE call** — same latency, one usage row.

Question types:
- `choice` — `criteria: {label: meaning, ...}` (each label one line)
- `bool` — `criteria: {true: meaning, false: meaning}`
- `score` — `criteria: [lowest, ..., highest]` (3-5 labels)

## Call surface

`opencode.json` declares `opencode/jev-1.13-free` (and `jev-1.13`) as
decision models under `providers.opencode.models` — the opencode.ai catalog
also serves them natively (rolling out as of 2026-10-28); the explicit entry
pins the lane against catalog churn (config wins over catalog, merge-proven
sandbox-verified 2026-10-28). Not a chat model: the opencode runtime —
re-checked through v2.2.0 on 2026-10-28 (`opencode --help` surface audit
lists no classify surface) — gives no user-facing classify surface, so the
invocation paths are:

1. **The script** (residual lane, and any single question): pipe state+question
   through `scripts/preannotate_residuals.py` — for the residual lane it is
   the whole flow; for ad-hoc questions use `--dry-run` to inspect the wire
   shape, or call the gateway directly (below).
2. **Direct gateway call** (curl-shaped):

```bash
curl -s https://opencode.ai/inference/systemone/v1/systemone \
  -H "Authorization: Bearer $OPENCODE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"jev-1.13-free",
       "state":"<verbatim facts>",
       "questions":{"q1":{"type":"choice","instructions":"...",
                          "criteria":{"A":"...","B":"..."}}}}'
```

Response shape: `answers.q1 = {type:"choice", choice, probabilities{...},
confidence}` (`bool` → `{type:"noul", noul: <p of true>}`; `score` → score +
confidence). Free tier reports cost 0 (verified 2026-10-28); paid
`jev-1.13` is the same shape.

## Rendering rule (how answers land)

Report each answer AS a classifier's answer, BESIDE the item under decision:

```
<the item under decision>
  JEV jev-1.13-free: <label>  p=<p>  (confidence <c>)
  distribution: <label-a> <p-a> | <label-b> <p-b> | ...
  caveat: calibrated classifier, not a verdict — low confidence IS the
  finding. NEVER-AUTO-GREEN.
```

Labels + probabilities + criteria travel together; a bare label without its
distribution is not a Jev answer. Where Jev's confidence disagrees with your
own judgment, say so — calibration quality is the thing being trialed. If the
operator's question cannot be bounded into typed questions, say so and propose
the decomposition FIRST instead of forcing a frame.

## Boundaries (hard)

- **NEVER-AUTO-GREEN** — output is annotation only; it never passes, fails,
  skips, or reclassifies anything, and no gate consumes it.
- Decisions stay with the operator. Always.
- Nothing writes to bd, the vault, or firstmate state.
- Do not paste secrets into `state` — it goes to the gateway verbatim.
