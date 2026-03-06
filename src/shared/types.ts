export interface Task {
  id: string;
  prompt: string;
  status: 'queued' | 'in-progress' | 'complete' | 'error';
}

export interface AgentStreamChunk {
  taskId: string;
  text: string;
  done: boolean;
}

export interface FileEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
}

export interface TaskStatus {
  taskId: string;
  status: 'queued' | 'in-progress' | 'complete' | 'error';
  queueLength?: number;
}

export interface FileSaved {
  taskId: string;
  filename: string;
  path: string;
}

export interface ElectronAPI {
  submitTask: (prompt: string) => void;
  selectDirectory: () => Promise<string | null>;
  setApiKey: (key: string) => void;
  getHasApiKey: () => Promise<boolean>;
  onAgentStream: (callback: (chunk: AgentStreamChunk) => void) => void;
  onFileEvent: (callback: (event: FileEvent) => void) => void;
  onTaskStatus: (callback: (status: TaskStatus) => void) => void;
  onFileSaved: (callback: (info: FileSaved) => void) => void;
  onDirectoryChanged: (callback: (dir: string) => void) => void;
  onAgentError: (callback: (error: { taskId: string; message: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
