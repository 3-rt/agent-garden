import type {
  ActivityLogEntry,
  ActivityLogKind,
  AgentRole,
  CCAgentSession,
  FileEvent,
  HookEventType,
  OrchestrationPlan,
  OrchestrationSubtask,
} from '../shared/types';

interface AgentActivityPayload {
  agentId: string;
  event: HookEventType;
  tool?: string;
  file?: string;
}

interface PlanLogPayload {
  planId?: string;
  goal?: string;
  status?: string;
  subtask?: OrchestrationSubtask;
}

interface FilterOptions {
  selectedAgentId?: string | null;
  searchText?: string;
}

const DEFAULT_MAX_ENTRIES = 400;

function buildEntryId(prefix: string, timestamp: number, suffix: string): string {
  return `${prefix}-${timestamp}-${suffix}`;
}

function labelForDirectory(directory?: string): string {
  if (!directory) return 'unknown directory';
  const parts = directory.split('/').filter(Boolean);
  return parts[parts.length - 1] || directory;
}

function normalizeActivityKind(event: HookEventType, tool?: string): ActivityLogKind {
  if (event === 'PostToolUse' && tool === 'output') {
    return 'agent-output';
  }
  if (event === 'Stop') {
    return 'agent-exited';
  }
  return 'agent-activity';
}

export function createAgentLifecycleLogEntry(
  kind: 'agent-connected' | 'agent-disconnected' | 'agent-exited',
  session: Partial<CCAgentSession> & { agentId: string; sessionId?: string; role?: AgentRole; directory?: string; source?: string },
  timestamp = Date.now(),
  status?: string,
): ActivityLogEntry {
  const directoryLabel = labelForDirectory(session.directory);
  const sourceLabel = session.source ? ` via ${session.source}` : '';
  let message = '';

  if (kind === 'agent-connected') {
    message = `${session.role || 'unassigned'} agent connected in ${directoryLabel}${sourceLabel}`;
  } else if (kind === 'agent-exited') {
    message = `${session.role || 'unassigned'} agent exited${status ? ` (${status})` : ''}`;
  } else {
    message = `${session.role || 'unassigned'} agent disconnected${status ? ` (${status})` : ''}`;
  }

  return {
    id: buildEntryId(kind, timestamp, session.agentId),
    timestamp,
    scope: 'project',
    kind,
    message,
    agentId: session.agentId,
    sessionId: session.sessionId,
    role: session.role,
    status,
  };
}

export function createAgentActivityLogEntry(
  activity: AgentActivityPayload,
  timestamp = Date.now(),
  detail?: string,
): ActivityLogEntry {
  const kind = normalizeActivityKind(activity.event, activity.tool);
  let message = detail || activity.tool || activity.event;

  if (!detail) {
    if (activity.event === 'PreToolUse' && activity.tool && activity.file) {
      message = `${activity.tool} ${activity.file}`;
    } else if (activity.event === 'PostToolUse' && activity.tool && activity.file) {
      message = `${activity.tool} finished for ${activity.file}`;
    } else if (activity.event === 'UserPromptSubmit') {
      message = 'submitted a prompt';
    } else if (activity.event === 'Notification') {
      message = 'received a notification';
    } else if (activity.event === 'Stop') {
      message = 'stopped working';
    }
  }

  return {
    id: buildEntryId(kind, timestamp, activity.agentId),
    timestamp,
    scope: 'project',
    kind,
    message,
    agentId: activity.agentId,
    tool: activity.tool,
    file: activity.file,
    status: activity.event,
  };
}

export function createFileEventLogEntry(event: FileEvent, timestamp = Date.now()): ActivityLogEntry {
  const fileLabel = event.path;
  const roleLabel = event.creatorRole ? `${event.creatorRole} ` : '';

  return {
    id: buildEntryId('file', timestamp, fileLabel),
    timestamp,
    scope: 'project',
    kind: 'file-event',
    message: `${roleLabel}file ${event.type}: ${fileLabel}`,
    agentId: event.agentId,
    role: event.creatorRole,
    file: event.path,
    status: event.type,
  };
}

export function createPlanLogEntry(
  kind: 'plan-created' | 'subtask-updated' | 'plan-completed',
  payload: PlanLogPayload | OrchestrationPlan,
  timestamp = Date.now(),
): ActivityLogEntry {
  if (kind === 'plan-created') {
    const plan = payload as OrchestrationPlan;
    return {
      id: buildEntryId(kind, timestamp, plan.id),
      timestamp,
      scope: 'project',
      kind,
      message: `plan created: ${plan.goal}`,
      planId: plan.id,
      status: plan.status,
    };
  }

  if (kind === 'plan-completed') {
    const plan = payload as OrchestrationPlan;
    return {
      id: buildEntryId(kind, timestamp, plan.id),
      timestamp,
      scope: 'project',
      kind,
      message: `plan ${plan.status}: ${plan.goal}`,
      planId: plan.id,
      status: plan.status,
    };
  }

  const subtaskPayload = payload as PlanLogPayload;
  const subtask = subtaskPayload.subtask;
  return {
    id: buildEntryId(kind, timestamp, `${subtaskPayload.planId || 'plan'}-${subtask?.id || 'subtask'}`),
    timestamp,
    scope: 'project',
    kind,
    message: `${subtask?.role || 'agent'} ${subtask?.status || 'updated'}: ${subtask?.prompt || 'subtask'}`,
    agentId: subtask?.agentId,
    sessionId: subtask?.sessionId,
    role: subtask?.role,
    planId: subtaskPayload.planId,
    subtaskId: subtask?.id,
    status: subtask?.status,
  };
}

export function appendActivityLogEntry(
  entries: ActivityLogEntry[],
  entry: ActivityLogEntry,
  maxEntries = DEFAULT_MAX_ENTRIES,
): ActivityLogEntry[] {
  const nextEntries = [entry, ...entries];
  return nextEntries.slice(0, maxEntries);
}

export function filterActivityLogEntries(
  entries: ActivityLogEntry[],
  { selectedAgentId, searchText = '' }: FilterOptions,
): ActivityLogEntry[] {
  const query = searchText.trim().toLowerCase();

  return entries.filter((entry) => {
    if (selectedAgentId && entry.agentId !== selectedAgentId) {
      return false;
    }

    if (!query) return true;

    const haystack = [
      entry.message,
      entry.tool,
      entry.file,
      entry.agentId,
      entry.planId,
      entry.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}
