# CLAUDE.md — sesh Project Conventions

## Project Context

`sesh` is a Unix-style CLI tool for browsing and deleting AI agent sessions (Claude Code, Codex). Distributed as npm package + binary.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **Build**: tsc → dist/, bin/sesh.js as entry
- **CLI framework**: commander
- **Formatting**: chalk for colors
- **Testing**: Vitest
- **Linting**: ESLint
- **Formatting**: Prettier

## Directory Structure

```
sesh/
├── src/
│   ├── cli.ts              # Commander CLI setup (entry point)
│   ├── types.ts            # All shared types/interfaces
│   ├── commands/           # One file per command
│   ├── plugins/            # Agent plugin system
│   │   ├── base.ts         # Plugin interface
│   │   ├── registry.ts     # Plugin registration
│   │   ├── claude.ts       # Claude Code sessions
│   │   └── codex.ts        # Codex sessions
│   └── utils/
│       ├── format.ts       # Display formatting
│       └── fs.ts           # Safe file ops (JSONL, atomic write)
├── tests/
│   ├── plugins/            # Plugin unit tests
│   ├── commands/           # Command unit tests
│   └── fixtures/           # Mock session data
├── bin/sesh.js             # CLI entry with shebang
├── package.json
└── tsconfig.json
```

## Conventions

### Coding
- Single responsibility — each file does one thing well
- No classes unless unavoidable — prefer functions + typed objects
- No `any` types — define proper interfaces
- All async operations use `async/await`
- Import order: node builtins → third-party → local modules
- Error messages start lowercase, end without period
- No console.log in library code — throw or return errors
- Side effects only in `cli.ts` and command handlers

### Naming
- Files: kebab-case (`format.ts`, `rm.ts`)
- Functions: camelCase (`listSessions`, `deleteSession`)
- Types/Interfaces: PascalCase (`Session`, `AgentPlugin`)
- Constants: UPPER_SNAKE_CASE (`CLAUDE_BASE_PATH`)

### Testing
- Write tests BEFORE implementation (TDD)
- Every public function in plugins/utils has a test
- Use `tests/fixtures/` for mock data, not inline JSON
- Test file mirrors source: `src/plugins/claude.ts` → `tests/plugins/claude.test.ts`
- One `describe` per function, one `it` per behavior

### Commands
```bash
npm run build      # tsc compile
npm run test       # vitest run
npm run test:watch # vitest watch mode
npm run lint       # eslint + prettier check
npm run fmt        # prettier write
```

### Plugin Development
- Plugin interface is in `src/plugins/base.ts`
- `registry.ts` discovers plugins — NEVER reference plugins directly
- New agent: create `src/plugins/<name>.ts` implementing `AgentPlugin`, register in `registry.ts`
- Plugins are stateless — all state lives in the filesystem
- Plugins must handle missing directories gracefully (warn, skip, return [])

### Git
- Commit messages: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`
- One logical change per commit
- Never commit `dist/` or `node_modules/`

## Design Spec

Full spec: `docs/superpowers/specs/2026-06-10-sesh-design.md`