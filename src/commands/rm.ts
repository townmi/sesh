import { formatBytes, formatDate } from '../utils/format.js';
import { promptConfirm } from '../utils/prompt.js';
import { resolveFromPlugins } from '../utils/resolve.js';

export interface RmOptions {
  id: string;
  agent?: string;
  dryRun?: boolean;
  force?: boolean;
}

export async function rmCommand(opts: RmOptions): Promise<void> {
  const { plugin, result: session } = await resolveFromPlugins(opts, (p, id) => p.showSession(id));

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
