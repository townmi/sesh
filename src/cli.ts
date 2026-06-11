#!/usr/bin/env node
import { Command } from 'commander';
import { listCommand } from './commands/list.js';
import { rmCommand } from './commands/rm.js';
import { showCommand } from './commands/show.js';
import { pruneCommand } from './commands/prune.js';
import { searchCommand } from './commands/search.js';
import { exportCommand } from './commands/export.js';
import { registerPlugin } from './plugins/registry.js';
import { ClaudePlugin } from './plugins/claude.js';
import { CodexPlugin } from './plugins/codex.js';

registerPlugin(new ClaudePlugin());
registerPlugin(new CodexPlugin());

const program = new Command();

function runCommand(action: () => Promise<void>): void {
  action().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  });
}

program.name('sesh').description('manage AI agent sessions').version('0.1.0');

program
  .command('list')
  .description('list sessions')
  .option('--agent <name>', 'filter by agent (claude, codex)')
  .option('--project <path>', 'filter by project path')
  .option('--verbose', 'show message count')
  .action((opts) => runCommand(() => listCommand(opts)));

program
  .command('rm <id>')
  .description('delete a session')
  .option('--agent <name>', 'agent that owns this session')
  .option('-n, --dry-run', 'preview without deleting')
  .option('-f, --force', 'skip confirmation prompt')
  .action((id, opts) => runCommand(() => rmCommand({ ...opts, id })));

program
  .command('show <id>')
  .description('show session details')
  .option('--agent <name>', 'agent that owns this session')
  .action((id, opts) => runCommand(() => showCommand({ ...opts, id })));

program
  .command('export <id> [output]')
  .description('export a session to a Markdown file')
  .option('--agent <name>', 'agent that owns this session')
  .action((id, output, opts) => runCommand(() => exportCommand({ ...opts, id, output })));

program
  .command('prune [olderThan]')
  .description('delete old sessions')
  .option('--older-than <duration>', 'age threshold (e.g. 30d, 24h)')
  .option('--agent <name>', 'filter by agent')
  .option('-n, --dry-run', 'preview without deleting')
  .option('-f, --force', 'skip confirmation prompt')
  .action((olderThan, opts) =>
    runCommand(() => pruneCommand({ ...opts, olderThan: opts.olderThan ?? olderThan })),
  );

program
  .command('search <query>')
  .description('search sessions by title')
  .option('--agent <name>', 'filter by agent')
  .action((query, opts) => runCommand(() => searchCommand({ ...opts, query })));

program.parse();
