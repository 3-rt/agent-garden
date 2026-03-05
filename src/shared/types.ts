export interface Task {
  id: string;
  prompt: string;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
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

export interface ElectronAPI {
  submitTask: (prompt: string) => void;
  onAgentStream: (callback: (chunk: AgentStreamChunk) => void) => void;
  onFileEvent: (callback: (event: FileEvent) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
