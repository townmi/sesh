import { createInterface } from 'node:readline';
import { getPlugin, getPlugins } from '../plugins/registry.js';
import { AgentPlugin } from '../plugins/base.js';
import { formatBytes, formatDate } from '../utils/format.js';
import { Session } from '../types.js';

export interface RmOptions {
  id: string;
  agent?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface ResolvedSession {
  plugin: AgentPlugin;
  session: Session;
}

async function promptConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function resolveSession(opts: RmOptions): Promise<ResolvedSession> {
  if (opts.agent !== undefined) {
    const plugin = getPlugin(opts.agent);
    if (!plugin) {
      throw new Error(`unknown agent "${opts.agent}"`);
    }
    const session = await plugin.showSession(opts.id);
    return { plugin, session };
  }

  const matches: ResolvedSession[] = [];
  for (const plugin of getPlugins()) {
    try {
      const session = await plugin.showSession(opts.id);
      matches.push({ plugin, session });
    } catch {
      /* session does not belong to this plugin */
    }
  }

  if (matches.length === 0) {
    throw new Error(`session ${opts.id} not found`);
  }

  if (matches.length > 1) {
    const agents = matches.map((match) => match.plugin.name).join(', ');
    throw new Error(`session ${opts.id} found in multiple agents: ${agents}; specify --agent`);
  }

  return matches[0];
}

export async function rmCommand(opts: RmOptions): Promise<void> {
  const { plugin, session } = await resolveSession(opts);

  if (opts.dryRun) {
    const report = await plugin.previewDeleteSession(session.id);
    process.stdout.write(`\nDRY RUN — would delete:\n\n`);
    process.stdout.write(`  Session: ${session.title}\n`);
    process.stdout.write(`  Agent:   ${plugin.label}\n`);
    process.stdout.write(`  Project: ${session.project || 'none'}\n`);
    process.stdout.write(`  Updated: ${formatDate(session.updatedAt)}\n\n`);
    process.stdout.write(`  Files:   ${report.files.length}\n`);
    for (const file of report.files) {
      process.stdout.write(`           ${file}\n`);
    }
    process.stdout.write(`  Bytes:   ${formatBytes(report.bytes)}\n\n`);
    return;
  }

  process.stdout.write(`\nAbout to delete:\n\n`);
  process.stdout.write(`  Session: ${session.title}\n`);
  process.stdout.write(`  Agent:   ${plugin.label}\n`);
  process.stdout.write(`  Project: ${session.project || 'none'}\n`);
  process.stdout.write(`  Updated: ${formatDate(session.updatedAt)}\n\n`);

  if (!opts.force) {
    const confirmed = await promptConfirm('Delete this session? [y/N] ');
    if (!confirmed) {
      process.stderr.write('cancelled\n');
      return;
    }
  }

  const deleteReport = await plugin.deleteSession(session.id);
  process.stdout.write(
    `deleted ${deleteReport.files.length} file(s), freed ${formatBytes(deleteReport.bytes)}\n`,
  );
}
