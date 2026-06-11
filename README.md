# sesh

CLI tool for browsing, inspecting, exporting, and deleting AI agent sessions.

`sesh` currently supports:

- Claude Code sessions from `~/.claude/`
- Codex sessions from `~/.codex/`

## Install

From source:

```bash
npm install
npm run build
npm link
sesh --help
```

From a GitHub Release tarball:

```bash
npm install -g https://github.com/<owner>/<repo>/releases/download/v0.1.0/sesh-0.1.0.tgz
sesh --help
```

Replace `<owner>/<repo>` with the repository path.

## Usage

```bash
sesh list
sesh list --agent codex
sesh list --project /path/to/project --verbose

sesh search resume

sesh show <session-id>
sesh show <session-id> --agent claude

sesh export <session-id>
sesh export <session-id> ./session.md
sesh export <session-id> ./session.md --agent codex

sesh rm <session-id>
sesh rm <session-id> --dry-run
sesh rm <session-id> --force

sesh prune 40d
sesh prune --older-than 24h --dry-run
```

Most single-session commands can infer the agent automatically. If the same ID is found in more than one agent, pass `--agent claude` or `--agent codex`.

## Commands

### `list`

Shows sessions in a table.

Options:

- `--agent <name>` filters by `claude` or `codex`
- `--project <path>` filters by project path
- `--verbose` includes message count

### `search <query>`

Searches session titles.

### `show <id>`

Shows session metadata: title, agent, project, update time, and message count.

### `export <id> [output]`

Exports a session to a Markdown file. If `output` is omitted, the file is written as `session-<shortId>.md` in the current directory.

### `rm <id>`

Deletes one session. By default it previews the session and asks for confirmation before deleting.

Options:

- `-n, --dry-run` previews without deleting
- `-f, --force` skips the confirmation prompt

### `prune [duration]`

Deletes sessions older than a duration.

Examples:

```bash
sesh prune 40d
sesh prune --older-than 24h
sesh prune 30d --dry-run
```

Durations support `d` for days and `h` for hours.

## Development

```bash
npm install
npm run lint
npm run test
npm run build
node bin/sesh.js list
```

Before committing changes, run:

```bash
npm run lint
npm run test
npm run build
```

## Release

Create and push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will:

1. Install dependencies with `npm ci`
2. Run lint, tests, and build
3. Create an npm package tarball with `npm pack`
4. Attach the tarball to the GitHub Release

The release asset can be installed with:

```bash
npm install -g https://github.com/<owner>/<repo>/releases/download/v0.1.0/sesh-0.1.0.tgz
```
