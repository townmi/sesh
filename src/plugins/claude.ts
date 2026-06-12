import { join } from 'node:path';
import { stat, rm as rmFs } from 'node:fs/promises';
import { AgentPlugin } from './base.js';
import {
  Session,
  DeleteReport,
  ClaudeHistoryEntry,
  SessionExport,
  SessionMessage,
} from '../types.js';
import { readJsonl, writeJsonl } from '../utils/fs.js';

interface ClaudeDeleteContext {
  sessionEntry: ClaudeHistoryEntry;
  entries: ClaudeHistoryEntry[];
  files: string[];
  bytes: number;
}

interface ClaudeTranscriptLine {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  toolUseResult?: {
    stdout?: string;
    stderr?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (isRecord(item) && typeof item.text === 'string') return item.text;
        if (isRecord(item) && typeof item.content === 'string') return item.content;
        if (isRecord(item) && typeof item.name === 'string') return `[tool: ${item.name}]`;
        return JSON.stringify(item);
      })
      .filter((item) => item.length > 0)
      .join('\n\n');
  }
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}

export class ClaudePlugin implements AgentPlugin {
  readonly name = 'claude';
  readonly label = 'Claude Code';
  readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? join(process.env.HOME ?? '~', '.claude');
  }

  async listSessions(opts?: { project?: string; verbose?: boolean }): Promise<Session[]> {
    const entries = await readJsonl<ClaudeHistoryEntry>(join(this.basePath, 'history.jsonl'));
    const groups = new Map<string, ClaudeHistoryEntry[]>();

    for (const entry of entries) {
      const key = `${entry.project}::${entry.sessionId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const sessions: Session[] = [];
    for (const [, group] of groups) {
      const first = group[0];
      if (opts?.project && first.project !== opts.project) continue;
      sessions.push({
        id: first.sessionId,
        shortId: first.sessionId.slice(0, 12),
        title: first.display,
        project: first.project,
        updatedAt: new Date(first.timestamp).toISOString(),
        messageCount: group.length,
        agent: this.name,
      });
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteSession(sessionId: string): Promise<DeleteReport> {
    const context = await this.buildDeleteContext(sessionId);

    const failures: string[] = [];
    for (const filePath of context.files) {
      try {
        await rmFs(filePath, { recursive: true, force: true });
      } catch {
        failures.push(filePath);
      }
    }

    if (failures.length > 0) {
      throw new Error(`failed to delete files: ${failures.join(', ')}`);
    }

    const keepEntries = context.entries.filter((e) => e.sessionId !== sessionId);
    await writeJsonl(join(this.basePath, 'history.jsonl'), keepEntries);

    return this.contextToReport(sessionId, context);
  }

  async previewDeleteSession(sessionId: string): Promise<DeleteReport> {
    const context = await this.buildDeleteContext(sessionId);
    return this.contextToReport(sessionId, context);
  }

  async showSession(sessionId: string): Promise<Session> {
    const sessions = await this.listSessions();
    const session = sessions.find(
      (s) => s.id === sessionId || s.shortId === sessionId || s.id.slice(0, 12) === sessionId,
    );
    if (!session) throw new Error(`session ${sessionId} not found`);
    return session;
  }

  async exportSession(sessionId: string): Promise<SessionExport> {
    const session = await this.showSession(sessionId);
    const transcriptPath = this.projectSessionFile(session.project, session.id);
    const transcript = await readJsonl<ClaudeTranscriptLine>(transcriptPath);
    const messages: SessionMessage[] = [];

    for (const line of transcript) {
      if (line.type === 'user' || line.type === 'assistant') {
        const role = line.message?.role ?? line.type;
        const content = stringifyContent(line.message?.content);
        if (content !== '') {
          messages.push({ role, content, timestamp: line.timestamp });
        }
      } else if (line.toolUseResult) {
        const parts = [line.toolUseResult.stdout, line.toolUseResult.stderr]
          .filter((part): part is string => part !== undefined && part.length > 0)
          .join('\n');
        if (parts !== '') {
          messages.push({ role: 'tool', content: parts, timestamp: line.timestamp });
        }
      }
    }

    if (messages.length === 0) {
      const entries = await readJsonl<ClaudeHistoryEntry>(join(this.basePath, 'history.jsonl'));
      for (const entry of entries.filter((e) => e.sessionId === session.id)) {
        messages.push({
          role: 'user',
          content: entry.display,
          timestamp: new Date(entry.timestamp).toISOString(),
        });
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

  private async buildDeleteContext(sessionId: string): Promise<ClaudeDeleteContext> {
    const entries = await readJsonl<ClaudeHistoryEntry>(join(this.basePath, 'history.jsonl'));
    const sessionEntry = entries.find((e) => e.sessionId === sessionId);

    if (!sessionEntry) {
      throw new Error(`session ${sessionId} not found`);
    }

    const files: string[] = [];
    let bytes = 0;

    const candidatePaths = [
      this.projectSessionFile(sessionEntry.project, sessionId),
      join(this.projectDirPath(sessionEntry.project), sessionId),
      join(this.basePath, 'session-env', sessionId),
      join(this.basePath, 'file-history', sessionId),
    ];

    for (const filePath of candidatePaths) {
      try {
        const st = await stat(filePath);
        bytes += st.size;
        files.push(filePath);
      } catch {
        /* file does not exist */
      }
    }

    return { sessionEntry, entries, files, bytes };
  }

  private projectDirPath(project: string): string {
    let projectDir = project.replace(/\//g, '-');
    if (projectDir.startsWith('-')) projectDir = projectDir.slice(1);
    return join(this.basePath, 'projects', `-${projectDir}`);
  }

  private projectSessionFile(project: string, sessionId: string): string {
    return join(this.projectDirPath(project), `${sessionId}.jsonl`);
  }

  private contextToReport(sessionId: string, context: ClaudeDeleteContext): DeleteReport {
    return {
      session: {
        id: sessionId,
        shortId: sessionId.slice(0, 12),
        title: context.sessionEntry.display,
        project: context.sessionEntry.project,
        updatedAt: new Date(context.sessionEntry.timestamp).toISOString(),
        messageCount: context.entries.filter((e) => e.sessionId === sessionId).length,
        agent: this.name,
      },
      files: context.files,
      bytes: context.bytes,
    };
  }
}
