import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRegistry,
  registerPlugin,
  getPlugins,
  getPlugin,
} from '../../src/plugins/registry.js';
import { AgentPlugin } from '../../src/plugins/base.js';
import { Session, DeleteReport } from '../../src/types.js';

function createMockPlugin(name: string): AgentPlugin {
  const emptySession: Session = {
    id: '',
    shortId: '',
    title: '',
    project: '',
    updatedAt: '',
    messageCount: 0,
    agent: '',
  };
  const emptyReport: DeleteReport = { session: emptySession, files: [], bytes: 0 };
  return {
    name,
    label: `${name} Agent`,
    basePath: `/tmp/${name}`,
    listSessions: async () => [],
    deleteSession: async () => emptyReport,
    previewDeleteSession: async () => emptyReport,
    showSession: async () => emptySession,
    exportSession: async () => ({ session: emptySession, messages: [], sourceFiles: [] }),
    searchSessions: async () => [],
  };
}

describe('registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('starts with no plugins', () => {
    expect(getPlugins()).toEqual([]);
  });

  it('registers and retrieves a plugin', () => {
    const plugin = createMockPlugin('test');
    registerPlugin(plugin);
    expect(getPlugins()).toHaveLength(1);
    expect(getPlugin('test')).toBe(plugin);
  });

  it('returns undefined for unknown plugin', () => {
    expect(getPlugin('nonexistent')).toBeUndefined();
  });

  it('registers multiple plugins', () => {
    registerPlugin(createMockPlugin('a'));
    registerPlugin(createMockPlugin('b'));
    expect(getPlugins()).toHaveLength(2);
    expect(getPlugin('a')).toBeTruthy();
    expect(getPlugin('b')).toBeTruthy();
  });
});
