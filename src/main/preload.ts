import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStreamChunk, FileEvent, TaskStatus, FileSaved, AgentInfo, GardenState, GardenStats, PlantState, CCAgentSession, HookEventType, AgentRole, OrchestrationPlan, OrchestrationSubtask } from '../shared/types';

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
  // Directory management (Phase 5f)
  addDirectory: () => ipcRenderer.invoke('directory:add'),
  removeDirectory: (dir: string) => ipcRenderer.send('directory:remove', dir),
  getDirectories: () => ipcRenderer.invoke('directory:list'),
  onDirectoriesUpdated: (callback: (dirs: { primary: string; additional: string[] }) => void) => {
    ipcRenderer.on('directories:updated', (_event, dirs) => callback(dirs));
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
  // Claude Code agent events
  onCCAgentConnected: (callback: (session: CCAgentSession) => void) => {
    ipcRenderer.on('cc-agent:connected', (_event, session) => callback(session));
  },
  onCCAgentActivity: (callback: (data: { agentId: string; event: HookEventType; tool?: string; file?: string; prompt?: string }) => void) => {
    ipcRenderer.on('cc-agent:activity', (_event, data) => callback(data));
  },
  onCCAgentDisconnected: (callback: (data: { agentId: string; reason: string }) => void) => {
    ipcRenderer.on('cc-agent:disconnected', (_event, data) => callback(data));
  },
  getCCAgents: () => ipcRenderer.invoke('cc-agents:list'),
  // Spawning & lifecycle
  spawnAgent: (role: AgentRole, prompt?: string, directory?: string) =>
    ipcRenderer.invoke('cc-agent:spawn', role, prompt, directory),
  stopAgent: (sessionId: string) => ipcRenderer.send('cc-agent:stop', sessionId),
  openTerminal: (sessionId: string) => ipcRenderer.send('cc-agent:open-terminal', sessionId),
  detectClaude: () => ipcRenderer.invoke('cc-agent:detect-claude'),
  onCCAgentSpawned: (callback: (data: { agentId: string; sessionId: string; role: AgentRole; directory: string; prompt?: string }) => void) => {
    ipcRenderer.on('cc-agent:spawned', (_event, data) => callback(data));
  },
  onCCAgentOutput: (callback: (data: { agentId: string; sessionId: string; text: string }) => void) => {
    ipcRenderer.on('cc-agent:output', (_event, data) => callback(data));
  },
  onCCAgentExited: (callback: (data: { agentId: string; sessionId: string; code: number | null }) => void) => {
    ipcRenderer.on('cc-agent:exited', (_event, data) => callback(data));
  },
  // Hook status
  getHookStatus: () => ipcRenderer.invoke('hooks:status'),
  onHookStatusChanged: (callback: (status: string) => void) => {
    ipcRenderer.on('hooks:status-changed', (_event, status) => callback(status));
  },
  // Setup UX (Phase 5h)
  checkHookConfig: () => ipcRenderer.invoke('hooks:check-config'),
  autoConfigureHooks: () => ipcRenderer.invoke('hooks:auto-configure'),
  checkBannerDismissed: () => ipcRenderer.invoke('setup:check-banner-dismissed'),
  dismissBanner: () => ipcRenderer.send('setup:dismiss-banner'),
  // Head Gardener orchestration
  submitGoal: (goal: string) => ipcRenderer.invoke('head-gardener:submit-goal', goal),
  getPlans: () => ipcRenderer.invoke('head-gardener:get-plans'),
  onPlanCreated: (callback: (plan: OrchestrationPlan) => void) => {
    ipcRenderer.on('head-gardener:plan-created', (_event, plan) => callback(plan));
  },
  onSubtaskUpdated: (callback: (data: { planId: string; subtask: OrchestrationSubtask }) => void) => {
    ipcRenderer.on('head-gardener:subtask-updated', (_event, data) => callback(data));
  },
  onPlanCompleted: (callback: (plan: OrchestrationPlan) => void) => {
    ipcRenderer.on('head-gardener:plan-completed', (_event, plan) => callback(plan));
  },
});
