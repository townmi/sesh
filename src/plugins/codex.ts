import { join } from 'node:path';
import { stat, rm as rmFs, readdir, readFile } from 'node:fs/promises';
import { AgentPlugin } from './base.js';
import {
  Session,
  DeleteReport,
  CodexIndexEntry,
  CodexHistoryEntry,
  SessionExport,
  SessionMessage,
} from '../types.js';
import { readJsonl, writeJsonl } from '../utils/fs.js';

interface CodexDeleteContext {
  sessionEntry: CodexIndexEntry;
  historyEntries: CodexHistoryEntry[];
  files: string[];
  bytes: number;
  project: string;
}

interface CodexSessionMetaLine {
  type: string;
  payload: {
    id?: string;
    cwd?: string;
  };
}

interface CodexTranscriptLine {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    message?: string;
    role?: string;
    content?: unknown;
    output?: string;
    name?: string;
    arguments?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCodexSessionMetaLine(value: unknown): value is CodexSessionMetaLine {
  if (!isRecord(value) || value.type !== 'session_meta' || !isRecord(value.payload)) {
    return false;
  }
  return (
    (value.payload.id === undefined || typeof value.payload.id === 'string') &&
    (value.payload.cwd === undefined || typeof value.payload.cwd === 'string')
  );
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (isRecord(item) && typeof item.text === 'string') return item.text;
        if (isRecord(item) && typeof item.output_text === 'string') return item.output_text;
        return JSON.stringify(item);
      })
      .filter((item) => item.length > 0)
      .join('\n\n');
  }
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}

