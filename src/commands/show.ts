import { formatDate } from '../utils/format.js';
import { resolveFromPlugins } from '../utils/resolve.js';

export interface ShowOptions {
  id: string;
  agent?: string;
}

export async function showCommand(opts: ShowOptions): Promise<void> {
  const { plugin, result: session } = await resolveFromPlugins(opts, (p, id) => p.showSession(id));
  process.stdout.write(`\n`);
  process.stdout.write(`  ID:        ${session.id}\n`);
  process.stdout.write(`  Title:     ${session.title}\n`);
  process.stdout.write(`  Agent:     ${plugin.label} (${session.agent})\n`);
  process.stdout.write(`  Project:   ${session.project || 'none'}\n`);
  process.stdout.write(`  Updated:   ${formatDate(session.updatedAt)}\n`);
  process.stdout.write(`  Messages:  ${session.messageCount}\n`);
  process.stdout.write(`\n`);
}
