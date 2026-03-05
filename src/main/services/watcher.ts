import { watch, FSWatcher } from 'fs';
import { FileEvent } from '../../shared/types';

export class FileWatcher {
  private watcher: FSWatcher | null = null;

  start(directory: string, onEvent: (event: FileEvent) => void) {
    this.watcher = watch(directory, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      onEvent({
        type: eventType === 'rename' ? 'created' : 'modified',
        path: filename,
      });
    });
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
  }
}
