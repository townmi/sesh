import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showCommand } from '../../src/commands/show.js';
import { registerPlugin, resetRegistry } from '../../src/plugins/registry.js';
import { AgentPlugin } from '../../src/plugins/base.js';
import { Session, DeleteReport } from '../../src/types.js';

const testSession: Session = {
  id: 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  shortId: 'aaaaaaab',
  title: 'fix login',
  project: '/home/test',
  updatedAt: '2026-04-15T10:20:30.000Z',
  messageCount: 5,
  agent: 'test',
};

describe('showCommand', () => {
  let captured: string;
  let capturedErr: string;
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    resetRegistry();
    captured = '';
    capturedErr = '';
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      capturedErr += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });

  function createPlugin(name = 'test', session: Session = testSession): AgentPlugin {
    return {
      name,
      label: `${name} Agent`,
      basePath: '/tmp/test',
      listSessions: async () => [],
      deleteSession: async (): Promise<DeleteReport> => ({
        session,
        files: [],
        bytes: 0,
      }),
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session,
        files: [],
        bytes: 0,
      }),
      showSession: async () => session,
      exportSession: async () => ({ session, messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
    };
  }

  it('prints session details', async () => {
    registerPlugin(createPlugin());
    await showCommand({ id: 'aaaaaaa-b', agent: 'test' });
    expect(captured).toContain('fix login');
    expect(captured).toContain('/home/test');
    expect(captured).toContain('5');
  });

  it('resolves a unique session without an agent', async () => {
    registerPlugin(createPlugin('test'));
    await showCommand({ id: 'aaaaaaa-b' });
    expect(captured).toContain('fix login');
    expect(captured).toContain('test Agent (test)');
  });

  it('throws when no agent has the session', async () => {
    registerPlugin({
      ...createPlugin('test'),
      showSession: async (id: string) => {
        throw new Error(`session ${id} not found`);
      },
    });

    await expect(showCommand({ id: 'missing' })).rejects.toThrow('session missing not found');
  });

  it('throws with a helpful message when multiple agents match', async () => {
    registerPlugin(createPlugin('claude'));
    registerPlugin(createPlugin('codex'));

    await expect(showCommand({ id: 'aaaaaaa-b' })).rejects.toThrow(
      'session aaaaaaa-b found in multiple agents: claude, codex',
    );
  });

  it('shows error for unknown agent', async () => {
    await expect(showCommand({ id: 'x', agent: 'unknown' })).rejects.toThrow(
      'unknown agent "unknown"',
    );
    expect(capturedErr).toBe('');
  });
});
