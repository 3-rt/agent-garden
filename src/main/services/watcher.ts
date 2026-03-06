import { watch, FSWatcher, existsSync, mkdirSync } from 'fs';
import { FileEvent } from '../../shared/types';

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private directory: string = '';

  start(directory: string, onEvent: (event: FileEvent) => void) {
    this.stop();
    this.directory = directory;

    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    this.watcher = watch(directory, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Debounce: wait 200ms before emitting, reset if same file fires again
      const existing = this.debounceTimers.get(filename);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(filename, setTimeout(() => {
        this.debounceTimers.delete(filename);
        onEvent({
          type: eventType === 'rename' ? 'created' : 'modified',
          path: filename,
        });
      }, 200));
    });
  }

  getDirectory(): string {
    return this.directory;
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
