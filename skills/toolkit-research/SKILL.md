---
name: toolkit-research
description: "Web research tools — web search, URL fetching, library documentation lookup, GitHub code search. Use when: (1) searching the web for current information, (2) fetching documentation from URLs, (3) looking up library APIs and examples via Context7, (4) finding real-world code examples on GitHub. Triggers: web search, research, documentation lookup, code examples, library API, GitHub search."
compatibility: opencode
---

# Research Toolkit

Web and documentation research tools. Load when research is needed to avoid cluttering context during implementation.

## Available Tools

### `websearch` / `websearch_web_search_exa`
Search the web for current information.

```typescript
websearch({ query: "Next.js 15 server actions best practices", numResults: 8 })
```

Use `websearch_web_search_exa` for semantically rich queries — describe the ideal page, not just keywords.

### `webfetch`
Fetch content from a specific URL. Converts to markdown by default.

```typescript
webfetch({ url: "https://example.com/docs", format: "markdown" })
```

**Formats:** `markdown` (default), `text`, `html`
**Timeout:** max 120 seconds

### `context7_resolve-library-id` + `context7_query-docs`
Two-step process for library documentation:

```typescript
// Step 1: Resolve library to Context7 ID
context7_resolve-library-id({ query: "Next.js authentication patterns", libraryName: "Next.js" })

// Step 2: Query docs with the resolved ID
context7_query-docs({ libraryId: "/vercel/next.js", query: "How to set up middleware for auth" })
```

**Limits:** Max 3 calls per question. Resolve first, then query.

### `grep_app_searchGitHub`
Find real-world code examples from public GitHub repositories.

```typescript
// Search for literal code patterns (NOT keywords)
grep_app_searchGitHub({ query: "useEffect(() => {", language: ["TypeScript", "TSX"] })

// Use regex for flexible patterns
grep_app_searchGitHub({ query: "(?s)function.*authenticate", useRegexp: true, language: ["Python"] })
```

**Key rules:**
- Search for CODE, not keywords — `'createRouter('` not `'vue router setup'`
- Use `useRegexp: true` for flexible patterns
- Filter by `language`, `repo`, or `path` to narrow results

### Semble (Code Search)

**Semble tools unavailable pending recovery** — the `semble` binary never
migrated to this desk and its MCP entry was removed from `opencode.json`
(2026-09-05); `Grep`/`Read` fallback is the primary code-search path for now.
(Legacy usage below retained for the CLI fallback if `semble` is reinstalled.)

```bash
semble search "your query" ./path
semble find-related src/file.py 42 ./path
```

## Recommended Workflow

```
1. Grep/Read → local code search (semble unavailable till recovery)
2. websearch → find relevant pages or docs
3. context7_resolve-library-id → find official docs
4. context7_query-docs → get API details
5. grep_app_searchGitHub → see real implementation examples
6. webfetch → pull specific pages for deep reading
```
