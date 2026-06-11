import { getPlugins } from '../plugins/registry.js';
import { formatBytes } from '../utils/format.js';
import { createInterface } from 'node:readline';

export interface PruneOptions {
  agent?: string;
  olderThan?: string;
  dryRun?: boolean;
  force?: boolean;
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

export async function pruneCommand(opts: PruneOptions): Promise<void> {
  const match = opts.olderThan?.match(/^(\d+)([dh])$/);
  if (!match) {
    process.stderr.write('error: older-than must be like 30d or 24h\n');
    return;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const cutoff = Date.now() - value * (unit === 'd' ? 86400000 : 3600000);

  const plugins = getPlugins().filter((p) => !opts.agent || p.name === opts.agent);
  if (opts.agent && plugins.length === 0) {
    throw new Error(`unknown agent "${opts.agent}"`);
  }

  const toPrune: { pluginName: string; sessionId: string; title: string; updatedAt: string }[] = [];
  for (const plugin of plugins) {
    const sessions = await plugin.listSessions();
    for (const session of sessions) {
      if (new Date(session.updatedAt).getTime() < cutoff) {
        toPrune.push({
          pluginName: plugin.name,
          sessionId: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
        });
      }
    }
  }

  if (toPrune.length === 0) {
    process.stderr.write('no sessions to prune\n');
    return;
  }

  if (opts.dryRun) {
    process.stdout.write(`\nDRY RUN — would prune ${toPrune.length} session(s):\n\n`);
    for (const s of toPrune) {
      process.stdout.write(`  [${s.pluginName}] ${s.title} (${s.sessionId.slice(0, 8)})\n`);
    }
    process.stdout.write('\n');
    return;
  }

  process.stdout.write(`\nAbout to prune ${toPrune.length} session(s):\n\n`);
  for (const s of toPrune) {
    process.stdout.write(`  [${s.pluginName}] ${s.title} (${s.sessionId.slice(0, 8)})\n`);
  }
  process.stdout.write('\n');

  if (!opts.force) {
    const confirmed = await promptConfirm('Delete these sessions? [y/N] ');
    if (!confirmed) {
      process.stderr.write('cancelled\n');
      return;
    }
  }

  let totalBytes = 0;
  for (const s of toPrune) {
    const plugin = plugins.find((p) => p.name === s.pluginName);
    if (plugin) {
      const report = await plugin.deleteSession(s.sessionId);
      totalBytes += report.bytes;
    }
  }

  process.stderr.write(`pruned ${toPrune.length} session(s), freed ${formatBytes(totalBytes)}\n`);
}
