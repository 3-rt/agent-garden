import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import type { GardenBedState, GardenState, GardenStats, PlantState } from '../../shared/types';

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
      activeAgents: 0,
      sessionStart: Date.now(),
    };
  }

  loadState(): GardenState | null {
    try {
      if (existsSync(this.statePath)) {
        const data = JSON.parse(readFileSync(this.statePath, 'utf-8'));
        if (data.stats) {
          const { tokensUsed, ...rest } = data.stats;
          this.stats = { ...this.stats, ...rest, activeAgents: rest.activeAgents ?? 0 };
        }
        return {
          ...data,
          beds: Array.isArray(data.beds) ? data.beds : [],
        };
      }
    } catch {}
    return null;
  }

  saveState(plants: PlantState[], theme: string, beds: GardenBedState[] = []) {
    const state: GardenState = {
      plants,
      beds,
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

  setActiveAgents(count: number) {
    this.stats.activeAgents = count;
  }
}
