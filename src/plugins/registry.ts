import { AgentPlugin } from './base.js';

let plugins: AgentPlugin[] = [];

export function registerPlugin(plugin: AgentPlugin): void {
  plugins.push(plugin);
}

export function getPlugins(): AgentPlugin[] {
  return [...plugins];
}

export function getPlugin(name: string): AgentPlugin | undefined {
  return plugins.find((p) => p.name === name);
}

export function resetRegistry(): void {
  plugins = [];
}
