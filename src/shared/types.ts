export type AgentRole = 'planter' | 'weeder' | 'tester';
export type GardenZone = 'frontend' | 'backend' | 'tests';

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
  tokensUsed: number;
  sessionStart: number;
}

export interface PlantState {
  filename: string;
  x: number;
  y: number;
  zone: string;
  createdAt: number;
}

export interface GardenState {
  plants: PlantState[];
  stats: GardenStats;
  theme: string;
  savedAt: number;
}

export interface ElectronAPI {
  submitTask: (prompt: string) => void;
  selectDirectory: () => Promise<string | null>;
  setApiKey: (key: string) => void;
  getHasApiKey: () => Promise<boolean>;
  getAgentInfo: () => Promise<AgentInfo[]>;
  resetAgentTokens: (agentId: string) => void;
  getGardenState: () => Promise<GardenState | null>;
  saveGardenState: (plants: PlantState[], theme: string) => void;
  getStats: () => Promise<GardenStats>;
  setTheme: (themeId: string) => void;
  onAgentStream: (callback: (chunk: AgentStreamChunk) => void) => void;
  onFileEvent: (callback: (event: FileEvent) => void) => void;
  onTaskStatus: (callback: (status: TaskStatus) => void) => void;
  onFileSaved: (callback: (info: FileSaved) => void) => void;
  onDirectoryChanged: (callback: (dir: string) => void) => void;
  onAgentError: (callback: (error: { taskId: string; agentId: string; message: string }) => void) => void;
  onAgentsUpdated: (callback: (agents: AgentInfo[]) => void) => void;
  onStatsUpdated: (callback: (stats: GardenStats) => void) => void;
  onSaveRequested: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
