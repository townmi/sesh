import { getPlugins } from '../plugins/registry.js';
import { formatBytes } from '../utils/format.js';
import { promptConfirm } from '../utils/prompt.js';

export interface PruneOptions {
  agent?: string;
  olderThan?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface PruneFailure {
  pluginName: string;
  sessionId: string;
  error: string;
}

export async function pruneCommand(opts: PruneOptions): Promise<void> {
  const match = opts.olderThan?.match(/^(\d+)([dh])$/);
  if (!match) {
    throw new Error('older-than must be like 30d or 24h');
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
  const failures: PruneFailure[] = [];
  for (const s of toPrune) {
    const plugin = plugins.find((p) => p.name === s.pluginName);
    if (plugin) {
      try {
        const report = await plugin.deleteSession(s.sessionId);
        totalBytes += report.bytes;
      } catch (error) {
        failures.push({
          pluginName: s.pluginName,
          sessionId: s.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const deletedCount = toPrune.length - failures.length;
  process.stderr.write(`pruned ${deletedCount} session(s), freed ${formatBytes(totalBytes)}\n`);
  for (const failure of failures) {
    process.stderr.write(
      `failed to prune [${failure.pluginName}] ${failure.sessionId}: ${failure.error}\n`,
    );
  }
}
