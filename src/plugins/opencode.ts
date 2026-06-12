import { join } from 'node:path';
import { statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { AgentPlugin } from './base.js';
import { Session, DeleteReport, SessionExport, SessionMessage } from '../types.js';
import { platform } from 'node:os';

function candidatePaths(): string[] {
  const home = process.env.HOME ?? '~';
  if (platform() === 'darwin') {
    return [
      join(home, 'Library', 'Application Support', 'opencode'),
      join(home, '.local', 'share', 'opencode'),
    ];
  }
  if (platform() === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return [join(appData, 'opencode'), join(home, '.local', 'share', 'opencode')];
  }
  return [join(home, '.local', 'share', 'opencode')];
}

function resolveBasePath(): string {
  for (const candidate of candidatePaths()) {
    try {
      statSync(join(candidate, 'opencode.db'));
      return candidate;
    } catch {
      /* try next */
    }
  }
  return candidatePaths()[0];
}

function shortId(id: string): string {
  return id.slice(0, 12);
}

interface SessionRow {
  id: string;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
}

export class OpencodePlugin implements AgentPlugin {
  readonly name = 'opencode';
  readonly label = 'Opencode';
  readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? resolveBasePath();
  }

  private dbPath(): string {
    return join(this.basePath, 'opencode.db');
  }

  private openDb(filename: string, readOnly = true): Database.Database {
    try {
      return new Database(filename, { readonly: readOnly });
    } catch {
      throw new Error('cannot open opencode database');
    }
  }

  async listSessions(opts?: { project?: string; verbose?: boolean }): Promise<Session[]> {
    const dbPath = this.dbPath();
    let db: Database.Database;
    try {
      db = this.openDb(dbPath);
    } catch {
      return [];
    }

    try {
      const rows = db
        .prepare(
          'SELECT id, title, directory, time_created, time_updated FROM session ORDER BY time_updated DESC',
        )
        .all() as SessionRow[];

      const sessions = rows.map((row) => ({
        id: row.id,
        shortId: shortId(row.id),
        title: row.title,
        project: row.directory || '',
        updatedAt: new Date(row.time_updated).toISOString(),
        messageCount: opts?.verbose ? this.messageCountForSession(db, row.id) : 0,
        agent: this.name,
      }));

      return opts?.project === undefined
        ? sessions
        : sessions.filter((session) => session.project === opts.project);
    } catch {
      return [];
    } finally {
      db.close();
    }
  }

  private messageCountForSession(db: Database.Database, sessionId: string): number {
    try {
      const row = db
        .prepare('SELECT COUNT(*) as c FROM message WHERE session_id = ?')
        .get(sessionId) as { c: number } | undefined;
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  }

  async showSession(sessionId: string): Promise<Session> {
    const dbPath = this.dbPath();
    let db: Database.Database;
    try {
      db = this.openDb(dbPath);
    } catch {
      throw new Error(`session ${sessionId} not found`);
    }

    try {
      let row: SessionRow | undefined;
      row = db
        .prepare(
          'SELECT id, title, directory, time_created, time_updated FROM session WHERE id = ?',
        )
        .get(sessionId) as SessionRow | undefined;
      if (!row) {
        const sessions = db
          .prepare('SELECT id, title, directory, time_created, time_updated FROM session')
          .all() as SessionRow[];
        const match = sessions.find(
          (s) => shortId(s.id) === sessionId || s.id.slice(0, 12) === sessionId,
        );
        if (match) row = match;
      }
      if (!row) throw new Error(`session ${sessionId} not found`);

      return {
        id: row.id,
        shortId: shortId(row.id),
        title: row.title,
        project: row.directory || '',
        updatedAt: new Date(row.time_updated).toISOString(),
        messageCount: this.messageCountForSession(db, row.id),
        agent: this.name,
      };
    } finally {
      db.close();
    }
  }

  async previewDeleteSession(sessionId: string): Promise<DeleteReport> {
    const session = await this.showSession(sessionId);
    return { session, files: [this.dbPath()], bytes: 0 };
  }

  async deleteSession(sessionId: string): Promise<DeleteReport> {
    const session = await this.showSession(sessionId);
    const dbPath = this.dbPath();
    const db = this.openDb(dbPath, false);

    try {
      db.pragma('foreign_keys = ON');
      db.prepare('DELETE FROM session WHERE id = ?').run(sessionId);
    } finally {
      db.close();
    }

    return { session, files: [dbPath], bytes: 0 };
  }

  async exportSession(sessionId: string): Promise<SessionExport> {
    const session = await this.showSession(sessionId);
    const dbPath = this.dbPath();
    const db = this.openDb(dbPath);

    try {
      const messages: SessionMessage[] = [];
      const msgRows = db
        .prepare(
          'SELECT m.id, m.data, m.time_created FROM message m WHERE m.session_id = ? ORDER BY m.time_created ASC',
        )
        .all(session.id) as { id: string; data: string; time_created: number }[];

      for (const msg of msgRows) {
        let role = 'unknown';
        try {
          const parsed = JSON.parse(msg.data);
          role = parsed.role ?? 'unknown';
        } catch {
          /* use default */
        }

        const parts = db
          .prepare('SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC')
          .all(msg.id) as { data: string }[];

        const content = parts
          .map((p) => {
            try {
              const pd = JSON.parse(p.data);
              return pd.type === 'text' && typeof pd.text === 'string' ? pd.text : '';
            } catch {
              return '';
            }
          })
          .filter((t) => t.length > 0)
          .join('\n');

        if (content.length > 0) {
          messages.push({
            role,
            content,
            timestamp: new Date(msg.time_created).toISOString(),
          });
        }
      }

      return { session, messages, sourceFiles: messages.length > 0 ? [dbPath] : [] };
    } finally {
      db.close();
    }
  }

  async searchSessions(query: string): Promise<Session[]> {
    const sessions = await this.listSessions();
    const lower = query.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(lower));
  }
}
