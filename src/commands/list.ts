import { getPlugins } from '../plugins/registry.js';
import { truncateMiddle, sanitize, formatDate, formatTable } from '../utils/format.js';
import { Session } from '../types.js';

export interface ListOptions {
  agent?: string;
  project?: string;
  verbose?: boolean;
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const plugins = getPlugins().filter((p) => !opts.agent || p.name === opts.agent);
  if (opts.agent && plugins.length === 0) {
    throw new Error(`unknown agent "${opts.agent}"`);
  }

  const allSessions: Session[] = [];
  for (const plugin of plugins) {
    const sessions = await plugin.listSessions({ project: opts.project, verbose: opts.verbose });
    allSessions.push(...sessions);
  }

  if (allSessions.length === 0) {
    process.stderr.write('no sessions found\n');
    return;
  }

  allSessions.sort((a, b) => {
    if (a.agent !== b.agent) return a.agent.localeCompare(b.agent);
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const rows = allSessions.map((s) => {
    const row: Record<string, string> = {
      ID: s.shortId,
      AGENT: s.agent,
      PROJECT: truncateMiddle(s.project || '-', 40),
      TITLE: sanitize(s.title),
      DATE: formatDate(s.updatedAt),
    };
    if (opts.verbose) {
      row['MSGS'] = String(s.messageCount);
    }
    return row;
  });

  process.stdout.write(formatTable(rows, { TITLE: 40, PROJECT: 40 }) + '\n');
}
