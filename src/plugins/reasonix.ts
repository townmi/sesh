import { join } from 'node:path';
import { stat, rm as rmFs, readdir } from 'node:fs/promises';
import { AgentPlugin } from './base.js';
import { Session, DeleteReport, SessionExport, SessionMessage } from '../types.js';
import { readJsonl, readJson } from '../utils/fs.js';
import { platform } from 'node:os';

interface ReasonixMeta {
  id: string;
  created_at: string;
  updated_at: string;
}

interface ReasonixTranscriptLine {
  role?: string;
  content?: string;
  type?: string;
}

function defaultBasePath(): string {
  if (platform() === 'darwin') {
    return join(process.env.HOME ?? '~', 'Library', 'Application Support', 'reasonix');
  }
  if (platform() === 'win32') {
    return join(
      process.env.APPDATA ?? join(process.env.HOME ?? '~', 'AppData', 'Roaming'),
      'reasonix',
    );
  }
  return join(process.env.HOME ?? '~', '.local', 'share', 'reasonix');
}

function firstUserContent(lines: ReasonixTranscriptLine[]): string {
  for (const line of lines) {
    if (
      line.role === 'user' &&
      typeof line.content === 'string' &&
      line.content.trim().length > 0
    ) {
      return line.content.trim();
    }
  }
  return 'untitled';
}

function titleFromContent(content: string): string {
  const sanitized = content.replace(/[\r\n]+/g, ' ').trim();
  return sanitized.length > 80 ? sanitized.slice(0, 77) + '...' : sanitized;
}

export class ReasonixPlugin implements AgentPlugin {
  readonly name = 'reasonix';
  readonly label = 'Reasonix';
  readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? defaultBasePath();
  }

  async listSessions(opts?: { project?: string; verbose?: boolean }): Promise<Session[]> {
    const sessionsDir = join(this.basePath, 'sessions');
    let entries: string[];
    try {
      entries = await readdir(sessionsDir);
    } catch {
      return [];
    }

    const sessions: Session[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl.meta')) continue;
      const metaPath = join(sessionsDir, entry);
      const metaJson = await readJson<ReasonixMeta & Record<string, unknown>>(metaPath);
      if (!metaJson) continue;
      const meta = metaJson;
      const id = typeof meta.id === 'string' ? meta.id : entry.replace('.jsonl.meta', '');

      // Read transcript for title
      const transcriptPath = join(sessionsDir, `${id}.jsonl`);
      const transcript = await readJsonl<ReasonixTranscriptLine>(transcriptPath);
      const title = titleFromContent(firstUserContent(transcript));

      const session: Session = {
        id,
        // Skip date prefix (YYYYMMDD-) since same-day sessions share it
        shortId: id
          .slice(9)
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 12),
        title,
        project: '',
        updatedAt: typeof meta.updated_at === 'string' ? meta.updated_at : new Date().toISOString(),
        messageCount: transcript.filter((l) => l.role === 'assistant' || l.role === 'user').length,
        agent: this.name,
      };

      if (opts?.project && session.project !== opts.project) continue;
      sessions.push(session);
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteSession(sessionId: string): Promise<DeleteReport> {
    const report = await this.previewDeleteSession(sessionId);

    const failures: string[] = [];
    for (const filePath of report.files) {
      try {
        await rmFs(filePath, { recursive: true, force: true });
      } catch {
        failures.push(filePath);
      }
    }

    if (failures.length > 0) {
      throw new Error(`failed to delete files: ${failures.join(', ')}`);
    }

    return report;
  }

  async previewDeleteSession(sessionId: string): Promise<DeleteReport> {
    const session = await this.showSession(sessionId);
    const sessionsDir = join(this.basePath, 'sessions');

    const candidatePaths = [
      join(sessionsDir, `${session.id}.jsonl`),
      join(sessionsDir, `${session.id}.jsonl.meta`),
      join(sessionsDir, `${session.id}.ckpt`),
    ];

    const files: string[] = [];
    let bytes = 0;
    for (const filePath of candidatePaths) {
      try {
        const st = await stat(filePath);
        bytes += st.size;
        files.push(filePath);
      } catch {
        /* file does not exist */
      }
    }

    return { session, files, bytes };
  }

  async showSession(sessionId: string): Promise<Session> {
    const sessions = await this.listSessions({ verbose: true });
    const session = sessions.find(
      (s) =>
        s.id === sessionId ||
        s.shortId === sessionId ||
        s.id
          .slice(9)
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 12) === sessionId,
    );
    if (!session) throw new Error(`session ${sessionId} not found`);
    return session;
  }

  async exportSession(sessionId: string): Promise<SessionExport> {
    const session = await this.showSession(sessionId);
    const transcriptPath = join(this.basePath, 'sessions', `${session.id}.jsonl`);
    const transcript = await readJsonl<ReasonixTranscriptLine>(transcriptPath);
    const messages: SessionMessage[] = [];

    for (const line of transcript) {
      const role = line.role;
      const content = line.content;
      if (role && role !== 'system' && typeof content === 'string' && content.trim().length > 0) {
        messages.push({ role, content: content.trim() });
      }
    }

    return {
      session,
      messages,
      sourceFiles: transcript.length > 0 ? [transcriptPath] : [],
    };
  }

  async searchSessions(query: string): Promise<Session[]> {
    const sessions = await this.listSessions();
    const lower = query.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(lower));
  }
}
