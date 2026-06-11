# sesh

Browse, search, export, and delete local AI agent sessions.

Supports:

- Claude Code: `~/.claude/`
- Codex: `~/.codex/`

## Install

From a GitHub Release:

```bash
npm install -g https://github.com/townmi/sesh/releases/download/v0.1.0/sesh-0.1.0.tgz
```

From source:

```bash
npm install
npm run build
npm link
```

Requires Node.js 22 or newer.

## Usage

```bash
sesh list
sesh list --agent codex
sesh list --project /path/to/project --verbose

sesh search resume
sesh show <id>

sesh export <id>
sesh export <id> ./session.md

sesh rm <id>
sesh rm <id> --dry-run
sesh rm <id> --force

sesh prune 40d
sesh prune --older-than 24h --dry-run
```

`show`, `export`, and `rm` infer the agent automatically. If an ID exists in more than one agent, pass `--agent claude` or `--agent codex`.
