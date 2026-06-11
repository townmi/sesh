# sesh

CLI tool for browsing, inspecting, exporting, and deleting AI agent sessions.

Repository: <https://github.com/townmi/sesh>

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
npm install -g https://github.com/townmi/sesh/releases/download/v0.1.0/sesh-0.1.0.tgz
sesh --help
```

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

The release workflow lives at `.github/workflows/release.yml`.

Option 1: create and push a version tag that matches the package version:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Option 2: run it from GitHub:

1. Open <https://github.com/townmi/sesh/actions/workflows/release.yml>
2. Click **Run workflow**
3. Enter a tag such as `v0.1.0`

The GitHub Actions release job will:

1. Install dependencies with `npm ci`
2. Run lint, tests, and build
3. Create an npm package tarball with `npm pack`
4. Publish a GitHub Release
5. Attach the installable `sesh-<version>.tgz` package

The release asset can be installed with:

```bash
npm install -g https://github.com/townmi/sesh/releases/download/v0.1.0/sesh-0.1.0.tgz
```

This release asset is an npm package that installs the `sesh` command. It is not a native standalone executable; Node.js 22 or newer is required.
