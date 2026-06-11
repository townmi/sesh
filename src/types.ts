export interface Session {
  id: string;
  shortId: string;
  title: string;
  project: string;
  updatedAt: string;
  messageCount: number;
  agent: string;
}

export interface DeleteReport {
  session: Session;
  files: string[];
  bytes: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp?: string;
}

export interface SessionExport {
  session: Session;
  messages: SessionMessage[];
  sourceFiles: string[];
}

export interface ClaudeHistoryEntry {
  display: string;
  pastedContents: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface CodexIndexEntry {
  id: string;
  thread_name: string;
  updated_at: string;
}

export interface CodexHistoryEntry {
  session_id: string;
  ts: number;
  text: string;
}
