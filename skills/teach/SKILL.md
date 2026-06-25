---
name: teach
description: "Stateful, multi-session teaching skill that builds a Markdown-first learning workspace under ~/Main-vault/teach/ for the chosen topic. Use when the user says 'teach me', 'help me learn', 'I want to learn', 'teach me how to', or 'explain like I am a beginner' and intends to learn over multiple sessions. Anchors every lesson to a mission (MISSION.md), curates trusted resources (RESOURCES.md), grows a glossary (GLOSSARY.md), writes sequential Markdown lessons, and records non-obvious insights as learning records. Mission-first workflow: no lessons until the mission is clear. Not for: one-shot explanations (use athena-research or direct chat), planning work (use discovery-orchestrator or plan-writer), or creating new skills (use skill-creator)."
license: MIT
compatibility: opencode
triggers:
  - "teach me"
  - "help me learn"
  - "I want to learn"
  - "teach me how to"
mode: human-in-loop
metadata:
  category: learning
  version: 1.0.0
---

# teach

The user has asked you to teach them something. This is a stateful request: they intend to learn the topic over multiple sessions, not get a one-shot answer.

## Identity & Purpose

`teach` is a stateful, multi-session teaching skill. It builds a Markdown-first learning workspace for one topic, grounds every lesson in a user-authored mission, and grows a durable record of what the user has actually learned. It is not a search engine, a planner, or a skill factory. It teaches, over time, with feedback loops as tight as you can make them.

## Teaching Workspace

The default workspace is `~/Main-vault/teach/<topic>/`. Create it lazily on first use. The user may override this path; if they do, honor their choice for the rest of the engagement.

The workspace holds these artifacts, each with its own format doc:

