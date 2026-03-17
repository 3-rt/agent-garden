import { execFile } from 'child_process';
import { EventEmitter } from 'events';

const SCAN_INTERVAL_MS = 5_000; // 5 seconds

export interface DetectedProcess {
  pid: number;
  directory?: string;
  args: string;
}

export class ProcessScanner extends EventEmitter {
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private knownPids = new Set<number>();

  start() {
    // Run an initial scan immediately, then periodically
    this.scan();
    this.scanTimer = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
  }

  stop() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.knownPids.clear();
  }

  /** Clear known PIDs so the next scan re-evaluates all processes. */
  rescan() {
    this.knownPids.clear();
    this.scan();
  }

  private scan() {
    // Use ps to find claude processes
    // -e: all processes, -o: output format
    execFile('ps', ['-eo', 'pid,args'], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        return;
      }
      this.parseOutput(stdout);
    });
  }

  private parseOutput(stdout: string) {
    const currentPids = new Set<number>();
    const lines = stdout.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Match lines where the command is or contains 'claude'
      // Exclude our own grep/ps and this electron process
      if (!this.isClaudeProcess(trimmed)) continue;

      const match = trimmed.match(/^(\d+)\s+(.+)$/);
      if (!match) continue;

      const pid = parseInt(match[1], 10);
      const args = match[2];
      currentPids.add(pid);

      if (!this.knownPids.has(pid)) {
        // New process detected
        this.knownPids.add(pid);
        const directory = this.extractDirectory(args);

        if (directory) {
          this.emit('detected', { pid, args, directory } as DetectedProcess);
        } else {
          // No directory in args — look up actual cwd via lsof
          this.lookupProcessCwd(pid, (cwd) => {
            this.emit('detected', { pid, args, directory: cwd } as DetectedProcess);
          });
        }
      }
    }

    // Check for processes that have disappeared
    for (const pid of this.knownPids) {
      if (!currentPids.has(pid)) {
        this.knownPids.delete(pid);
        this.emit('exited', pid);
      }
    }
  }

  private lookupProcessCwd(pid: number, callback: (cwd: string | undefined) => void) {
    execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) {
        callback(undefined);
        return;
      }
      // lsof -Fn outputs lines starting with 'n' for the name field
      const match = stdout.match(/^n(.+)$/m);
      callback(match ? match[1] : undefined);
    });
  }

  private isClaudeProcess(line: string): boolean {
    const match = line.match(/^\d+\s+(.+)$/);
    if (!match) return false;
    const args = match[1];

    // Must contain 'claude' as a standalone command
    if (!/(?:^|\s|\/)claude(?:\s|$)/.test(args)) return false;

    // Exclude false positives
    if (args.includes('agent-garden')) return false;
    if (args.includes('ps -eo')) return false;
    if (args.includes('grep')) return false;

    // Exclude VS Code / IDE extension processes (native binary embedded in extensions)
    if (args.includes('.vscode') || args.includes('extensions/anthropic')) return false;
    if (args.includes('--output-format stream-json')) return false;

    // Exclude shell wrapper lines that contain 'claude' in a snapshot path or eval
    if (args.includes('shell-snapshots')) return false;
    if (args.includes('/bin/zsh -c')) return false;
    if (args.includes('/bin/bash -c')) return false;

    return true;
  }

  private extractDirectory(args: string): string | undefined {
    // Try to extract --cwd or --directory flags
    const cwdMatch = args.match(/(?:--cwd|--directory|-C)\s+(\S+)/);
    if (cwdMatch) return cwdMatch[1];

    // Try to extract a path-like argument that looks like a working directory
    // e.g., "claude /Users/dev/my-project"
    const parts = args.split(/\s+/);
    for (const part of parts) {
      if (part.startsWith('/') && !part.startsWith('/usr') && !part.startsWith('/bin') && !part.includes('claude')) {
        return part;
      }
    }

    return undefined;
  }
}
