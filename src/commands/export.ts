import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { getPlugin, getPlugins } from '../plugins/registry.js';
import { AgentPlugin } from '../plugins/base.js';
import { SessionExport } from '../types.js';
import { formatDate, formatShortId } from '../utils/format.js';

export interface ExportOptions {
  id: string;
  agent?: string;
  output?: string;
}

interface ResolvedExport {
  plugin: AgentPlugin;
  exported: SessionExport;
}

async function resolveExport(opts: ExportOptions): Promise<ResolvedExport> {
  if (opts.agent !== undefined) {
    const plugin = getPlugin(opts.agent);
    if (!plugin) {
      throw new Error(`unknown agent "${opts.agent}"`);
    }
    const exported = await plugin.exportSession(opts.id);
    return { plugin, exported };
  }

  const matches: ResolvedExport[] = [];
  for (const plugin of getPlugins()) {
    try {
      const exported = await plugin.exportSession(opts.id);
      matches.push({ plugin, exported });
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
  const resolvedExport = await resolveExport(opts);
  const shortId = formatShortId(resolvedExport.exported.session.id);
  const output = resolve(opts.output ?? `session-${shortId}.md`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, formatMarkdown(resolvedExport.plugin, resolvedExport.exported), 'utf-8');
  process.stdout.write(`exported ${resolvedExport.exported.session.id} to ${output}\n`);
}
