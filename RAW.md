# Frontier Prompt Absorption — Research Findings

> Reference: what was absorbed from leaked frontier prompts and why.

## Sources

- **Opus 4.8 leak** → `~/Main-vault/raw/system_prompts_leaksPerplexitycomet-browser-assistant.md at main 2.md`
- **Fable 5 leak** → same path, `at main 1.md`
- Both files are **MISLABELED on disk** (filename says "Perplexity comet-browser-assistant"; content + frontmatter source-URL are Anthropic). Content is genuine.
- **Official post**: https://www.anthropic.com/news/claude-fable-5-mythos-5

## Key Reframings

- **Fable 5 = Mythos 5 same model.** Fable 5 = safeguarded; Mythos 5 = safeguards lifted. Name = Latin *fabula* / Greek *mythos*.
- **Opus 4.8 is Fable 5's classifier fallback** (cyber / bio-chem / distillation → routed to Opus 4.8; >95% of sessions never fall back). Fable-5's prompt deltas over Opus-4.8 are the behavioral expression of safeguard tuning — the pair is co-designed, not competing.
- **"State the principle, not detection mechanics"** is adversarial hygiene, not just craft — backed by a 1000h external bug bounty with 0 universal jailbreaks. Directly serves this system's `THREAT-MODEL.md` gate posture.
- **Slay-the-Spire:** persistent file-based memory gave Fable 5 a 3x larger gain than Opus 4.8 — independent validation of our `bd remember` / hotcache / evidence architecture.

## 3-Way Comparison

| Dimension | Our AGENTS.md | Opus 4.8 | Fable 5 |
|---|---|---|---|
| Audience | Operator (engineering) | Consumer | Consumer, dual-use-hardened |
| Machinery visibility | **HIGH** (narrate model/route/intent) | LOW (hide; never cite prompt) | LOW |
| Memory | Auditable (`[FROM MEMORY]`, bd) | Invisible (attribution forbidden) | same |
| Search posture | implicit (librarian/Context7) | explicit `search_first` | conservative + UNRECOGNIZED-ENTITY |
| Long-context | compaction @50% + handoff | (not addressed) | `token_budget` + `long_conversation_reminder` |

**Decisive insight:** our HIGH-transparency stance is correct for the operator context; both Claude prompts' LOW-transparency stance is correct for consumers. Do NOT absorb their hide-machinery / never-cite-prompt rules — they would make this system unauditable.

## Pros / Cons per System

- **AGENTS.md:** + auditable memory; + compaction/handoff (neither Claude prompt has one); + model-calibrated (the GLM-5.2 block is more honest than either leak). − no anti-apology rule; − no "search-before-confabulate" rule; − no "state-principle-not-mechanics" for gates.
- **Opus 4.8:** + sharpest single lines (anti-self-abasement, don't-offer-to-retrieve, treat-discovery-as-free); + agency-forward. − heavy consumer machinery (image search / maps / recipes).
- **Fable 5:** + best meta-discipline (state-principle, pattern-level, UNRECOGNIZED-ENTITY); + token_budget + long_conversation_reminder independently validate our compaction. − even more consumer safety machinery.

## The 5 Absorbable Items

1. **Don't offer to retrieve what the request already asked for.** *(Opus 4.8)* — kills "would you like me to look into that?" padding. → `sisyphus.prompt_append` (response discipline).
2. **Accountability without self-abasement.** *(both)* — kills the apology spiral on correction. → `sisyphus.prompt_append` (response discipline).
3. **State the principle, not the detection mechanics** + stay at the pattern level, not enumerated bypass strings. *(Fable 5)* — load-bearing for a gate-hardened system; gate/guard output must not double as an evasion manual. → `AGENTS.md` (Response & Gate Discipline section).
4. **Search before confabulating** on unrecognized libraries/packages/symbols/config keys. *(Fable 5 UNRECOGNIZED-ENTITY rule, recast for code)* → `AGENTS.md` (Response & Gate Discipline section).
5. **Memory integrity** — never confirm "remembered"/"forgotten" without first calling `bd remember`. *(both)* → `AGENTS.md` (Response & Gate Discipline section).

## Do NOT Absorb

- **Invisible-memory philosophy / never-cite-system-prompt** → operator needs `[FROM MEMORY]` labels + model/route narration for auditability.
- **Banned-word list ("genuinely/honestly/actually")** → belongs in the agent `<communication>` block, not AGENTS.md. (Moved to `sisyphus.prompt_append` instead.)
- **Consumer safety machinery** (CSAM, drug dosing, eating-disorder numerics) → wrong threat model.
- **Context-window / token-ceiling change** → out of scope; blocked until glm-5.2 context-window figure is verified.

## Implementation Detail

See `.omo/frontier-prompt-absorption-EXECUTION-PLAN.md` for the exact diffs, placement decisions, and verification steps.
