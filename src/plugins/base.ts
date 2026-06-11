import { Session, DeleteReport, SessionExport } from '../types.js';

export interface AgentPlugin {
  readonly name: string;
  readonly label: string;
  readonly basePath: string;

  listSessions(opts?: { project?: string; verbose?: boolean }): Promise<Session[]>;
  previewDeleteSession(sessionId: string): Promise<DeleteReport>;
  deleteSession(sessionId: string): Promise<DeleteReport>;
  showSession(sessionId: string): Promise<Session>;
  exportSession(sessionId: string): Promise<SessionExport>;
  searchSessions(query: string): Promise<Session[]>;
  pruneSessions(olderThan: string): Promise<DeleteReport[]>;
}
