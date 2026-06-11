import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmCommand } from '../../src/commands/rm.js';
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

describe('rmCommand', () => {
  let captured: string;
  let capturedErr: string;
  let deleted: string[];
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    resetRegistry();
    deleted = [];
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
      basePath: `/tmp/${name}`,
      listSessions: async () => [],
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session,
        files: [`/tmp/${name}/file.jsonl`],
        bytes: 1024,
      }),
      deleteSession: async (id: string): Promise<DeleteReport> => {
        deleted.push(`${name}:${id}`);
        return { session, files: [`/tmp/${name}/file.jsonl`], bytes: 1024 };
      },
      showSession: async () => session,
      exportSession: async () => ({ session, messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
      pruneSessions: async () => [],
    };
  }

  it('shows dry run with delete preview and does not delete', async () => {
    registerPlugin(createPlugin());
    await rmCommand({ id: 'aaaaaaa-b', agent: 'test', dryRun: true });
    expect(captured).toContain('DRY RUN');
    expect(captured).toContain('fix login');
    expect(captured).toContain('/tmp/test/file.jsonl');
    expect(captured).toContain('1.0 KB');
    expect(deleted).toHaveLength(0);
  });

  it('deletes with force and reports files and bytes', async () => {
    registerPlugin(createPlugin());
    await rmCommand({ id: 'aaaaaaa-b', agent: 'test', force: true });
    expect(captured).toContain('deleted 1 file(s), freed 1.0 KB');
    expect(deleted).toEqual(['test:aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']);
  });

  it('resolves a unique session without an agent', async () => {
    registerPlugin(createPlugin('test'));
    await rmCommand({ id: 'aaaaaaa-b', force: true });
    expect(captured).toContain('Agent:   test Agent');
    expect(deleted).toEqual(['test:aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']);
  });

  it('throws when no agent has the session', async () => {
    registerPlugin({
      ...createPlugin('test'),
      showSession: async (id: string) => {
        throw new Error(`session ${id} not found`);
      },
    });

    await expect(rmCommand({ id: 'missing', force: true })).rejects.toThrow(
      'session missing not found',
    );
    expect(deleted).toHaveLength(0);
  });

  it('throws with a helpful message when multiple agents match', async () => {
    registerPlugin(createPlugin('claude'));
    registerPlugin(createPlugin('codex'));

    await expect(rmCommand({ id: 'aaaaaaa-b', force: true })).rejects.toThrow(
      'session aaaaaaa-b found in multiple agents: claude, codex',
    );
    expect(deleted).toHaveLength(0);
  });

  it('throws for unknown agent', async () => {
    await expect(rmCommand({ id: 'x', agent: 'unknown', dryRun: true })).rejects.toThrow(
      'unknown agent "unknown"',
    );
    expect(capturedErr).toBe('');
  });
});
