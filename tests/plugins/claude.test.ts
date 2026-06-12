import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudePlugin } from '../../src/plugins/claude.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function createFixture(basePath: string): Promise<void> {
  const historyPath = join(basePath, 'history.jsonl');
  await writeFile(
    historyPath,
    '{"display":"fix the login bug","pastedContents":{},"timestamp":1775541000000,"project":"/test-proj","sessionId":"aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}\n' +
      '{"display":"add validation","pastedContents":{},"timestamp":1775541100000,"project":"/test-proj","sessionId":"aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}\n' +
      '{"display":"set up database","pastedContents":{},"timestamp":1775542000000,"project":"/other-proj","sessionId":"11111111-2222-3333-4444-555555555555"}\n',
  );
  await mkdir(join(basePath, 'projects', '-test-proj'), { recursive: true });
  await writeFile(
    join(basePath, 'projects', '-test-proj', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl'),
    '{"type":"user","message":{"role":"user","content":"please fix login"},"timestamp":"2026-04-15T10:20:30.000Z"}\n' +
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"fixed login"}]},"timestamp":"2026-04-15T10:21:30.000Z"}\n',
  );
  await mkdir(join(basePath, 'session-env'), { recursive: true });
  await mkdir(join(basePath, 'session-env', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), {
    recursive: true,
  });
  await writeFile(
    join(basePath, 'session-env', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'env.json'),
    '{}',
  );
  await mkdir(join(basePath, 'file-history', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), {
    recursive: true,
  });
  await writeFile(
    join(basePath, 'file-history', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'files.json'),
    '{}',
  );
}

describe('ClaudePlugin', () => {
  let tmpDir: string;
  let plugin: ClaudePlugin;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sesh-claude-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await createFixture(tmpDir);
    plugin = new ClaudePlugin(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('listSessions', () => {
    it('returns sessions grouped by sessionId', async () => {
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
      const session = sessions.find((s) => s.id === 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session).toBeTruthy();
      expect(session!.title).toBe('fix the login bug');
      expect(session!.project).toBe('/test-proj');
      expect(session!.messageCount).toBe(2);
      expect(session!.agent).toBe('claude');
    });

    it('filters by project', async () => {
      const sessions = await plugin.listSessions({ project: '/other-proj' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].project).toBe('/other-proj');
    });

    it('returns empty array when history file is missing', async () => {
      const emptyPlugin = new ClaudePlugin(join(tmpDir, 'nonexistent'));
      const sessions = await emptyPlugin.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('returns delete report with files to remove', async () => {
      const report = await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.files.length).toBeGreaterThan(0);
    });

    it('removes session from history.jsonl index', async () => {
      await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('succeeds when session files are already gone (deletes before index)', async () => {
      await rm(join(tmpDir, 'projects'), { recursive: true, force: true });
      await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(1);
    });

    it('throws for unknown session', async () => {
      await expect(plugin.deleteSession('nonexistent')).rejects.toThrow('session');
    });
  });

  describe('previewDeleteSession', () => {
    it('returns delete report without removing session history', async () => {
      const report = await plugin.previewDeleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.files).toContain(
        join(tmpDir, 'projects', '-test-proj', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl'),
      );
      expect(report.files).toContain(
        join(tmpDir, 'file-history', 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      );

      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('showSession', () => {
    it('returns full session details', async () => {
      const session = await plugin.showSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session.title).toBe('fix the login bug');
    });

    it('returns full session details by short id', async () => {
      const session = await plugin.showSession('aaaaaaa-bbbb');
      expect(session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session.title).toBe('fix the login bug');
    });

    it('throws for unknown session', async () => {
      await expect(plugin.showSession('nonexistent')).rejects.toThrow('session');
    });
  });

  describe('exportSession', () => {
    it('exports normalized transcript messages', async () => {
      const exported = await plugin.exportSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(exported.session.title).toBe('fix the login bug');
      expect(exported.messages).toEqual([
        {
          role: 'user',
          content: 'please fix login',
          timestamp: '2026-04-15T10:20:30.000Z',
        },
        {
          role: 'assistant',
          content: 'fixed login',
          timestamp: '2026-04-15T10:21:30.000Z',
        },
      ]);
      expect(exported.sourceFiles[0]).toContain('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl');
    });
  });

  describe('searchSessions', () => {
    it('finds sessions by title', async () => {
      const sessions = await plugin.searchSessions('login');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].title).toBe('fix the login bug');
    });

    it('returns empty for no match', async () => {
      const sessions = await plugin.searchSessions('zzzzz');
      expect(sessions).toEqual([]);
    });
  });
});
