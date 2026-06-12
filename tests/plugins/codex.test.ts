import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodexPlugin } from '../../src/plugins/codex.js';
import { mkdir, writeFile, rm as rmFs } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function createFixture(basePath: string): Promise<void> {
  await writeFile(
    join(basePath, 'session_index.jsonl'),
    '{"id":"aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","thread_name":"fix the login bug","updated_at":"2026-04-15T10:20:30.000Z"}\n' +
      '{"id":"11111111-2222-3333-4444-555555555555","thread_name":"set up database","updated_at":"2026-04-14T08:00:00.000Z"}\n',
  );
  await writeFile(
    join(basePath, 'history.jsonl'),
    '{"session_id":"aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","ts":1775541000,"text":"fix the login bug"}\n' +
      '{"session_id":"aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","ts":1775541100,"text":"here is the fix"}\n',
  );
  await mkdir(join(basePath, 'sessions', '2026', '04', '15'), { recursive: true });
  await writeFile(
    join(
      basePath,
      'sessions',
      '2026',
      '04',
      '15',
      'rollout-2026-04-15T10-20-30-aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl',
    ),
    '{"timestamp":"2026-04-15T10:20:30.000Z","type":"session_meta","payload":{"id":"aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","cwd":"/test/codex/project"}}\n' +
      '{"timestamp":"2026-04-15T10:21:00.000Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"internal instructions"}]}}\n' +
      '{"timestamp":"2026-04-15T10:21:29.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}\n' +
      '{"timestamp":"2026-04-15T10:21:30.000Z","type":"event_msg","payload":{"type":"user_message","message":"hello"}}\n' +
      '{"timestamp":"2026-04-15T10:22:30.000Z","type":"event_msg","payload":{"type":"agent_message","message":"hi there"}}\n',
  );
  await mkdir(join(basePath, 'archived_sessions'), { recursive: true });
  await writeFile(
    join(basePath, 'archived_sessions', '11111111-2222-3333-4444-555555555555.jsonl'),
    'archived data',
  );
}

describe('CodexPlugin', () => {
  let tmpDir: string;
  let plugin: CodexPlugin;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sesh-codex-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await createFixture(tmpDir);
    plugin = new CodexPlugin(tmpDir);
  });

  afterEach(async () => {
    await rmFs(tmpDir, { recursive: true, force: true });
  });

  describe('listSessions', () => {
    it('returns sessions from session_index', async () => {
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
      const session = sessions.find((s) => s.id === 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session).toBeTruthy();
      expect(session!.title).toBe('fix the login bug');
      expect(session!.project).toBe('/test/codex/project');
      expect(session!.agent).toBe('codex');
    });

    it('includes message count when verbose', async () => {
      const sessions = await plugin.listSessions({ verbose: true });
      const session = sessions.find((s) => s.id === 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session!.messageCount).toBe(2);
    });

    it('returns empty array when session_index is missing', async () => {
      const emptyPlugin = new CodexPlugin(join(tmpDir, 'nonexistent'));
      const sessions = await emptyPlugin.listSessions();
      expect(sessions).toEqual([]);
    });

    it('filters sessions by project', async () => {
      const sessions = await plugin.listSessions({ project: '/test/codex/project' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });
  });

  describe('previewDeleteSession', () => {
    it('returns delete report without removing files', async () => {
      const report = await plugin.previewDeleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.files).toContain(
        join(
          tmpDir,
          'sessions',
          '2026',
          '04',
          '15',
          'rollout-2026-04-15T10-20-30-aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl',
        ),
      );

      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('deleteSession', () => {
    it('returns delete report with files', async () => {
      const report = await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.files.length).toBeGreaterThan(0);
    });

    it('removes session from session_index.jsonl', async () => {
      await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('succeeds when session files are already gone (deletes before index)', async () => {
      await rmFs(join(tmpDir, 'sessions'), { recursive: true, force: true });
      await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(1);
    });

    it('throws for unknown session', async () => {
      await expect(plugin.deleteSession('nonexistent')).rejects.toThrow('session');
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
          content: 'hello',
          timestamp: '2026-04-15T10:21:29.000Z',
        },
        {
          role: 'assistant',
          content: 'hi there',
          timestamp: '2026-04-15T10:22:30.000Z',
        },
      ]);
      expect(exported.sourceFiles[0]).toContain('rollout-2026-04-15');
    });
  });

  describe('searchSessions', () => {
    it('finds sessions by title', async () => {
      const sessions = await plugin.searchSessions('database');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].title).toBe('set up database');
    });

    it('returns empty for no match', async () => {
      const sessions = await plugin.searchSessions('zzzzz');
      expect(sessions).toEqual([]);
    });
  });
});
