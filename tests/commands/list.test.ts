import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listCommand } from '../../src/commands/list.js';
import { registerPlugin, resetRegistry } from '../../src/plugins/registry.js';
import { AgentPlugin } from '../../src/plugins/base.js';
import { Session, DeleteReport } from '../../src/types.js';

function createMockPlugin(name: string, sessions: Session[]): AgentPlugin {
  const emptyReport: DeleteReport = {
    session: sessions[0] ?? {
      id: '',
      shortId: '',
      title: '',
      project: '',
      updatedAt: '',
      messageCount: 0,
      agent: '',
    },
    files: [],
    bytes: 0,
  };
  return {
    name,
    label: `${name} Agent`,
    basePath: `/tmp/${name}`,
    listSessions: async (opts) => {
      let result = sessions;
      if (opts?.project) {
        result = result.filter((s) => s.project === opts.project);
      }
      return result;
    },
    deleteSession: async () => emptyReport,
    previewDeleteSession: async () => emptyReport,
    showSession: async (id) => sessions.find((s) => s.id === id) ?? sessions[0],
    exportSession: async (id) => ({
      session: sessions.find((s) => s.id === id) ?? sessions[0],
      messages: [],
      sourceFiles: [],
    }),
    searchSessions: async () => [],
  };
}

describe('listCommand', () => {
  let captured: string;
  let capturedErr: string;

  beforeEach(() => {
    resetRegistry();
    captured = '';
    capturedErr = '';
    const origOut = process.stdout.write;
    const origErr = process.stderr.write;
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      capturedErr += chunk;
      return true;
    }) as typeof process.stderr.write;
    return () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    };
  });

  afterEach(() => {});

  it('prints table with all sessions', async () => {
    const sessions: Session[] = [
      {
        id: 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        shortId: 'aaaaaaab',
        title: 'fix login',
        project: '/home/test',
        updatedAt: '2026-04-15T10:20:30.000Z',
        messageCount: 5,
        agent: 'test',
      },
    ];
    registerPlugin(createMockPlugin('test', sessions));
    await listCommand({});
    expect(captured).toContain('fix login');
    expect(captured).toContain('aaaaaaab');
  });

  it('prints empty message when no sessions', async () => {
    registerPlugin(createMockPlugin('test', []));
    await listCommand({});
    expect(capturedErr).toContain('no sessions');
  });

  it('filters by agent', async () => {
    const plugin1 = createMockPlugin('a', [
      {
        id: 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        shortId: 'aaaaaaaa',
        title: 'session A',
        project: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
        messageCount: 1,
        agent: 'a',
      },
    ]);
    const plugin2 = createMockPlugin('b', [
      {
        id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
        shortId: 'bbbbbbbb',
        title: 'session B',
        project: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
        messageCount: 1,
        agent: 'b',
      },
    ]);
    registerPlugin(plugin1);
    registerPlugin(plugin2);
    await listCommand({ agent: 'a' });
    expect(captured).toContain('session A');
    expect(captured).not.toContain('session B');
  });

  it('throws for unknown agent', async () => {
    registerPlugin(createMockPlugin('test', []));
    await expect(listCommand({ agent: 'unknown' })).rejects.toThrow('unknown agent "unknown"');
    expect(capturedErr).toBe('');
  });
});
