import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStreamChunk, FileEvent, TaskStatus, FileSaved } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  submitTask: (prompt: string) => ipcRenderer.send('task:submit', prompt),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  onAgentStream: (callback: (chunk: AgentStreamChunk) => void) => {
    ipcRenderer.on('agent:stream', (_event, chunk) => callback(chunk));
  },
  onFileEvent: (callback: (event: FileEvent) => void) => {
    ipcRenderer.on('file:event', (_event, data) => callback(data));
  },
  onTaskStatus: (callback: (status: TaskStatus) => void) => {
    ipcRenderer.on('task:status', (_event, status) => callback(status));
  },
  onFileSaved: (callback: (info: FileSaved) => void) => {
    ipcRenderer.on('file:saved', (_event, info) => callback(info));
  },
  onDirectoryChanged: (callback: (dir: string) => void) => {
    ipcRenderer.on('directory:changed', (_event, dir) => callback(dir));
  },
});
