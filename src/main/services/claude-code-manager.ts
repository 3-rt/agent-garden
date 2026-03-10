import { spawn, ChildProcess, execFile } from 'child_process';
import { EventEmitter } from 'events';
import type { AgentRole } from '../../shared/types';

interface SpawnedAgent {
  agentId: string;
  sessionId: string;
  role: AgentRole;
  process: ChildProcess;
  directory: string;
  prompt?: string;
  output: string;
}

export class ClaudeCodeManager extends EventEmitter {
  private agents = new Map<string, SpawnedAgent>();
  private nextId = 1;
  private claudePath: string | null = null;

  /** Detect if claude CLI is available and cache the path */
  async detectClaude(): Promise<string | null> {
    if (this.claudePath) return this.claudePath;

    return new Promise((resolve) => {
      execFile('which', ['claude'], (err, stdout) => {
        if (!err && stdout.trim()) {
          this.claudePath = stdout.trim();
          resolve(this.claudePath);
        } else {
          resolve(null);
        }
      });
    });
  }

  /** Spawn a new Claude Code agent as a headless child process */
  async spawn(options: {
    role: AgentRole;
    prompt?: string;
    directory?: string;
  }): Promise<{ agentId: string; sessionId: string } | null> {
    const claudeCmd = await this.detectClaude();
    if (!claudeCmd) {
      this.emit('error', 'Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code');
      return null;
    }

    const sessionId = `spawned-${this.nextId++}`;
    const agentId = `cc-${sessionId}`;
    const directory = options.directory || process.cwd();

    // Build claude command args
    const args: string[] = ['--print'];
    if (options.prompt) {
      args.push(options.prompt);
    }

    const child = spawn(claudeCmd, args, {
      cwd: directory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const agent: SpawnedAgent = {
      agentId,
      sessionId,
      role: options.role,
      process: child,
      directory,
      prompt: options.prompt,
      output: '',
    };

    this.agents.set(sessionId, agent);

    // Emit spawned event
    this.emit('spawned', {
      agentId,
      sessionId,
      role: options.role,
      directory,
      prompt: options.prompt,
    });

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      agent.output += text;
      this.emit('output', { agentId, sessionId, text });
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.emit('output', { agentId, sessionId, text });
    });

    // Handle process exit
    child.on('close', (code) => {
      this.emit('exited', {
        agentId,
        sessionId,
        code,
        output: agent.output,
      });
      this.agents.delete(sessionId);
    });

    child.on('error', (err) => {
      this.emit('error', `Agent ${agentId} error: ${err.message}`);
      this.agents.delete(sessionId);
    });

    return { agentId, sessionId };
  }

  /** Stop a spawned agent */
  stop(sessionId: string): boolean {
    const agent = this.agents.get(sessionId);
    if (!agent) return false;

    // Send SIGTERM first, then SIGKILL after 5s
    agent.process.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (agent.process.killed) return;
      agent.process.kill('SIGKILL');
    }, 5000);

    agent.process.on('close', () => clearTimeout(killTimer));
    return true;
  }

  /** Send input to a spawned agent's stdin */
  sendInput(sessionId: string, input: string): boolean {
    const agent = this.agents.get(sessionId);
    if (!agent || !agent.process.stdin?.writable) return false;
    agent.process.stdin.write(input + '\n');
    return true;
  }

  /** Get info about a spawned agent */
  getAgent(sessionId: string): { agentId: string; sessionId: string; role: AgentRole; directory: string; prompt?: string } | null {
    const agent = this.agents.get(sessionId);
    if (!agent) return null;
    return {
      agentId: agent.agentId,
      sessionId: agent.sessionId,
      role: agent.role,
      directory: agent.directory,
      prompt: agent.prompt,
    };
  }

  /** Get all spawned agents */
  getAllAgents() {
    return Array.from(this.agents.values()).map(a => ({
      agentId: a.agentId,
      sessionId: a.sessionId,
      role: a.role,
      directory: a.directory,
      prompt: a.prompt,
    }));
  }

  /** Stop all spawned agents (for app shutdown) */
  stopAll() {
    for (const [sessionId] of this.agents) {
      this.stop(sessionId);
    }
  }

  /** Open a terminal window attached to a spawned agent's working directory */
  openTerminal(sessionId: string): boolean {
    const agent = this.agents.get(sessionId);
    if (!agent) return false;

    // Open a new terminal at the agent's working directory
    // macOS: use open -a Terminal
    if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', agent.directory], { detached: true });
    } else if (process.platform === 'linux') {
      // Try common linux terminals
      spawn('x-terminal-emulator', ['--working-directory', agent.directory], { detached: true });
    } else {
      // Windows
      spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${agent.directory}"`], { detached: true });
    }
    return true;
  }
}
