import { watch, FSWatcher, existsSync, mkdirSync } from 'fs';
import { FileEvent } from '../../shared/types';

export class FileWatcher {
  private watchers = new Map<string, FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private primaryDirectory: string = '';
  private onEvent: ((event: FileEvent) => void) | null = null;

  start(directory: string, onEvent: (event: FileEvent) => void) {
    this.stop();
    this.primaryDirectory = directory;
    this.onEvent = onEvent;
    this.watchDirectory(directory);
  }

  /** Add an additional directory to watch. Returns false if already watched. */
  addDirectory(directory: string): boolean {
    if (this.watchers.has(directory)) return false;
    if (!this.onEvent) return false;
    this.watchDirectory(directory);
    return true;
  }

  /** Remove a watched directory. Cannot remove the primary directory. */
  removeDirectory(directory: string): boolean {
    if (directory === this.primaryDirectory) return false;
    const w = this.watchers.get(directory);
    if (!w) return false;
    w.close();
    this.watchers.delete(directory);
    return true;
  }

  getDirectory(): string {
    return this.primaryDirectory;
  }

  getDirectories(): string[] {
    return Array.from(this.watchers.keys());
  }

  getAdditionalDirectories(): string[] {
    return this.getDirectories().filter(d => d !== this.primaryDirectory);
  }

  stop() {
    for (const w of this.watchers.values()) {
      w.close();
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private watchDirectory(directory: string) {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    const w = watch(directory, { recursive: true }, (eventType, filename) => {
      if (!filename || !this.onEvent) return;

      // Use directory:filename as debounce key to avoid cross-directory collisions
      const key = `${directory}:${filename}`;
      const existing = this.debounceTimers.get(key);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(key, setTimeout(() => {
        this.debounceTimers.delete(key);
        this.onEvent!({
          type: eventType === 'rename' ? 'created' : 'modified',
          path: filename,
          directory,
        });
      }, 200));
    });

    this.watchers.set(directory, w);
  }
}
