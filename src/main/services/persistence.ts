import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';

export interface GardenState {
  plants: PlantState[];
  stats: GardenStats;
  theme: string;
  savedAt: number;
}

export interface PlantState {
  filename: string;
  x: number;
  y: number;
  zone: string;
  createdAt: number;
}

export interface GardenStats {
  filesCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  tokensUsed: number;
  sessionStart: number;
}

export class PersistenceService {
  private statePath: string;
  private stats: GardenStats;

  constructor(configDir: string) {
    const dir = path.join(configDir, 'agent-garden');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.statePath = path.join(dir, 'garden-state.json');
    this.stats = {
      filesCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tokensUsed: 0,
      sessionStart: Date.now(),
    };
  }

  loadState(): GardenState | null {
    try {
      if (existsSync(this.statePath)) {
        const data = JSON.parse(readFileSync(this.statePath, 'utf-8'));
        if (data.stats) this.stats = { ...this.stats, ...data.stats };
        return data;
      }
    } catch {}
    return null;
  }

  saveState(plants: PlantState[], theme: string) {
    const state: GardenState = {
      plants,
      stats: this.stats,
      theme,
      savedAt: Date.now(),
    };
    try {
      writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    } catch {}
  }

  getStats(): GardenStats {
    return { ...this.stats };
  }

  recordFileCreated() {
    this.stats.filesCreated++;
  }

  recordTaskCompleted() {
    this.stats.tasksCompleted++;
  }

  recordTaskFailed() {
    this.stats.tasksFailed++;
  }

  recordTokens(count: number) {
    this.stats.tokensUsed += count;
  }
}