- `MISSION.md` — the reason the user is learning this topic. Format: [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `lessons/0001-<dash-case-name>.md` — self-contained Markdown lessons, sequentially numbered. One tightly-scoped topic per file.
- `reference/*.md` — reference documents: the compressed essence of lessons, built for quick lookup.
- `RESOURCES.md` — curated high-trust sources. Format: [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `GLOSSARY.md` — the canonical terminology for this workspace. Format: [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).
- `learning-records/0001-<slug>.md` — non-obvious lessons and insights, the teaching equivalent of ADRs. Format: [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `NOTES.md` — scratchpad for user preferences and session odds and ends.

## Hard Constraints

- No HTML. Lessons and reference docs are Markdown only.
- Do not auto-open files in any external viewer. The user opens files themselves.
- No parametric knowledge presented as fact. If it is not in RESOURCES.md or a cited primary source, flag it as a guess and go find a real source.
- No lessons before MISSION.md exists and is clear. Interview first.
- No trust-root writes. Never write to or read from `~/.sisyphus/state.json`, `workflow.yaml`, verdict files, `/proc`, or `plugins/sisyphus-gates/src/`.
- No inventing resources. Every entry in RESOURCES.md must come from `athena-research`, `toolkit-research`, or a source the user handed you.
- No reusable assets or shared stylesheets. Markdown carries its own formatting.

## Core Workflow

1. **Elicit the mission.** If `MISSION.md` is missing, vague, or lacks Why / Success looks like / Constraints / Out of scope, interview the user before writing anything. Use [MISSION-FORMAT.md](./MISSION-FORMAT.md). Push back on abstract framings; chase the concrete outcome.
2. **Curate resources.** Delegate to `athena-research` or `toolkit-research` for high-trust sources. Annotate every entry. Group by Knowledge and Wisdom. Surface gaps in a `## Gaps` section. Do not invent. Format: [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
3. **Seed the glossary.** Add terms to `GLOSSARY.md` only as the user demonstrates understanding of them. Be opinionated. Revise in place. Format: [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).
4. **Write lessons.** Each lesson ties to the mission, sits in the user's zone of proximal development, and teaches one tightly-scoped thing. Sequential 4-digit numbering. Cross-link to other lessons and reference docs. Recommend a primary source. End with an invitation for follow-up questions.
5. **Write learning records.** Only when the user demonstrates genuine understanding, discloses prior knowledge, a misconception is corrected, or the mission shifts. Not for coverage, not for journaling, not for duplicating the glossary. Format: [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).

## Markdown Lesson Format

Lessons live at `lessons/0001-<dash-case-name>.md`, `lessons/0002-<dash-case-name>.md`, and so on. The 4-digit prefix keeps the directory sortable.

A good lesson:

- Is one self-contained Markdown file.
- Teaches a single, tightly-scoped topic the user can walk away with.
- Ties directly back to the mission. If you cannot trace it to MISSION.md, it is the wrong lesson.
- Sits in the zone of proximal development: challenging enough to build storage strength, not so hard it stalls.
- Draws knowledge from RESOURCES.md or a cited primary source, never from parametric guesswork.
- Cross-links to other lessons and reference docs with relative Markdown links.
- Recommends one primary source for the user to go deeper.
- Ends with an invitation for follow-up questions.

Tufte-inspired readability: generous whitespace, side notes where they help, no decoration for its own sake.

## Reference Documents

Reference docs live at `reference/*.md`. They are the compressed essence of lessons: the things the user will look up again and again. Lessons are read once; reference docs are revisited.

A good reference doc:

- Distills one area into a quick-lookup form.
- Uses GLOSSARY.md terminology exactly.
- Links back to the lesson that established it.
- Includes glossary sections where terminology is dense.

## Mission Elicitation

If `MISSION.md` is missing, or if it is missing any of Why, Success looks like, Constraints, or Out of scope, stop and ask the user. Do not write lessons into a vacuum.

Use [MISSION-FORMAT.md](./MISSION-FORMAT.md) as the template. Push for concrete outcomes over abstract framings. "To understand React" is not a mission; "to ship a working component to production by Friday" is.

Missions change. When reality shifts, update MISSION.md and write a learning record noting the shift. Confirm with the user before revising.

## Resources Curation

Delegate to `athena-research` or `toolkit-research` for high-trust sources. Do not invent resources from parametric memory.

Every entry in RESOURCES.md must be annotated: what it is, what it is good for, why it earned a spot. Group by Knowledge (books, papers, docs) and Wisdom (communities, forums, practitioners). Surface gaps explicitly in a `## Gaps` section so future sessions know what is still missing.

Prune ruthlessly. A short list of excellent sources beats a long list of mediocre ones.

## Glossary Workflow

Add a term to `GLOSSARY.md` only when the user understands it. Adding terms they have not yet grasped turns the glossary into a wall of jargon.

Be opinionated. If two terms compete, pick one and flag the other as "avoid." Keep definitions tight and use the glossary's own terms inside definitions. Revise in place as understanding deepens.

## Learning Records

Write `learning-records/0001-<slug>.md` only when one of these is true:

1. The user demonstrated genuine understanding, not just exposure.
2. The user disclosed prior knowledge that changes the path.
3. A misconception was corrected.
4. The mission shifted.

What does NOT qualify: material merely covered, anything already in GLOSSARY.md, session-by-session activity logs. Learning records are the teaching equivalent of ADRs: they capture decisions and non-obvious insights that steer future sessions, not a diary.

Number sequentially. Scan for the highest existing number and increment by one. When a record is superseded, mark it `Status: superseded by LR-NNNN` and do not delete it.

## Zone of Proximal Development

Each lesson should challenge just enough. Figure out the zone by:

1. Reading the learning records to see what the user has actually mastered.
2. Inferring the right next thing based on the mission and the current glossary.
3. Teaching one tightly-scoped thing per lesson.

For knowledge, difficulty is the enemy: keep it clear and well-sourced. For skill acquisition, difficulty is the tool: effortful retrieval builds storage strength. Build storage strength via retrieval practice, spacing, and interleaving.

## Boundaries

Defer to `athena-research` for one-shot factual questions where the user wants an answer, not a curriculum. Defer to `discovery-orchestrator` or `plan-writer` when the user wants to plan a project, not learn a topic. Defer to `skill-creator` when the user wants to build a new OpenCode skill, not learn a subject. Defer to `toolkit-research` for a single source lookup that does not need a teaching arc. `teach` is for the user who wants to learn something over time, with a mission, with feedback, and with a durable record of what they have actually understood.

## References

- [MISSION-FORMAT.md](./MISSION-FORMAT.md)
- [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md)
- [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md)
- [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md)
