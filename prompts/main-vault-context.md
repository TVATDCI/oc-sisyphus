# Main-vault Context

## Project Conventions

- **Project root:** `~/Main-vault`
- **Planning artifacts:** `.sisyphus/prds/*.md`, `.sisyphus/plans/*.md`, `.sisyphus/notepads/{plan}/`
- **Evidence directory:** `.sisyphus/evidence/`
- **Tracking:** `boulder.json` for active plan, beads issues for operational tracking

## Planning Rules

- Use **vertical slices**, not horizontal layers
- Each slice cuts through ALL system layers (schema → API → frontend → tests)
- Default wave structure: Foundation → Features → Polish
- Every PRD must have: Decision Log, Module Boundaries, Manual QA checkpoints
- Every plan must have: Integration + Final Verification task (separately numbered, blocked by all prior)
- project_root must be `~/Main-vault` unless user explicitly specifies otherwise

## Code Style

- Follow existing codebase patterns
- Never suppress type errors with `as any`, `@ts-ignore`, `@ts-expect-error`
- Never commit unless explicitly requested
- Fix minimally when debugging, never refactor while fixing

## Beads Integration

- Create beads issues for each vertical slice
- Log progress to beads issue comments
- Close beads issue when plan completes
