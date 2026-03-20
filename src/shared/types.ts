export type AgentRole = 'planter' | 'weeder' | 'tester' | 'unassigned';
export type GardenZone = 'frontend' | 'backend' | 'tests';

// Claude Code hook event types
export type HookEventType =
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Notification';

export interface HookEvent {
  type: HookEventType;
  sessionId: string;
  timestamp: number;
  // SessionStart
  directory?: string;
  // PreToolUse / PostToolUse
  tool?: string;
  file?: string;
  // UserPromptSubmit
  prompt?: string;
  // Notification
  message?: string;
}

export type CCAgentStatus = 'idle' | 'working' | 'disconnected';
export type CCAgentSource = 'hooks' | 'process' | 'spawned';

export interface CCAgentSession {
  agentId: string;
  sessionId: string;
  role: AgentRole;
  status: CCAgentStatus;
  source: CCAgentSource;
  processPid?: number;
  directory?: string;
  lastActivity: number;
  lastTool?: string;
  lastFile?: string;
  lastPrompt?: string;
}

export interface OrchestrationSubtask {
  id: string;
  prompt: string;
  role: AgentRole;
  status: 'pending' | 'assigned' | 'complete' | 'error';
  agentId?: string;
  sessionId?: string;
  directory?: string;
}

export interface OrchestrationPlan {
  id: string;
  goal: string;
  subtasks: OrchestrationSubtask[];
  status: 'planning' | 'in-progress' | 'complete' | 'error';
  createdAt: number;
}

export interface Task {
  id: string;
  prompt: string;
  status: 'queued' | 'in-progress' | 'complete' | 'error';
  agentId?: string;
}

export interface AgentStreamChunk {
  taskId: string;
  agentId: string;
  text: string;
  done: boolean;
}

export interface FileEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  directory?: string;
  agentId?: string;
  creatorRole?: AgentRole;
}

export interface TaskStatus {
  taskId: string;
  agentId: string;
  status: 'queued' | 'in-progress' | 'complete' | 'error';
  queueLength?: number;
}

export interface FileSaved {
  taskId: string;
  agentId: string;
  filename: string;
  path: string;
}

export interface AgentInfo {
  id: string;
  role: AgentRole;
  busy: boolean;
  totalTokens: number;
}

export interface GardenStats {
  filesCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  activeAgents: number;
  sessionStart: number;
}

export interface PlantState {
  filename: string;
  x: number;
  y: number;
  zone: string;
  createdAt: number;
  bedId?: string;
  directory?: string;
  creatorRole?: AgentRole;
  growthScale?: number;
}

export interface GardenBedState {
  id: string;
  zone: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  capacity: number;
  directoryGroups: string[];
  plantKeys: string[];
}

export interface WorldBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GardenLayoutState {
  plants: PlantState[];
  beds: GardenBedState[];
}

export interface GardenState extends GardenLayoutState {
  stats: GardenStats;
  theme: string;
  savedAt: number;
  version?: number; // 2 = world-space coordinates
}

export type ActivityLogScope = 'project' | 'agent';
export type ActivityLogKind =
  | 'agent-connected'
  | 'agent-disconnected'
  | 'agent-activity'
  | 'agent-output'
  | 'agent-exited'
  | 'file-event'
  | 'plan-created'
  | 'subtask-updated'
  | 'plan-completed';

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  scope: ActivityLogScope;
  kind: ActivityLogKind;
  message: string;
  agentId?: string;
  agentLabel?: string;
  sessionId?: string;
  role?: AgentRole;
  tool?: string;
  file?: string;
  planId?: string;
  subtaskId?: string;
  status?: string;
}

export type HookConnectionStatus = 'connected' | 'waiting' | 'not-configured';

export interface HookStatusInfo {
  status: HookConnectionStatus;
  lastEventTime?: number;
}

export interface ElectronAPI {
  submitTask: (prompt: string) => void;
  selectDirectory: () => Promise<string | null>;
  setApiKey: (key: string) => void;
  getHasApiKey: () => Promise<boolean>;
  getAgentInfo: () => Promise<AgentInfo[]>;
  resetAgentTokens: (agentId: string) => void;
  getGardenState: () => Promise<GardenState | null>;
  getInitialGarden: () => Promise<GardenLayoutState>;
  saveGardenState: (layout: GardenLayoutState, theme: string) => void;
  getStats: () => Promise<GardenStats>;
  setTheme: (themeId: string) => void;
  onAgentStream: (callback: (chunk: AgentStreamChunk) => void) => void;
  onFileEvent: (callback: (event: FileEvent) => void) => void;
  onTaskStatus: (callback: (status: TaskStatus) => void) => void;
  onFileSaved: (callback: (info: FileSaved) => void) => void;
  onDirectoryChanged: (callback: (dir: string) => void) => void;
  // Directory management (Phase 5f)
  addDirectory: () => Promise<string | null>;
  removeDirectory: (dir: string) => void;
  getDirectories: () => Promise<{ primary: string; additional: string[] }>;
  onDirectoriesUpdated: (callback: (dirs: { primary: string; additional: string[] }) => void) => void;
  onAgentError: (callback: (error: { taskId: string; agentId: string; message: string }) => void) => void;
  onAgentsUpdated: (callback: (agents: AgentInfo[]) => void) => void;
  onStatsUpdated: (callback: (stats: GardenStats) => void) => void;
  onSaveRequested: (callback: () => void) => void;
  // Claude Code agent events
  onCCAgentConnected: (callback: (session: CCAgentSession) => void) => void;
  onCCAgentActivity: (callback: (data: { agentId: string; event: HookEventType; tool?: string; file?: string; prompt?: string }) => void) => void;
  onCCAgentDisconnected: (callback: (data: { agentId: string; reason: string }) => void) => void;
  getCCAgents: () => Promise<CCAgentSession[]>;
  // Spawning & lifecycle
  spawnAgent: (role: AgentRole, prompt?: string, directory?: string) => Promise<{ agentId: string; sessionId: string } | null>;
  stopAgent: (sessionId: string) => void;
  openTerminal: (sessionId: string) => void;
  detectClaude: () => Promise<boolean>;
  onCCAgentSpawned: (callback: (data: { agentId: string; sessionId: string; role: AgentRole; directory: string; prompt?: string }) => void) => void;
  onCCAgentOutput: (callback: (data: { agentId: string; sessionId: string; text: string }) => void) => void;
  onCCAgentExited: (callback: (data: { agentId: string; sessionId: string; code: number | null }) => void) => void;
  // Hook status (Phase 5g)
  getHookStatus: () => Promise<HookConnectionStatus>;
  onHookStatusChanged: (callback: (status: HookConnectionStatus) => void) => void;
  // Setup UX (Phase 5h)
  checkHookConfig: () => Promise<{ cliInstalled: boolean; hooksConfigured: boolean }>;
  autoConfigureHooks: () => Promise<{ success: boolean; error?: string }>;
  checkBannerDismissed: () => Promise<boolean>;
  dismissBanner: () => void;
  // Head Gardener orchestration
  submitGoal: (goal: string) => Promise<OrchestrationPlan>;
  getPlans: () => Promise<OrchestrationPlan[]>;
  onPlanCreated: (callback: (plan: OrchestrationPlan) => void) => void;
  onSubtaskUpdated: (callback: (data: { planId: string; subtask: OrchestrationSubtask }) => void) => void;
  onPlanCompleted: (callback: (plan: OrchestrationPlan) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
