# AGENTS.md — sesh AI Agent Conventions

## What is sesh?

`sesh` is a CLI tool to browse and delete AI agent sessions. It manages session data for Claude Code (`~/.claude/`) and Codex (`~/.codex/`).

## Rules for AI Agents Working on This Project

### Always
- Follow TDD: write a failing test, make it pass, refactor
- Run `npm run lint` after every change
- Run `npm run test` before claiming something works
- Commit after each completed task
- Read the design spec before starting: `docs/superpowers/specs/2026-06-10-sesh-design.md`

### Never
- Skip writing tests
- Use `any` type in TypeScript
- Add new dependencies without explicit user approval
- Commit `dist/` or `node_modules/`
- Hardcode an agent's base path — use the plugin interface
- Write console.log in library code — use proper error throwing

### File Naming
- Source: `src/<category>/<name>.ts` (kebab-case)
- Tests: `tests/<category>/<name>.test.ts` (mirrors source)
- Fixtures: `tests/fixtures/<agent>/` (realistic mock data)

### TypeScript
- Strict mode in tsconfig
- All function signatures typed (params + return)
- Export types from `src/types.ts`
- One interface/type per concept — no duplication

### Error Handling
- Missing agent directory: warn via stderr, return empty array, do not crash
- Corrupted JSONL line: warn with line number, skip line
- Delete failures: report which files failed, continue with remaining files
- Invalid session ID: throw error "session <id> not found"

### Testing Pattern
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// One describe per function
// One it per behavior
// beforeEach: create temp dir with fixture data
// afterEach: remove temp dir
```

### Build & Run
```bash
npm run build        # tsc compiles to dist/
npm run test         # vitest run (all tests)
npm run test -- -t "pattern"  # run matching tests
node bin/sesh.js     # run CLI from source (during development)
```

### Plugin Interface (reference)
See `src/plugins/base.ts` for the full `AgentPlugin` interface.
New agent plugins must implement all methods: `list`, `delete`, `show`, `search`, `prune`.
Register new plugins in `src/plugins/registry.ts`.