import { getPlugin, getPlugins } from '../plugins/registry.js';
import { AgentPlugin } from '../plugins/base.js';
import { formatDate } from '../utils/format.js';
import { Session } from '../types.js';

export interface ShowOptions {
  id: string;
  agent?: string;
}

interface ResolvedSession {
  plugin: AgentPlugin;
  session: Session;
}

async function resolveSession(opts: ShowOptions): Promise<ResolvedSession> {
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

export async function showCommand(opts: ShowOptions): Promise<void> {
  const { plugin, session } = await resolveSession(opts);
  process.stdout.write(`\n`);
  process.stdout.write(`  ID:        ${session.id}\n`);
  process.stdout.write(`  Title:     ${session.title}\n`);
  process.stdout.write(`  Agent:     ${plugin.label} (${session.agent})\n`);
  process.stdout.write(`  Project:   ${session.project || 'none'}\n`);
  process.stdout.write(`  Updated:   ${formatDate(session.updatedAt)}\n`);
  process.stdout.write(`  Messages:  ${session.messageCount}\n`);
  process.stdout.write(`\n`);
}
