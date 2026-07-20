---
name: toolkit-session
description: "Session management tools — inspect, search, and manage OpenCode sessions. Use when: (1) finding information from past sessions, (2) checking what happened in a previous conversation, (3) searching across all session history, (4) listing sessions for a project, (5) retrieving session metadata. Triggers: session history, past session, search sessions, session info, session list, what did we do before."
compatibility: opencode
---

# Session Toolkit

OpenCode session management tools. Load when you need to reference past work or search across session history.

## Available Tools

### `session_info`
Get metadata and statistics about a specific OpenCode session.

```typescript
session_info({ session_id: "ses_abc123" })
```

Returns message count, date range, duration, agents used, todo stats, transcript availability.

### `session_list`
List all OpenCode sessions with optional filtering.

```typescript
// Last 10 sessions
session_list({ limit: 10 })

// Sessions from a date range
session_list({ from_date: "2026-05-01", to_date: "2026-05-24" })

// Sessions for current project
session_list({ project_path: "~/developer/projects/rotating-x" })
```

### `session_read`
Read messages and history from a past session.

```typescript
// Basic read
session_read({ session_id: "ses_abc123" })

// Include todos and transcripts
session_read({ session_id: "ses_abc123", include_todos: true, include_transcript: true })

// Last 20 messages
session_read({ session_id: "ses_abc123", limit: 20 })
```

### `session_search`
Full-text search across session messages.

```typescript
// Search across all sessions
session_search({ query: "authentication middleware" })

// Search within specific session
session_search({ query: "beads init", session_id: "ses_abc123" })

// Case-sensitive search
session_search({ query: "API_KEY", case_sensitive: true })
```

## Recommended Workflow

```
1. session_search → find where we discussed X
2. session_info → check session metadata
3. session_list → find sessions for a project
4. session_read → read specific conversation
```
