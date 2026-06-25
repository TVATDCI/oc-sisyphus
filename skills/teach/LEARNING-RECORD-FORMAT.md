# Learning Record Format

Learning records live in `./learning-records/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc. Create the directory lazily.

They are the teaching equivalent of ADRs: they capture non-obvious lessons, key insights, and stated prior knowledge that will steer future sessions.

## Template
# {Short title}
{1-3 sentences: what was learned, and why it matters.}

## Optional sections
- Status frontmatter (active | superseded by LR-NNNN)
- Evidence — how the user demonstrated understanding
- Implications — what this unlocks or rules out

## Numbering
Scan for highest existing number and increment by one.

## When to write
1. User demonstrated genuine understanding (not just exposure).
2. User disclosed prior knowledge.
3. A misconception was corrected.
4. The mission shifted.

### What does NOT qualify
- Material merely covered.
- Anything already in GLOSSARY.md.
- Session-by-session activity logs.

## Supersession
Mark old record `Status: superseded by LR-NNNN`, don't delete.
