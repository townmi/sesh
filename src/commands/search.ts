import { getPlugins } from '../plugins/registry.js';
import { truncateMiddle, sanitize, formatDate, formatTable } from '../utils/format.js';
import { Session } from '../types.js';

export interface SearchOptions {
  query: string;
  agent?: string;
}

export async function searchCommand(opts: SearchOptions): Promise<void> {
  const plugins = getPlugins().filter((p) => !opts.agent || p.name === opts.agent);
  if (opts.agent && plugins.length === 0) {
    throw new Error(`unknown agent "${opts.agent}"`);
  }

  const allResults: Session[] = [];
  for (const plugin of plugins) {
    const results = await plugin.searchSessions(opts.query);
    allResults.push(...results);
  }

  if (allResults.length === 0) {
    process.stdout.write('no results\n');
    return;
  }

  allResults.sort((a, b) => {
    if (a.agent !== b.agent) return a.agent.localeCompare(b.agent);
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const rows = allResults.map((s) => ({
    ID: s.shortId,
    AGENT: s.agent,
    PROJECT: truncateMiddle(s.project || '-', 40),
    TITLE: sanitize(s.title),
    DATE: formatDate(s.updatedAt),
  }));

  process.stdout.write(formatTable(rows, { TITLE: 40, PROJECT: 40 }) + '\n');
}
