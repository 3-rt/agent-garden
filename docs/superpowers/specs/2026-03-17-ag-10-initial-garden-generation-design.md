# AG-10 Initial Garden Generation Design

**Date:** 2026-03-17
**Issue:** `AG-10` Generate initial garden from existing project files
**Repo:** `agent-garden`

## Goal

When a user opens an existing project, Agent Garden should immediately render a meaningful initial garden based on the current file tree instead of starting empty. The generated garden should reflect project organization and file importance, then continue evolving through normal live file events.

## Product Intent

The initial garden should help the user understand their project at a glance while coding. The most important visual structure is directory organization, because that matches how developers mentally navigate a codebase. File type remains useful, but as a secondary signal. Individual plant prominence should come from a deterministic importance score based on file content size, file path significance, and file type.

## Recommended Approach

Use a directory-first weighted layout:

- Group files primarily by directory structure
- Preserve existing frontend/backend/tests zone logic as a higher-level spatial grouping
- Within each zone, cluster files by directory
- Use a tunable importance score to decide plant prominence

This keeps the garden readable for real projects while still reflecting coding-relevant structure.

## Scope

### In Scope

- Scan the currently watched project directory and generate an initial plant set
- Reflect directory organization in placement
- Reflect relative file importance in generated plant prominence
- Skip noisy directories and low-value generated files
- Persist the generated garden as the baseline saved state
- Keep live file watching behavior unchanged after generation

### Out Of Scope

- Directory-level aggregate plants
- Merging many plants into larger plants
- Alternative views such as isometric rendering
- Git-history-based maturity modeling
- A fully semantic understanding of "importance"

## User Experience

### First Open

When the app opens a project directory with no saved garden state, the garden should populate automatically from the existing project files. The result should feel immediate and readable, not like a blank canvas waiting for Claude Code to create files.

### Later Opens

If a saved garden state already exists for the current context, restore that state and do not regenerate from disk on every launch.

### Directory Switching

If the user switches to a different watched directory and there is no saved garden baseline for that context, generate the initial garden once for that directory and then persist it.

## Architecture

The initial file scan should happen in the main process. Filesystem access, watched directory state, and persistence decisions already live there, so the renderer should not duplicate that responsibility.

The main process should:

1. Walk the current watched directory
2. Filter out ignored paths and low-signal files
3. Compute metadata for each remaining file
4. Derive a normalized initial plant payload
5. Send that payload to the renderer

The renderer should:

- Reuse the existing plant restore / plant creation path as much as possible
- Avoid introducing a second, divergent rendering system for generated plants
- Continue treating future live file events as incremental changes on top of the generated baseline

## Data Model

Each scanned file should produce a record with:

- `relativePath`
- `filename`
- `directory`
- `zone`
- `extension`
- `sizeBytes`
- `lineCount` if cheaply available
- `importanceScore`
- `creatorRole` omitted
- `createdAt` set to generation time in the first version

The existing `PlantState` can remain the persistence format. If extra scan-only metadata is needed, it should exist only in the main-process generation pipeline and not be forced into the persisted shape unless it directly powers rendering.

## Placement Model

Placement should follow these rules:

1. Use the existing file-to-zone mapping first
2. Within each zone, group files by directory
3. Within each directory group, place higher-importance files in more visually prominent positions
4. Keep placement deterministic for the same file set so the initial garden feels stable

The first version should not create synthetic directory plants. It should still render file-level plants, but their placement should make directory structure visible.

## Importance Scoring

Importance must stay heuristic and deterministic. It should be easy to tune without rewriting the feature.

### Inputs

- File size in bytes and/or line count
- File extension
- Path significance

### Suggested Heuristic

Start with a base score from size:

- Very small files get a low base score
- Medium source files get a moderate base score
- Large source files get a higher base score

Apply path bonuses for directories that are commonly central while coding in this repo shape:

- `src/`
- `src/main/`
- `src/renderer/`
- `components/`
- `services/`
- `scenes/`
- `systems/`

Apply file type bonuses for code-bearing files:

- `.ts`
- `.tsx`
- `.js`
- `.jsx`

Apply penalties or filtering for low-signal files:

- lockfiles
- minified assets
- snapshots
- build output
- vendored dependencies

This score should drive relative prominence, not absolute meaning. The user should read it as "more important-looking" rather than "proven most important file."

## Filtering

Ignore these directories by default:

- `.git`
- `node_modules`
- `dist`
- `build`
- `coverage`
- `test-build`

Ignore obviously low-value generated files when practical:

- lockfiles if they dominate the scan
- minified bundles
- hidden transient files

The filter list should be centralized so it is easy to tune later.

## Performance Constraints

Initial generation must not freeze the app on moderately sized projects.

Guidelines:

- Use a bounded recursive scan
- Avoid expensive parsing
- Prefer file size metadata over AST or semantic analysis
- Compute line count only if it is cheap enough
- If needed, cap the number of rendered files in the first version and prioritize the highest-signal files

Correctness and responsiveness matter more than perfect importance ranking.

## Persistence Rules

Generated plants should be saved using the same persistence path used for normal garden state. Once generated, they become the baseline state that later live file events modify.

Regeneration should not happen automatically every time the app loads, because that would overwrite the user's evolved garden and make persistence meaningless.

## Integration Notes

The feature should fit into the current app flow:

- Main process owns directory state and persistence
- Renderer creates and restores plants
- File watcher continues to emit live create/modify/delete events

The cleanest insertion point is likely:

- main process decides whether an initial scan is needed
- renderer receives the generated plant list and restores or creates plants

This avoids mixing disk scan logic into `GardenScene` or `App.tsx`.

## Risks

### Overfitting Importance

If the scoring logic becomes too clever, it will be hard to understand or tune. Keep it rule-based.

### Layout Noise

If directory grouping is weak, the garden will still feel random. Placement needs to visibly cluster related files.

### Large Projects

A naive full-tree scan could overwhelm rendering or clutter the scene. The first version should bias toward relevance and stability over full fidelity.

### Persistence Ambiguity

If the app cannot distinguish "saved garden exists" from "new project needs generation," users may see unexpected overwrites. This state transition needs explicit handling.

## Testing Strategy

Add focused tests for:

- path filtering
- importance score calculation
- deterministic grouping by directory
- mapping scanned files to zones
- generation only when no prior garden state exists
- preservation of normal live file event behavior after generation

The tests should prefer deterministic fixtures over large real-world scans.

## Implementation Direction

The first implementation should be intentionally narrow:

1. Add a main-process scanning utility for current project files
2. Filter and score files deterministically
3. Produce generated `PlantState[]`
4. Load generated plants only when saved garden state is absent
5. Persist the result and keep all later updates on the existing path

This should deliver the core user benefit without overlapping with future work like plant merging or alternate views.