export class CodexPlugin implements AgentPlugin {
  readonly name = 'codex';
  readonly label = 'Codex';
  readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? join(process.env.HOME ?? '~', '.codex');
  }

  async listSessions(opts?: { project?: string; verbose?: boolean }): Promise<Session[]> {
    const entries = await readJsonl<CodexIndexEntry>(join(this.basePath, 'session_index.jsonl'));

    let historyEntries: CodexHistoryEntry[] = [];
    if (opts?.verbose) {
      historyEntries = await readJsonl<CodexHistoryEntry>(join(this.basePath, 'history.jsonl'));
    }

    const sessions: Session[] = [];
    for (const entry of entries) {
      const count = opts?.verbose
        ? historyEntries.filter((h) => h.session_id === entry.id).length
        : 0;
      const project = await this.findSessionProject(entry);

      sessions.push({
        id: entry.id,
        shortId: entry.id.slice(0, 12),
        title: entry.thread_name,
        project,
        updatedAt: entry.updated_at,
        messageCount: count,
        agent: this.name,
      });
    }

    const filtered =
      opts?.project === undefined ? sessions : sessions.filter((s) => s.project === opts.project);
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

    const entries = await readJsonl<CodexIndexEntry>(join(this.basePath, 'session_index.jsonl'));
    const keepEntries = entries.filter((e) => e.id !== sessionId);
    await writeJsonl(join(this.basePath, 'session_index.jsonl'), keepEntries);

    const keepHistory = context.historyEntries.filter((e) => e.session_id !== sessionId);
    const afterSize = JSON.stringify(keepHistory).length;
    await writeJsonl(join(this.basePath, 'history.jsonl'), keepHistory);

    return this.contextToReport(sessionId, context, afterSize);
  }

  async previewDeleteSession(sessionId: string): Promise<DeleteReport> {
    const context = await this.buildDeleteContext(sessionId);
    const keepHistory = context.historyEntries.filter((e) => e.session_id !== sessionId);
    return this.contextToReport(sessionId, context, JSON.stringify(keepHistory).length);
  }

  private async buildDeleteContext(sessionId: string): Promise<CodexDeleteContext> {
    const entries = await readJsonl<CodexIndexEntry>(join(this.basePath, 'session_index.jsonl'));
    const sessionEntry = entries.find((e) => e.id === sessionId);

    if (!sessionEntry) {
      throw new Error(`session ${sessionId} not found`);
    }

    const files: string[] = [];
    let bytes = 0;

    const historyEntries = await readJsonl<CodexHistoryEntry>(join(this.basePath, 'history.jsonl'));
    const beforeSize = JSON.stringify(historyEntries).length;

    const date = new Date(sessionEntry.updated_at);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    for (const filePath of await this.findSessionFiles(sessionId, year, month, day)) {
      try {
        const st = await stat(filePath);
        bytes += st.size;
        files.push(filePath);
      } catch {
        /* skip */
      }
    }

    const archivePath = join(this.basePath, 'archived_sessions', `${sessionId}.jsonl`);
    try {
      const st = await stat(archivePath);
      bytes += st.size;
      files.push(archivePath);
    } catch {
      /* file does not exist */
    }

    const project = await this.findSessionProject(sessionEntry);

    return { sessionEntry, historyEntries, files, bytes: bytes + beforeSize, project };
  }

  private contextToReport(
    sessionId: string,
    context: CodexDeleteContext,
    keepHistorySize: number,
  ): DeleteReport {
    return {
      session: {
        id: sessionId,
        shortId: sessionId.slice(0, 12),
        title: context.sessionEntry.thread_name,
        project: context.project,
        updatedAt: context.sessionEntry.updated_at,
        messageCount: context.historyEntries.filter((e) => e.session_id === sessionId).length,
        agent: this.name,
      },
      files: context.files,
      bytes: context.bytes - keepHistorySize,
    };
  }

  async showSession(sessionId: string): Promise<Session> {
    const sessions = await this.listSessions({ verbose: true });
    const session = sessions.find(
      (s) => s.id === sessionId || s.shortId === sessionId || s.id.slice(0, 12) === sessionId,
    );
    if (!session) throw new Error(`session ${sessionId} not found`);
    return session;
  }

  async exportSession(sessionId: string): Promise<SessionExport> {
    const session = await this.showSession(sessionId);
    const date = new Date(session.updatedAt);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const files = await this.findSessionFiles(session.id, year, month, day);
    const messages: SessionMessage[] = [];

    for (const filePath of files) {
      const lines = await readJsonl<CodexTranscriptLine>(filePath);
      for (const line of lines) {
        const message = this.codexLineToMessage(line);
        if (message) this.pushMessage(messages, message);
      }
      if (messages.length > 0) {
        return { session, messages, sourceFiles: [filePath] };
      }
    }

    const historyEntries = await readJsonl<CodexHistoryEntry>(join(this.basePath, 'history.jsonl'));
    for (const entry of historyEntries.filter((e) => e.session_id === session.id)) {
      messages.push({
        role: 'user',
        content: entry.text,
        timestamp: new Date(entry.ts * 1000).toISOString(),
      });
    }

    return { session, messages, sourceFiles: [] };
  }

  async searchSessions(query: string): Promise<Session[]> {
    const sessions = await this.listSessions();
    const lower = query.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(lower));
  }

  private async findSessionProject(entry: CodexIndexEntry): Promise<string> {
    const date = new Date(entry.updated_at);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const files = await this.findSessionFiles(entry.id, year, month, day);

    for (const filePath of files) {
      const project = await this.readProjectFromSessionFile(filePath, entry.id);
      if (project !== '') return project;
    }

    return '';
  }

  private async findSessionFiles(
    sessionId: string,
    year: string,
    month: string,
    day: string,
  ): Promise<string[]> {
    const datedDir = join(this.basePath, 'sessions', year, month, day);
    const datedFiles = await this.findSessionFilesInDir(datedDir, sessionId);
    if (datedFiles.length > 0) return datedFiles;

    return this.findSessionFilesRecursive(join(this.basePath, 'sessions'), sessionId);
  }

  private async findSessionFilesInDir(dirPath: string, sessionId: string): Promise<string[]> {
    try {
      const dirFiles = await readdir(dirPath);
      return dirFiles
        .filter((file) => file.includes(sessionId) && file.endsWith('.jsonl'))
        .map((file) => join(dirPath, file));
    } catch {
      return [];
    }
  }

  private async findSessionFilesRecursive(dirPath: string, sessionId: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.findSessionFilesRecursive(entryPath, sessionId)));
      } else if (
        entry.isFile() &&
        entry.name.includes(sessionId) &&
        entry.name.endsWith('.jsonl')
      ) {
        files.push(entryPath);
      }
    }
    return files;
  }

  private async readProjectFromSessionFile(filePath: string, sessionId: string): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.includes('"session_meta"')) continue;
        try {
          const parsed: unknown = JSON.parse(line);
          if (
            isCodexSessionMetaLine(parsed) &&
            parsed.payload.id === sessionId &&
            parsed.payload.cwd !== undefined
          ) {
            return parsed.payload.cwd;
          }
        } catch {
          /* skip malformed session line */
        }
      }
    } catch {
      /* session file missing or unreadable */
    }

    return '';
  }

  private pushMessage(messages: SessionMessage[], message: SessionMessage): void {
    const previous = messages[messages.length - 1];
    if (
      previous !== undefined &&
      previous.role === message.role &&
      previous.content.trim() === message.content.trim()
    ) {
      return;
    }

    messages.push(message);
  }

  private codexLineToMessage(line: CodexTranscriptLine): SessionMessage | undefined {
    if (line.type === 'event_msg' && line.payload?.message !== undefined) {
      const role = line.payload.type === 'agent_message' ? 'assistant' : 'user';
      return { role, content: line.payload.message, timestamp: line.timestamp };
    }

    if (line.type === 'response_item') {
      if (line.payload?.type === 'message') {
        const role = line.payload.role ?? 'assistant';
        if (role !== 'user' && role !== 'assistant') {
          return undefined;
        }
        const content = stringifyContent(line.payload.content);
        if (content !== '') {
          return {
            role,
            content,
            timestamp: line.timestamp,
          };
        }
      }

      if (line.payload?.type === 'function_call') {
        const name = line.payload.name ?? 'tool';
        const args = line.payload.arguments ?? '';
        return {
          role: 'tool',
          content: args === '' ? `[call ${name}]` : `[call ${name}]\n${args}`,
          timestamp: line.timestamp,
        };
      }

      if (line.payload?.type === 'function_call_output' && line.payload.output !== undefined) {
        return { role: 'tool', content: line.payload.output, timestamp: line.timestamp };
      }
    }

    return undefined;
  }
}
