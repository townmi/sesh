# sesh — CLI Agent Session Manager — Design Spec

## Overview

`sesh` is a Unix-style CLI tool for managing AI agent sessions (Claude Code, Codex). It provides browse, delete, show, prune, and search commands through a unified interface.

## Commands

```
sesh list    [--agent <name>] [--project <path>] [--verbose]
sesh rm      <id> --agent <name> [--dry-run|-n] [--force|-f]
sesh show    <id> --agent <name>
sesh prune   [--agent <name>] [--older-than <duration>] [-n] [-f]
sesh search  <query> [--agent <name>]
```

### `sesh list`
Shows sessions in a table: short-id (8 chars), agent badge `[codex]` / `[claude]`, title (truncated), project path, last-updated date.
`--verbose` adds message count.
`--agent` filters by agent.
`--project` filters by project path.

### `sesh rm`
Dry-run summary showing session details and files to be deleted, then `y/N` prompt.
`-f` / `--force` skips the prompt.
`-n` / `--dry-run` shows preview without prompt.
Requires `--agent` to specify which agent owns the session.

### `sesh show`
Displays full session: title, project, date, message count, truncated first message preview.

### `sesh prune`
Bulk delete sessions older than a duration. `--older-than 30d` deletes sessions older than 30 days.
Same dry-run/force flags as `rm`.

### `sesh search`
Fuzzy/grep search across session titles. Returns table of matches.

## Architecture

```
┌─────────────┐
│   sesh CLI  │  commander + chalk
├──────────────┤
│  list, rm,  │
│  show,prune,│
│   search     │
└──────┬──────┘
       │
┌──────┴──────────────────┐
│   Agent Plugin System    │
│                          │
│  ┌────────┐  ┌────────┐  │
│  │ Claude │  │ Codex  │  │
│  │ Plugin │  │ Plugin │  │
│  └───┬────┘  └───┬────┘  │
│      │            │       │
│  ~/.claude/  ~/.codex/   │
└──────────────────────────┘
```

## Plugin Interface

```typescript
interface Session {
  id: string;
  shortId: string;
  title: string;
  project: string;
  updatedAt: string;
  messageCount: number;
  agent: string;
}

interface DeleteReport {
  session: Session;
  files: string[];
  bytes: number;
}

interface AgentPlugin {
  name: string;
  label: string;
  basePath: string;
  list(project?: string, verbose?: boolean): Promise<Session[]>;
  delete(sessionId: string): Promise<DeleteReport>;
  show(sessionId: string): Promise<Session>;
  search(query: string): Promise<Session[]>;
  prune(olderThan: string): Promise<DeleteReport[]>;
}
```

## Agent Data Sources

### Claude Code (`~/.claude/`)
- `history.jsonl` — entries keyed by `sessionId` and `project`. Each line: `{display, pastedContents, timestamp, project, sessionId}`
- `projects/<project-path>/<sessionId>.jsonl` — per-session conversation file
- `projects/<project-path>/<sessionId>/` — per-session data directory
- `session-env/<sessionId>/` — session environment data

**list()**: Group `history.jsonl` by `(sessionId, project)`. Title from first `display`, count from entry count.
**delete()**: Remove matching entries from `history.jsonl`, delete `<sessionId>.jsonl` and `<sessionId>/` from `projects/<project>/`, delete `session-env/<sessionId>/`.

### Codex (`~/.codex/`)
- `session_index.jsonl` — clean index: `{id, thread_name, updated_at}`
- `history.jsonl` — messages: `{session_id, ts, text}`
- `sessions/YYYY/MM/DD/` — session data directories
- `archived_sessions/` — archived sessions

**list()**: Read `session_index.jsonl` directly. Message count from grepping `history.jsonl`.
**delete()**: Remove entry from `session_index.jsonl`, remove matching messages from `history.jsonl`, delete `sessions/` directory for that session.

## Project Structure

```
sesh/
├── package.json
├── tsconfig.json
├── bin/
│   └── sesh.js
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── list.ts
│   │   ├── rm.ts
│   │   ├── show.ts
│   │   ├── prune.ts
│   │   └── search.ts
│   ├── plugins/
│   │   ├── base.ts
│   │   ├── registry.ts
│   │   ├── claude.ts
│   │   └── codex.ts
│   ├── types.ts
│   └── utils/
│       ├── format.ts
│       └── fs.ts
├── tests/
│   ├── plugins/
│   │   ├── claude.test.ts
│   │   └── codex.test.ts
│   ├── commands/
│   │   ├── list.test.ts
│   │   └── rm.test.ts
│   └── fixtures/
│       ├── claude/
│       └── codex/
└── README.md
```

## Error Handling & Edge Cases

- **Missing agent dir**: Warn and skip, don't crash
- **Concurrent access**: Atomic writes via temp-file + rename
- **Partial delete**: Report per-file failures, continue
- **Corrupted JSONL**: Skip malformed lines, warn with line number
- **Non-existent session ID**: Error "session <id> not found"
- **No sessions to prune**: Inform user, exit 0

## Distribution

- **npm**: `npm install -g sesh`
- **Binary**: Via pkg — single-file executable for systems without Node.js

## Testing

- **Vitest** with TypeScript
- Plugin tests use temp directories with fixture data
- Command tests invoke CLI functions with mocked plugins
- Fixture data mirrors real `~/.claude/` and `~/.codex/` structures