import { getPlugin, getPlugins } from '../plugins/registry.js';
import { AgentPlugin } from '../plugins/base.js';

export interface ResolveOptions {
  id: string;
  agent?: string;
}

export interface Resolved<T> {
  plugin: AgentPlugin;
  result: T;
}

export async function resolveFromPlugins<T>(
  opts: ResolveOptions,
  resolve: (plugin: AgentPlugin, id: string) => Promise<T>,
): Promise<Resolved<T>> {
  if (opts.agent !== undefined) {
    const plugin = getPlugin(opts.agent);
    if (!plugin) {
      throw new Error(`unknown agent "${opts.agent}"`);
    }
    const result = await resolve(plugin, opts.id);
    return { plugin, result };
  }

  const matches: Resolved<T>[] = [];
  for (const plugin of getPlugins()) {
    try {
      const result = await resolve(plugin, opts.id);
      matches.push({ plugin, result });
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
