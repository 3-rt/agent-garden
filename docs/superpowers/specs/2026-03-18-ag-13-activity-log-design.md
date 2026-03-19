# AG-13 Activity Log Design

**Date:** 2026-03-18
**Issue:** `AG-13` Add activity log per agent and project-level progress view
**Repo:** `agent-garden`

## Goal

Add a live-only activity log to Agent Garden that shows a project-wide timeline of agent and orchestration activity, and lets the user filter that timeline down to a single agent.

## Product Intent

The garden already communicates activity spatially, but it is weak as a textual source of truth. Users need a chronological view they can scan when they want to understand what happened, what is happening now, and which agent is responsible. The first version should prioritize clarity and low implementation risk over persistence or deep analytics.

## Scope

### In Scope

- Live-only activity log with bounded in-memory history
- Project-level timeline fed from existing IPC events
- Agent filter to narrow the timeline to one gardener
- Text search over the visible log entries
- Log entries for agent lifecycle, hook activity, streamed output, file events, and orchestration plan updates

### Out Of Scope

- Persisting logs to disk
- Exporting logs
- Rich analytics or charts
- Complex drill-down views beyond a single shared panel
- Reworking Phaser interactions to support in-scene click selection

## Recommended Approach

Normalize all relevant renderer-facing events into a shared `ActivityLogEntry` shape inside the renderer. Keep the source of truth in React state for this first pass. This minimizes API churn, reuses the existing event wiring, and gives a clean seam for moving normalization into the main process later if the feature grows.

## User Experience

### Default View

The interface shows a single activity panel below the agent status bar and above the directory picker. By default it displays the project log in reverse chronological order, with the newest entries first.

### Agent Focus

Clicking an agent chip in the status bar selects that agent and filters the activity panel to entries for that agent. The panel still uses the same list component; only the active filter changes.

### Search

The panel includes a search box that filters the visible entries by message text, tool name, file path, prompt text, or agent label.

## Data Model

Add a shared type:

- `ActivityLogScope`: `'project' | 'agent'`
- `ActivityLogKind`: `'agent-connected' | 'agent-disconnected' | 'agent-activity' | 'agent-output' | 'agent-exited' | 'file-event' | 'plan-created' | 'subtask-updated' | 'plan-completed'`
- `ActivityLogEntry` with:
  - `id`
  - `timestamp`
  - `scope`
  - `kind`
  - `agentId?`
  - `sessionId?`
  - `role?`
  - `message`
  - `tool?`
  - `file?`
  - `planId?`
  - `subtaskId?`
  - `status?`

The shared type keeps the renderer normalization logic explicit and testable.

## Event Mapping

The renderer should derive entries from existing event streams:

- `cc-agent:connected` -> agent connected entry
- `cc-agent:activity` -> normalized hook/tool activity entry
- `cc-agent:output` -> output entry
- `cc-agent:exited` -> success/failure exit entry
- `cc-agent:disconnected` -> disconnected entry
- `file:event` -> file created/modified/deleted entry, optionally correlated to an agent if the event already includes one
- `head-gardener:plan-created` -> plan created entry
- `head-gardener:subtask-updated` -> subtask status entry
- `head-gardener:plan-completed` -> plan completed entry

## UI Structure

Add a new `ActivityLogPanel` React component. Responsibilities:

- display header, active filter label, search field, and clear-filter button
- render a scrollable list of log entries
- format compact metadata for timestamps, agent labels, and statuses
- handle empty states for "no entries yet" and "no entries match search"

`App.tsx` remains responsible for:

- storing the normalized log list
- tracking selected agent filter
- appending entries in event listeners
- passing filtered entries to the panel

## Performance Constraints

Keep only a bounded number of entries, for example the latest 400. This avoids unbounded growth during long sessions while still giving enough recent history to be useful.

Filtering and search should happen in the renderer over that bounded list, which is sufficient for the first version.

## Testing

Add focused tests for:

- normalization from raw events into `ActivityLogEntry`
- bounded history trimming
- search/filter behavior for project vs agent view

Renderer behavior should be tested through small pure helpers where possible, instead of requiring a DOM-heavy integration harness.

## Risks

### Duplicate Noise

Some actions can surface through more than one event stream, especially tool activity and file writes. The first version should prefer readable summaries over aggressive de-duplication.

### App.tsx Growth

`App.tsx` already owns a large amount of event wiring. The log feature should introduce helper functions and a separate panel component to avoid turning AG-13 into an uncontrolled expansion of that file.

### Ambiguous Agent Selection

The status bar already renders agent chips but they are not interactive today. The implementation should make the chips clickable without changing their existing control affordances for spawned agents.
