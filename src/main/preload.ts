import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStreamChunk, FileEvent } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  submitTask: (prompt: string) => ipcRenderer.send('task:submit', prompt),
  onAgentStream: (callback: (chunk: AgentStreamChunk) => void) => {
    ipcRenderer.on('agent:stream', (_event, chunk) => callback(chunk));
  },
  onFileEvent: (callback: (event: FileEvent) => void) => {
    ipcRenderer.on('file:event', (_event, data) => callback(data));
  },
});
