import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pruneCommand } from '../../src/commands/prune.js';
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

describe('pruneCommand', () => {
  let captured: string;
  let capturedErr: string;
  let prunedIds: string[];
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    resetRegistry();
    prunedIds = [];
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

  it('shows dry run without deleting', async () => {
    const plugin: AgentPlugin = {
      name: 'test',
      label: 'Test Agent',
      basePath: '/tmp/test',
      listSessions: async () => [testSession],
      deleteSession: async (id: string): Promise<DeleteReport> => {
        prunedIds.push(id);
        return { session: testSession, files: ['/tmp/f.jsonl'], bytes: 100 };
      },
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session: testSession,
        files: ['/tmp/f.jsonl'],
        bytes: 100,
      }),
      showSession: async () => testSession,
      exportSession: async () => ({ session: testSession, messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
    };
    registerPlugin(plugin);
    await pruneCommand({ olderThan: '1d', dryRun: true });
    expect(prunedIds).toHaveLength(0);
    expect(captured).toContain('DRY RUN');
  });

  it('validates older-than format', async () => {
    const plugin: AgentPlugin = {
      name: 'test',
      label: 'Test Agent',
      basePath: '/tmp/test',
      listSessions: async () => [],
      deleteSession: async (): Promise<DeleteReport> => ({
        session: testSession,
        files: [],
        bytes: 0,
      }),
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session: testSession,
        files: [],
        bytes: 0,
      }),
      showSession: async () => testSession,
      exportSession: async () => ({ session: testSession, messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
    };
    registerPlugin(plugin);
    await expect(pruneCommand({ olderThan: 'bad', dryRun: true })).rejects.toThrow(
      'older-than must be like',
    );
  });

  it('requires an older-than duration', async () => {
    await expect(pruneCommand({ dryRun: true })).rejects.toThrow('older-than must be like');
  });

  it('throws for unknown agent', async () => {
    await expect(pruneCommand({ olderThan: '1d', agent: 'unknown', dryRun: true })).rejects.toThrow(
      'unknown agent "unknown"',
    );
  });

  it('continues pruning remaining sessions after one delete fails', async () => {
    const failedSession: Session = {
      ...testSession,
      id: 'failed-session',
      title: 'failed delete',
    };
    const deletedSession: Session = {
      ...testSession,
      id: 'deleted-session',
      title: 'deleted session',
    };
    const failingPlugin: AgentPlugin = {
      name: 'failing',
      label: 'Failing Agent',
      basePath: '/tmp/failing',
      listSessions: async () => [failedSession],
      deleteSession: async () => {
        throw new Error('permission denied');
      },
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session: failedSession,
        files: [],
        bytes: 0,
      }),
      showSession: async () => failedSession,
      exportSession: async () => ({ session: failedSession, messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
    };
    const workingPlugin: AgentPlugin = {
      name: 'working',
      label: 'Working Agent',
      basePath: '/tmp/working',
      listSessions: async () => [deletedSession],
      deleteSession: async (id: string): Promise<DeleteReport> => {
        prunedIds.push(id);
        return { session: deletedSession, files: ['/tmp/f.jsonl'], bytes: 100 };
      },
      previewDeleteSession: async (): Promise<DeleteReport> => ({
        session: deletedSession,
        files: ['/tmp/f.jsonl'],
        bytes: 100,
      }),
      showSession: async () => deletedSession,
      exportSession: async () => ({ session: deletedSession, messages: [], sourceFiles: [] }),
      searchSessions: async () => [],
    };

    registerPlugin(failingPlugin);
    registerPlugin(workingPlugin);
    await pruneCommand({ olderThan: '1d', force: true });

    expect(prunedIds).toEqual(['deleted-session']);
    expect(capturedErr).toContain('pruned 1 session(s), freed 100 B');
    expect(capturedErr).toContain('failed to prune [failing] failed-session: permission denied');
  });
});
