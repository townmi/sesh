import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchCommand } from '../../src/commands/search.js';
import { registerPlugin, resetRegistry } from '../../src/plugins/registry.js';
import { AgentPlugin } from '../../src/plugins/base.js';
import { Session, DeleteReport } from '../../src/types.js';

const sessions: Session[] = [
  {
    id: 'aaaaaaa-bbbb',
    shortId: 'aaaaaaab',
    title: 'fix login bug',
    project: '/a',
    updatedAt: '2026-04-15T10:20:30.000Z',
    messageCount: 1,
    agent: 'test',
  },
  {
    id: 'bbbbbbbb-cccc',
    shortId: 'bbbbbbbb',
    title: 'add database',
    project: '/b',
    updatedAt: '2026-04-15T10:20:30.000Z',
    messageCount: 1,
    agent: 'test',
  },
];

describe('searchCommand', () => {
  let captured: string;

  beforeEach(() => {
    resetRegistry();
    captured = '';
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {});

  it('prints matching sessions', async () => {
    const plugin: AgentPlugin = {
      name: 'test',
      label: 'Test',
      basePath: '/tmp/test',
      listSessions: async () => [],
      deleteSession: async (): Promise<DeleteReport> => ({
        session: sessions[0],
        files: [],
        bytes: 0,
      }),
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session: sessions[0],
        files: [],
        bytes: 0,
      }),
      showSession: async () => sessions[0],
      exportSession: async () => ({ session: sessions[0], messages: [], sourceFiles: [] }),
      searchSessions: async (q) => sessions.filter((s) => s.title.includes(q)),
      pruneSessions: async () => [],
    };
    registerPlugin(plugin);
    await searchCommand({ query: 'login', agent: undefined });
    expect(captured).toContain('fix login bug');
    expect(captured).not.toContain('add database');
  });

  it('prints empty when no matches', async () => {
    const plugin: AgentPlugin = {
      name: 'test',
      label: 'Test',
      basePath: '/tmp/test',
      listSessions: async () => [],
      deleteSession: async (): Promise<DeleteReport> => ({
        session: sessions[0],
        files: [],
        bytes: 0,
      }),
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session: sessions[0],
        files: [],
        bytes: 0,
      }),
      showSession: async () => sessions[0],
      exportSession: async () => ({ session: sessions[0], messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
      pruneSessions: async () => [],
    };
    registerPlugin(plugin);
    await searchCommand({ query: 'zzzzz', agent: undefined });
    expect(captured).toContain('no results');
  });

  it('throws for unknown agent', async () => {
    await expect(searchCommand({ query: 'login', agent: 'unknown' })).rejects.toThrow(
      'unknown agent "unknown"',
    );
  });
});
