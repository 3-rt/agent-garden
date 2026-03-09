import { ClaudeService, StreamResult, ClaudeApiError } from './claude';
import { TaskRouter, AgentRole } from './task-router';

const ROLE_SYSTEM_PROMPTS: Record<AgentRole, string> = {
  planter: `You are a code generation assistant (role: Planter). You create new code files.
Output clean, well-structured code. Always include the filename as the first line:
// @file: <filename>
Do NOT include any explanation outside the code.`,

  weeder: `You are a code refactoring assistant (role: Weeder). You improve and clean up existing code.
Output the improved version of the code. Always include the filename as the first line:
// @file: <filename>
Do NOT include any explanation outside the code.`,

  tester: `You are a testing assistant (role: Tester). You write test files for code.
Output test code using common testing patterns. Always include the filename as the first line:
// @file: <filename>
Do NOT include any explanation outside the code.`,
};

export interface PoolAgent {
  id: string;
  role: AgentRole;
  claude: ClaudeService;
  busy: boolean;
  totalTokens: number;
}

export interface PoolTaskResult {
  agentId: string;
  role: AgentRole;
  result: StreamResult;
}

export class AgentPool {
  private agents: PoolAgent[] = [];
  private router = new TaskRouter();
  private taskQueue: { id: string; prompt: string; role: AgentRole; resolve: (r: PoolTaskResult) => void; reject: (e: any) => void }[] = [];

  constructor(apiKey?: string) {
    const roles: AgentRole[] = ['planter', 'weeder', 'tester'];
    for (const role of roles) {
      const claude = new ClaudeService();
      if (apiKey) claude.setApiKey(apiKey);
      claude.setSystemPrompt(ROLE_SYSTEM_PROMPTS[role]);
      this.agents.push({
        id: `agent-${role}`,
        role,
        claude,
        busy: false,
        totalTokens: 0,
      });
    }
  }

  setApiKey(key: string) {
    for (const agent of this.agents) {
      agent.claude.setApiKey(key);
    }
  }

  hasApiKey(): boolean {
    return this.agents[0]?.claude.hasApiKey() ?? false;
  }

  getAgentInfo(): { id: string; role: AgentRole; busy: boolean; totalTokens: number }[] {
    return this.agents.map(a => ({
      id: a.id,
      role: a.role,
      busy: a.busy,
      totalTokens: a.totalTokens,
    }));
  }

  routeTask(prompt: string): { role: AgentRole; cleanPrompt: string } {
    const role = this.router.route(prompt);
    const cleanPrompt = this.router.cleanPrompt(prompt);
    return { role, cleanPrompt };
  }

  async submitTask(
    prompt: string,
    onChunk: (agentId: string, text: string, done: boolean) => void,
  ): Promise<PoolTaskResult> {
    const { role, cleanPrompt } = this.routeTask(prompt);
    const agent = this.agents.find(a => a.role === role);
    if (!agent) throw new Error(`No agent with role: ${role}`);

    if (agent.busy) {
      // Queue it
      return new Promise((resolve, reject) => {
        this.taskQueue.push({ id: Date.now().toString(), prompt: cleanPrompt, role, resolve, reject });
      });
    }

    return this.runTask(agent, cleanPrompt, onChunk);
  }

  private async runTask(
    agent: PoolAgent,
    prompt: string,
    onChunk: (agentId: string, text: string, done: boolean) => void,
  ): Promise<PoolTaskResult> {
    agent.busy = true;
    try {
      let chunkCount = 0;
      const result = await agent.claude.streamTask(prompt, (text, done) => {
        chunkCount++;
        onChunk(agent.id, text, done);
      });
      // Estimate tokens (rough: 1 token ~= 4 chars)
      agent.totalTokens += Math.ceil((prompt.length + (result.content?.length || 0)) / 4);
      return { agentId: agent.id, role: agent.role, result };
    } finally {
      agent.busy = false;
      this.processQueue(agent.role, onChunk);
    }
  }

  private processQueue(
    role: AgentRole,
    onChunk: (agentId: string, text: string, done: boolean) => void,
  ) {
    const idx = this.taskQueue.findIndex(t => t.role === role);
    if (idx === -1) return;
    const task = this.taskQueue.splice(idx, 1)[0];
    const agent = this.agents.find(a => a.role === role);
    if (!agent) return;
    this.runTask(agent, task.prompt, onChunk).then(task.resolve).catch(task.reject);
  }

  resetTokens(agentId: string) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) agent.totalTokens = 0;
  }
}
