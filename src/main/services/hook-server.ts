import * as http from 'http';
import { EventEmitter } from 'events';
import type { HookEvent, HookEventType } from '../../shared/types';

const DEFAULT_PORT = 7890;

const VALID_EVENT_TYPES: Set<string> = new Set([
  'SessionStart', 'SessionEnd', 'Stop',
  'PreToolUse', 'PostToolUse',
  'UserPromptSubmit', 'Notification',
]);

export class HookServer extends EventEmitter {
  private server: http.Server | null = null;
  private port: number;
  private lastEventTime = 0;

  constructor(port: number = DEFAULT_PORT) {
    super();
    this.port = port;
  }

  getLastEventTime(): number {
    return this.lastEventTime;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.emit('error', `Port ${this.port} is already in use`);
          reject(err);
        } else {
          this.emit('error', err.message);
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.emit('listening', this.port);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  getPort(): number {
    return this.port;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Only accept POST to /hooks/*
    if (req.method !== 'POST' || !req.url?.startsWith('/hooks/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Extract event type from URL: /hooks/SessionStart -> SessionStart
    const eventType = req.url.slice('/hooks/'.length);
    if (!VALID_EVENT_TYPES.has(eventType)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown event type: ${eventType}` }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Guard against oversized payloads (1MB max)
      if (body.length > 1_048_576) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const hookEvent = this.parseHookEvent(eventType as HookEventType, payload);

        if (!hookEvent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required field: session_id' }));
          return;
        }

        this.emit('hook', hookEvent);
        this.lastEventTime = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  private parseHookEvent(type: HookEventType, payload: Record<string, any>): HookEvent | null {
    // session_id is required — Claude Code hooks include it in the payload
    const sessionId = payload.session_id || payload.sessionId;
    if (!sessionId) return null;

    const event: HookEvent = {
      type,
      sessionId: String(sessionId),
      timestamp: Date.now(),
    };

    // Extract fields based on event type
    if (payload.cwd || payload.directory) {
      event.directory = payload.cwd || payload.directory;
    }
    if (payload.tool_name || payload.tool) {
      event.tool = payload.tool_name || payload.tool;
    }
    if (payload.file_path || payload.file) {
      event.file = payload.file_path || payload.file;
    }
    if (payload.prompt || payload.content) {
      event.prompt = payload.prompt || payload.content;
    }
    if (payload.message) {
      event.message = payload.message;
    }

    return event;
  }
}
