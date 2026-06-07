# Rules System

Language-specific and concern-specific coding rules consumed by agents during execution.

## Structure

```
rules/
├── languages/       # Language-specific rules
│   ├── typescript.md
│   ├── python.md
│   ├── shell.md
│   └── nix.md
├── concerns/        # Cross-cutting concerns
│   ├── tdd.md
│   ├── testing.md
│   ├── naming.md
│   ├── git-workflow.md
│   ├── coding-style.md
│   ├── documentation.md
│   ├── efficiency.md
│   └── project-structure.md
└── frameworks/      # Framework-specific rules
    └── (empty — add as needed)
```

## Usage

Agents reference these rules during execution. Key rules are injected into context when relevant:

- **TypeScript project** → Load `languages/typescript.md`
- **TDD task** → Load `concerns/tdd.md`
- **Git operations** → Load `concerns/git-workflow.md`
- **Project with README docs** → Load `concerns/documentation.md`
- **Complex directory structure** → Load `concerns/project-structure.md`

## Extending

Add new rules by creating `.md` files in appropriate subdirectory. Agents will discover and load them based on project type and task context.
