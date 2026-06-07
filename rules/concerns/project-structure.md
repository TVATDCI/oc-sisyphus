# Project Structure Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## TypeScript / Node.js

```
project/
├── src/
│   ├── index.ts         # Entry point
│   ├── core/            # Business logic
│   ├── utils/           # Helpers
│   └── types.ts        # Shared types
├── tests/
│   └── *.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

**Rules:**
- One module per file
- Index exports from `src/index.ts`
- Config in root: `package.json`, `tsconfig.json`
- Tests separate from source

## Python

```
project/
├── src/myproject/
│   ├── __init__.py
│   ├── main.py          # Entry point
│   └── core/
│       └── module.py
├── tests/
│   └── test_module.py
├── pyproject.toml
└── README.md
```

**Rules:**
- Use src layout
- `__init__.py` in every package
- Config in root: `pyproject.toml`

## General

- Use kebab-case for directories and files
- Config files in project root
- Tests separate from source (`tests/` or `__tests__/`)
- Docs in root: README.md
- Hidden configs: .env, .gitignore
- One module per file — files that change together live together
