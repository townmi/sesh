import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReasonixPlugin } from '../../src/plugins/reasonix.js';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function createFixture(basePath: string): Promise<void> {
  const sessionsDir = join(basePath, 'sessions');
  await mkdir(sessionsDir, { recursive: true });

  await writeFile(
    join(sessionsDir, '20260612-013825.309817000-deepseek-deepseek-v4-pro.jsonl'),
    '{"role":"system","content":"You are Reasonix."}\n' +
      '{"role":"user","content":"fix the login bug in auth module"}\n' +
      '{"role":"assistant","content":"I will fix the login bug."}\n',
  );

  await writeFile(
    join(sessionsDir, '20260612-013825.309817000-deepseek-deepseek-v4-pro.jsonl.meta'),
    '{"id":"20260612-013825.309817000-deepseek-deepseek-v4-pro","created_at":"2026-06-12T01:46:59.159Z","updated_at":"2026-06-12T01:50:34.985Z"}\n',
  );

  await mkdir(join(sessionsDir, '20260612-013825.309817000-deepseek-deepseek-v4-pro.ckpt'), {
    recursive: true,
  });
  await writeFile(
    join(sessionsDir, '20260612-013825.309817000-deepseek-deepseek-v4-pro.ckpt', 'turn-0.json'),
    '{}',
  );

  await writeFile(
    join(sessionsDir, '20260611-102520.604322000-deepseek-deepseek-v4-pro.jsonl'),
    '{"role":"system","content":"You are Reasonix."}\n' +
      '{"role":"user","content":"add a database migration"}\n',
  );

  await writeFile(
    join(sessionsDir, '20260611-102520.604322000-deepseek-deepseek-v4-pro.jsonl.meta'),
    '{"id":"20260611-102520.604322000-deepseek-deepseek-v4-pro","created_at":"2026-06-11T10:25:20.604Z","updated_at":"2026-06-11T10:30:00.000Z"}\n',
  );
}

describe('ReasonixPlugin', () => {
  let tmpDir: string;
  let plugin: ReasonixPlugin;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sesh-reasonix-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await createFixture(tmpDir);
    plugin = new ReasonixPlugin(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('listSessions', () => {
    it('returns sessions from .meta files', async () => {
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
      const session = sessions.find(
        (s) => s.id === '20260612-013825.309817000-deepseek-deepseek-v4-pro',
      );
      expect(session).toBeTruthy();
      expect(session!.title).toBe('fix the login bug in auth module');
      expect(session!.agent).toBe('reasonix');
      expect(session!.messageCount).toBe(2);
    });

    it('returns empty array when sessions dir is missing', async () => {
      const emptyPlugin = new ReasonixPlugin(join(tmpDir, 'nonexistent'));
      const sessions = await emptyPlugin.listSessions();
      expect(sessions).toEqual([]);
    });

    it('sorts by updatedAt descending', async () => {
      const sessions = await plugin.listSessions();
      expect(sessions[0].id).toBe('20260612-013825.309817000-deepseek-deepseek-v4-pro');
      expect(sessions[1].id).toBe('20260611-102520.604322000-deepseek-deepseek-v4-pro');
    });
  });

  describe('showSession', () => {
    it('returns full session details', async () => {
      const session = await plugin.showSession(
        '20260612-013825.309817000-deepseek-deepseek-v4-pro',
      );
      expect(session.title).toBe('fix the login bug in auth module');
    });

    it('returns session by short id', async () => {
      const session = await plugin.showSession('013825309817');
      expect(session.id).toBe('20260612-013825.309817000-deepseek-deepseek-v4-pro');
    });

    it('throws for unknown session', async () => {
      await expect(plugin.showSession('nonexistent')).rejects.toThrow('session');
    });
  });

  describe('deleteSession', () => {
    it('deletes session files and removes from listing', async () => {
      await plugin.deleteSession('20260612-013825.309817000-deepseek-deepseek-v4-pro');
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('20260611-102520.604322000-deepseek-deepseek-v4-pro');
    });

    it('deletes session files by short id', async () => {
      await plugin.deleteSession('013825309817');
      await expect(
        stat(join(tmpDir, 'sessions', '20260612-013825.309817000-deepseek-deepseek-v4-pro.jsonl')),
      ).rejects.toThrow();
      await expect(
        stat(
          join(tmpDir, 'sessions', '20260612-013825.309817000-deepseek-deepseek-v4-pro.jsonl.meta'),
        ),
      ).rejects.toThrow();
      await expect(
        stat(join(tmpDir, 'sessions', '20260612-013825.309817000-deepseek-deepseek-v4-pro.ckpt')),
      ).rejects.toThrow();
    });

    it('throws for unknown session', async () => {
      await expect(plugin.deleteSession('nonexistent')).rejects.toThrow('session');
    });
  });

  describe('previewDeleteSession', () => {
    it('returns delete report without removing files', async () => {
      const report = await plugin.previewDeleteSession(
        '20260612-013825.309817000-deepseek-deepseek-v4-pro',
      );
      expect(report.session.id).toBe('20260612-013825.309817000-deepseek-deepseek-v4-pro');
      expect(report.files.length).toBeGreaterThan(0);

      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('exportSession', () => {
    it('exports normalized transcript messages', async () => {
      const exported = await plugin.exportSession(
        '20260612-013825.309817000-deepseek-deepseek-v4-pro',
      );
      expect(exported.session.title).toBe('fix the login bug in auth module');
      expect(exported.messages).toEqual([
        { role: 'user', content: 'fix the login bug in auth module' },
        { role: 'assistant', content: 'I will fix the login bug.' },
      ]);
    });
  });

  describe('searchSessions', () => {
    it('finds sessions by title', async () => {
      const sessions = await plugin.searchSessions('database');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].title).toBe('add a database migration');
    });

    it('returns empty for no match', async () => {
      const sessions = await plugin.searchSessions('zzzzz');
      expect(sessions).toEqual([]);
    });
  });
});
