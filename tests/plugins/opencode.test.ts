import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpencodePlugin } from '../../src/plugins/opencode.js';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

async function setupTempFixture(): Promise<string> {
  const dir = join(
    tmpdir(),
    `sesh-opencode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(dir, { recursive: true });

  const dbPath = join(dir, 'opencode.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      directory TEXT NOT NULL DEFAULT '',
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      version TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
    );
  `);

  const now = Date.now();
  const yesterday = now - 86400000;

  const insertSession = db.prepare(
    'INSERT INTO session (id, title, directory, time_created, time_updated) VALUES (?, ?, ?, ?, ?)',
  );
  insertSession.run(
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'fix the login bug',
    '/home/test',
    yesterday,
    now,
  );
  insertSession.run(
    '11111111-2222-3333-4444-555555555555',
    'add database migration',
    '/home/other',
    yesterday - 86400000,
    yesterday,
  );

  const insertMessage = db.prepare(
    'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)',
  );
  insertMessage.run(
    'msg-1',
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    yesterday,
    JSON.stringify({ role: 'user' }),
  );
  insertMessage.run(
    'msg-2',
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    yesterday + 1,
    JSON.stringify({ role: 'assistant' }),
  );
  insertMessage.run(
    'msg-3',
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    yesterday + 2,
    JSON.stringify({ role: 'user' }),
  );

  const insertPart = db.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)',
  );
  insertPart.run(
    'prt-1',
    'msg-1',
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    yesterday,
    JSON.stringify({ type: 'text', text: 'please fix the login bug' }),
  );
  insertPart.run(
    'prt-2',
    'msg-2',
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    yesterday + 1,
    JSON.stringify({ type: 'text', text: 'I found the issue in auth.ts' }),
  );
  insertPart.run(
    'prt-3',
    'msg-3',
    'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    yesterday + 2,
    JSON.stringify({ type: 'text', text: 'great, thanks' }),
  );

  db.close();
  return dir;
}

describe('OpencodePlugin', () => {
  let tmpDir: string;
  let plugin: OpencodePlugin;

  beforeEach(async () => {
    tmpDir = await setupTempFixture();
    plugin = new OpencodePlugin(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('listSessions', () => {
    it('returns sessions from the database', async () => {
      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(2);
      const session = sessions.find((s) => s.id === 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session).toBeTruthy();
      expect(session!.title).toBe('fix the login bug');
      expect(session!.agent).toBe('opencode');
      expect(session!.messageCount).toBe(0);
    });

    it('includes message count when verbose', async () => {
      const sessions = await plugin.listSessions({ verbose: true });
      const session = sessions.find((s) => s.id === 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session!.messageCount).toBe(3);
    });

    it('filters sessions by project directory', async () => {
      const sessions = await plugin.listSessions({ project: '/home/other' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('returns empty when database does not exist', async () => {
      const emptyPlugin = new OpencodePlugin('/nonexistent/path');
      const sessions = await emptyPlugin.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('showSession', () => {
    it('returns full session details', async () => {
      const session = await plugin.showSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(session.title).toBe('fix the login bug');
      expect(session.messageCount).toBe(3);
    });

    it('throws for unknown session', async () => {
      await expect(plugin.showSession('nonexistent')).rejects.toThrow('session');
    });
  });

  describe('deleteSession', () => {
    it('deletes session from the database', async () => {
      const report = await plugin.deleteSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(report.session.id).toBe('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

      const sessions = await plugin.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('throws for unknown session', async () => {
      await expect(plugin.deleteSession('nonexistent')).rejects.toThrow('session');
    });
  });

  describe('exportSession', () => {
    it('exports messages from the database', async () => {
      const exported = await plugin.exportSession('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(exported.session.title).toBe('fix the login bug');
      expect(exported.messages.length).toBe(3);
      expect(exported.messages[0]).toMatchObject({
        role: 'user',
        content: 'please fix the login bug',
      });
    });
  });

  describe('searchSessions', () => {
    it('finds sessions by title', async () => {
      const sessions = await plugin.searchSessions('database');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].title).toBe('add database migration');
    });

    it('returns empty for no match', async () => {
      const sessions = await plugin.searchSessions('zzzzz');
      expect(sessions).toEqual([]);
    });
  });
});
