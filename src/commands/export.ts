import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolveFromPlugins } from '../utils/resolve.js';
import { AgentPlugin } from '../plugins/base.js';
import { SessionExport } from '../types.js';
import { formatDate } from '../utils/format.js';

export interface ExportOptions {
  id: string;
  agent?: string;
  output?: string;
}

function markdownEscape(str: string): string {
  return str.replace(/\r\n/g, '\n').trim();
}

function formatMarkdown(plugin: AgentPlugin, exported: SessionExport): string {
  const { session, messages, sourceFiles } = exported;
  const lines = [
    `# ${session.title}`,
    '',
    `- ID: ${session.id}`,
    `- Agent: ${plugin.label} (${session.agent})`,
    `- Project: ${session.project || 'none'}`,
    `- Updated: ${formatDate(session.updatedAt)}`,
    `- Messages: ${session.messageCount}`,
  ];

  if (sourceFiles.length > 0) {
    lines.push(`- Source: ${sourceFiles.join(', ')}`);
  }

  lines.push('', '## Transcript', '');

  if (messages.length === 0) {
    lines.push('_No transcript messages found._', '');
    return `${lines.join('\n')}\n`;
  }

  for (const message of messages) {
    const timestamp = message.timestamp ? ` - ${message.timestamp}` : '';
    lines.push(`### ${message.role}${timestamp}`, '', markdownEscape(message.content), '');
  }

  return `${lines.join('\n')}\n`;
}

export async function exportCommand(opts: ExportOptions): Promise<void> {
  const { plugin, result: exported } = await resolveFromPlugins(opts, (p, id) =>
    p.exportSession(id),
  );
  const output = resolve(opts.output ?? `session-${exported.session.shortId}.md`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, formatMarkdown(plugin, exported), 'utf-8');
  process.stdout.write(`exported ${exported.session.id} to ${output}\n`);
}
