import { EventEmitter } from 'events';
import type { HookEvent, CCAgentSession, CCAgentStatus, AgentRole } from '../../shared/types';

const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 30 * 1000;  // check every 30s

export class ClaudeCodeTracker extends EventEmitter {
  private sessions = new Map<string, CCAgentSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start() {
    this.cleanupTimer = setInterval(() => this.expireStale(), CLEANUP_INTERVAL_MS);
  }

  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  handleHookEvent(event: HookEvent): void {
    const { sessionId, type } = event;

    if (type === 'SessionEnd') {
      this.removeSession(sessionId, 'session ended');
      return;
    }

    let session = this.sessions.get(sessionId);

    if (!session) {
      // New session — register it
      session = {
        agentId: `cc-${sessionId}`,
        sessionId,
        role: 'unassigned',
        status: 'idle',
        source: 'hooks',
        directory: event.directory,
        lastActivity: event.timestamp,
      };
      this.sessions.set(sessionId, session);
      this.emit('connected', { ...session });
    }

    // Update session based on event type
    session.lastActivity = event.timestamp;

    switch (type) {
      case 'SessionStart':
        session.status = 'idle';
        if (event.directory) session.directory = event.directory;
        break;

      case 'UserPromptSubmit':
        session.status = 'working';
        session.lastPrompt = event.prompt;
        break;

      case 'PreToolUse':
        session.status = 'working';
        session.lastTool = event.tool;
        if (event.file) session.lastFile = event.file;
        break;

      case 'PostToolUse':
        session.status = 'working';
        session.lastTool = event.tool;
        if (event.file) session.lastFile = event.file;
        break;

      case 'Stop':
        session.status = 'idle';
        break;

      case 'Notification':
        // Keep current status, just update activity
        break;
    }

    this.emit('activity', {
      agentId: session.agentId,
      event: type,
      tool: event.tool,
      file: event.file,
      prompt: event.prompt,
    });
  }

  /**
   * Register a session detected via process scanning.
   * Skips if a hook-based session with the same PID-derived ID already exists.
   */
  registerProcessSession(pid: number, directory?: string): void {
    const sessionId = `pid-${pid}`;

    // Don't overwrite hook-tracked sessions — check if any existing session
    // shares the same directory (likely the same Claude Code instance)
    if (directory) {
      for (const session of this.sessions.values()) {
        if (session.source === 'hooks' && session.directory === directory) {
          return; // Already tracked via hooks, skip
        }
      }
    }

    if (this.sessions.has(sessionId)) return; // Already tracked

    const session: CCAgentSession = {
      agentId: `cc-${sessionId}`,
      sessionId,
      role: 'unassigned',
      status: 'idle',
      source: 'process',
      directory,
      lastActivity: Date.now(),
    };
    this.sessions.set(sessionId, session);
    this.emit('connected', { ...session });
  }

  /**
   * Remove a process-detected session when the process exits.
   */
  removeProcessSession(pid: number): void {
    const sessionId = `pid-${pid}`;
    this.removeSession(sessionId, 'process exited');
  }

  /**
   * Register a spawned session (launched by ClaudeCodeManager).
   */
  registerSpawnedSession(sessionId: string, role: AgentRole, directory?: string): void {
    if (this.sessions.has(sessionId)) return;

    const session: CCAgentSession = {
      agentId: `cc-${sessionId}`,
      sessionId,
      role,
      status: 'working',
      source: 'spawned',
      directory,
      lastActivity: Date.now(),
    };
    this.sessions.set(sessionId, session);
    this.emit('connected', { ...session });
  }

  /**
   * Remove a spawned session when the process exits.
   */
  removeSpawnedSession(sessionId: string): void {
    this.removeSession(sessionId, 'spawned process exited');
  }

  setRole(sessionId: string, role: AgentRole): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.role = role;
    this.emit('updated', { ...session });
    return true;
  }

  getSession(sessionId: string): CCAgentSession | undefined {
    const s = this.sessions.get(sessionId);
    return s ? { ...s } : undefined;
  }

  getAllSessions(): CCAgentSession[] {
    return Array.from(this.sessions.values()).map(s => ({ ...s }));
  }

  getActiveSessions(): CCAgentSession[] {
    return this.getAllSessions().filter(s => s.status !== 'disconnected');
  }

  /**
   * Remove all sessions that don't match any of the given directories.
   * Used when the watched directory changes.
   */
  clearSessionsNotIn(directories: string[]): void {
    for (const [sessionId, session] of this.sessions) {
      const matches = session.directory &&
        directories.some(d => session.directory!.startsWith(d));
      if (!matches) {
        console.log(`[tracker] removing session ${sessionId} (dir: ${session.directory}) — not in watched dirs: ${directories.join(', ')}`);
        this.removeSession(sessionId, 'directory changed');
      }
    }
  }

  private removeSession(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    this.emit('disconnected', { agentId: session.agentId, reason });
  }

  private expireStale(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > STALE_TIMEOUT_MS) {
        this.removeSession(sessionId, 'stale (no activity for 5 minutes)');
      }
    }
  }
}
