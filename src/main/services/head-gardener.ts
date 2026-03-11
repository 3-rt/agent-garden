import { EventEmitter } from 'events';
import { TaskRouter } from './task-router';
import { ClaudeCodeTracker } from './claude-code-tracker';
import { ClaudeCodeManager } from './claude-code-manager';
import type { AgentRole } from '../../shared/types';

export interface Subtask {
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
  subtasks: Subtask[];
  status: 'planning' | 'in-progress' | 'complete' | 'error';
  createdAt: number;
}

const router = new TaskRouter();

export class HeadGardener extends EventEmitter {
  private tracker: ClaudeCodeTracker;
  private manager: ClaudeCodeManager;
  private plans = new Map<string, OrchestrationPlan>();
  private nextPlanId = 1;
  private defaultDirectory: string;

  constructor(tracker: ClaudeCodeTracker, manager: ClaudeCodeManager, defaultDirectory: string) {
    super();
    this.tracker = tracker;
    this.manager = manager;
    this.defaultDirectory = defaultDirectory;

    // Listen for spawned agent exits to update subtask status
    manager.on('exited', (data) => {
      this.handleAgentExited(data.sessionId, data.code);
    });
  }

  setDefaultDirectory(dir: string) {
    this.defaultDirectory = dir;
  }

  /**
   * Submit a high-level goal. The Head Gardener decomposes it into subtasks
   * and delegates to available or newly spawned agents.
   */
  async submitGoal(goal: string): Promise<OrchestrationPlan> {
    const planId = `plan-${this.nextPlanId++}`;
    const subtasks = this.decomposeGoal(goal);

    const plan: OrchestrationPlan = {
      id: planId,
      goal,
      subtasks,
      status: 'in-progress',
      createdAt: Date.now(),
    };

    this.plans.set(planId, plan);
    this.emit('plan-created', plan);

    // Dispatch all subtasks
    for (const subtask of subtasks) {
      await this.dispatchSubtask(plan, subtask);
    }

    return plan;
  }

  /**
   * Decompose a goal into subtasks using keyword-based analysis.
   * Splits compound goals (connected by "and", "with", "then") into parts,
   * then routes each part to the appropriate role.
   */
  private decomposeGoal(goal: string): Subtask[] {
    // Split on common conjunctions that indicate separate tasks
    const parts = goal
      .split(/\s+(?:and\s+(?:also\s+)?|with\s+|then\s+|,\s*(?:and\s+)?also\s+|,\s+)/i)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // If no split happened, treat the whole goal as a single subtask
    if (parts.length <= 1) {
      const role = router.route(goal);
      return [{
        id: 'sub-1',
        prompt: router.cleanPrompt(goal),
        role,
        status: 'pending',
      }];
    }

    // Route each part
    return parts.map((part, i) => {
      const role = router.route(part);
      return {
        id: `sub-${i + 1}`,
        prompt: router.cleanPrompt(part),
        role,
        status: 'pending' as const,
      };
    });
  }

  /**
   * Dispatch a subtask: find an idle agent with matching role, or spawn one.
   */
  private async dispatchSubtask(plan: OrchestrationPlan, subtask: Subtask): Promise<void> {
    // Look for an idle agent with matching role
    const sessions = this.tracker.getActiveSessions();
    const idle = sessions.find(s => s.role === subtask.role && s.status === 'idle');

    if (idle && idle.source === 'spawned') {
      // Reuse existing idle spawned agent by sending input
      subtask.agentId = idle.agentId;
      subtask.sessionId = idle.sessionId;
      subtask.status = 'assigned';
      this.manager.sendInput(idle.sessionId, subtask.prompt);
    } else {
      // Spawn a new agent for this subtask
      const result = await this.manager.spawn({
        role: subtask.role,
        prompt: subtask.prompt,
        directory: subtask.directory || this.defaultDirectory,
      });

      if (result) {
        subtask.agentId = result.agentId;
        subtask.sessionId = result.sessionId;
        subtask.status = 'assigned';
      } else {
        subtask.status = 'error';
      }
    }

    this.emit('subtask-updated', { planId: plan.id, subtask });
    this.checkPlanCompletion(plan);
  }

  private handleAgentExited(sessionId: string, code: number | null) {
    for (const plan of this.plans.values()) {
      for (const subtask of plan.subtasks) {
        if (subtask.sessionId === sessionId && subtask.status === 'assigned') {
          subtask.status = code === 0 ? 'complete' : 'error';
          this.emit('subtask-updated', { planId: plan.id, subtask });
          this.checkPlanCompletion(plan);
          return;
        }
      }
    }
  }

  private checkPlanCompletion(plan: OrchestrationPlan) {
    const allDone = plan.subtasks.every(s => s.status === 'complete' || s.status === 'error');
    if (!allDone) return;

    const anyError = plan.subtasks.some(s => s.status === 'error');
    plan.status = anyError ? 'error' : 'complete';
    this.emit('plan-completed', plan);
  }

  getPlan(planId: string): OrchestrationPlan | undefined {
    return this.plans.get(planId);
  }

  getAllPlans(): OrchestrationPlan[] {
    return Array.from(this.plans.values());
  }

  getActivePlans(): OrchestrationPlan[] {
    return this.getAllPlans().filter(p => p.status === 'in-progress');
  }
}
