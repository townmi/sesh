import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportCommand } from '../../src/commands/export.js';
import { registerPlugin, resetRegistry } from '../../src/plugins/registry.js';
import { AgentPlugin } from '../../src/plugins/base.js';
import { DeleteReport, Session, SessionExport } from '../../src/types.js';

const testSession: Session = {
  id: 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  shortId: 'aaaaaaab',
  title: 'fix login',
  project: '/home/test',
  updatedAt: '2026-04-15T10:20:30.000Z',
  messageCount: 2,
  agent: 'test',
};

function createPlugin(name = 'test', exported?: SessionExport): AgentPlugin {
  const session = { ...testSession, agent: name };
  const exportData = exported ?? {
    session,
    messages: [
      { role: 'user', content: 'please fix login', timestamp: '2026-04-15T10:20:30.000Z' },
      { role: 'assistant', content: 'fixed login', timestamp: '2026-04-15T10:21:30.000Z' },
    ],
    sourceFiles: ['/tmp/session.jsonl'],
  };
  const emptyReport: DeleteReport = { session, files: [], bytes: 0 };
  return {
    name,
    label: `${name} Agent`,
    basePath: `/tmp/${name}`,
    listSessions: async () => [],
    previewDeleteSession: async () => emptyReport,
    deleteSession: async () => emptyReport,
    showSession: async () => session,
    exportSession: async () => exportData,
    searchSessions: async () => [],
    pruneSessions: async () => [],
  };
}

describe('exportCommand', () => {
  let tmpDir: string;
  let captured: string;
  let originalStdoutWrite: typeof process.stdout.write;

  beforeEach(async () => {
    resetRegistry();
    tmpDir = await mkdtemp(join(tmpdir(), 'sesh-export-'));
    captured = '';
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(async () => {
    process.stdout.write = originalStdoutWrite;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exports a session to a Markdown file', async () => {
    registerPlugin(createPlugin());
    const output = join(tmpDir, 'out.md');
    await exportCommand({ id: 'aaaaaaab', output });

    const content = await readFile(output, 'utf-8');
    expect(content).toContain('# fix login');
    expect(content).toContain('Agent: test Agent (test)');
    expect(content).toContain('please fix login');
    expect(content).toContain('fixed login');
    expect(captured).toContain(output);
  });

  it('uses a default Markdown filename', async () => {
    registerPlugin(createPlugin());
    const cwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await exportCommand({ id: 'aaaaaaab' });
      const content = await readFile(join(tmpDir, 'session-aaaaaaab.md'), 'utf-8');
      expect(content).toContain('# fix login');
    } finally {
      process.chdir(cwd);
    }
  });

  it('throws when multiple agents match', async () => {
    registerPlugin(createPlugin('claude'));
    registerPlugin(createPlugin('codex'));

    await expect(exportCommand({ id: 'aaaaaaab', output: join(tmpDir, 'out.md') })).rejects.toThrow(
      'session aaaaaaab found in multiple agents: claude, codex',
    );
  });
});
