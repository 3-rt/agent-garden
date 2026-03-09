import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStreamChunk, FileEvent, TaskStatus, FileSaved, AgentInfo, GardenState, GardenStats, PlantState } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  submitTask: (prompt: string) => ipcRenderer.send('task:submit', prompt),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  setApiKey: (key: string) => ipcRenderer.send('api-key:set', key),
  getHasApiKey: () => ipcRenderer.invoke('api-key:has'),
  getAgentInfo: () => ipcRenderer.invoke('agents:info'),
  resetAgentTokens: (agentId: string) => ipcRenderer.send('agent:reset-tokens', agentId),
  getGardenState: () => ipcRenderer.invoke('garden:load'),
  saveGardenState: (plants: PlantState[], theme: string) => ipcRenderer.send('garden:save', plants, theme),
  getStats: () => ipcRenderer.invoke('garden:stats'),
  setTheme: (themeId: string) => ipcRenderer.send('garden:set-theme', themeId),
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
  onAgentError: (callback: (error: { taskId: string; agentId: string; message: string }) => void) => {
    ipcRenderer.on('agent:error', (_event, error) => callback(error));
  },
  onAgentsUpdated: (callback: (agents: AgentInfo[]) => void) => {
    ipcRenderer.on('agents:updated', (_event, agents) => callback(agents));
  },
  onStatsUpdated: (callback: (stats: GardenStats) => void) => {
    ipcRenderer.on('stats:updated', (_event, stats) => callback(stats));
  },
  onSaveRequested: (callback: () => void) => {
    ipcRenderer.on('garden:request-save', () => callback());
  },
});
