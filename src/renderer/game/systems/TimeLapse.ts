export interface GardenSnapshot {
  timestamp: number;
  plants: { filename: string; x: number; y: number; zone: string }[];
  agents: { id: string; role: string; state: string; x: number; totalTokens: number }[];
  stats: { filesCreated: number; tasksCompleted: number; activeAgents: number };
}

export class TimeLapse {
  private snapshots: GardenSnapshot[] = [];
  private maxSnapshots = 200;
  private _isRecording = true;

  get isRecording(): boolean {
    return this._isRecording;
  }

  get snapshotCount(): number {
    return this.snapshots.length;
  }

  setRecording(recording: boolean) {
    this._isRecording = recording;
  }

  addSnapshot(snapshot: GardenSnapshot) {
    if (!this._isRecording) return;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getSnapshots(): GardenSnapshot[] {
    return [...this.snapshots];
  }

  getSnapshot(index: number): GardenSnapshot | null {
    return this.snapshots[index] || null;
  }

  clear() {
    this.snapshots = [];
  }

  // Export snapshot data as JSON
  exportJSON(): string {
    return JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      snapshots: this.snapshots,
    }, null, 2);
  }

  // Import from JSON
  importJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (data.version === 1 && Array.isArray(data.snapshots)) {
        this.snapshots = data.snapshots;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
