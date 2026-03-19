# Garden Bed Layout Design

**Date:** 2026-03-19
**Issue:** `Untracked` Add section-based garden beds for plant placement
**Repo:** `agent-garden`

## Goal

Replace scattered per-zone plant placement with explicit garden beds so each section of the garden feels organized and readable. Beds should pack multiple plants, preserve clear gaps between plots, and reserve the most central plots for the most important project structure.

## User Decisions

- Each section (`frontend`, `backend`, `tests`) should become a group of beds.
- Plants should be packed into beds rather than scattered across the full section width.
- Bed assignment should prioritize keeping directory groups together.
- More important files and directories should land in the middle beds.
- Bed count should scale from the number of files in the section.
- Beds should use a compact grid layout within each section.
- Plants inside a bed should use loose bounded scatter rather than a rigid mini-grid.
- Gaps between beds must stay open so the garden still reads as traversable.
- Agent movement should stay unchanged for now; beds affect layout only.
- Beds should render visibly, but subtly.
- New plants should join an existing bed when possible and only push outward when the section gets crowded.

## Product Intent

The garden already separates files by broad zone, but the result still feels noisy because file-level plants occupy too much open space. Garden beds should make the project structure legible at a glance without replacing individual plants as the primary signal. The user should perceive a section as a cluster of planted plots, with central plots representing the most important code areas and outer plots absorbing less critical or overflow structure.

## Recommended Approach

Introduce an explicit bed layout model shared by initial garden generation and live file insertion:

1. Build bed footprints per zone from file counts.
2. Score directory groups and assign the strongest groups to the most central beds.
3. Scatter plants loosely inside each assigned bed while keeping all positions inside the bed bounds.
4. Persist bed membership so reopening the project preserves stable structure.
5. When new files arrive, place them into the best existing bed first and add new outer beds only when necessary.

This gives the feature a stable layout foundation instead of trying to infer beds later from already scattered plant positions.

## Scope

### In Scope

- Bed-based initial placement for generated gardens
- Bed-based placement for newly created plants after generation
- Per-zone bed count derived from file count
- Directory-aware assignment into beds
- Importance-aware center weighting for bed assignment
- Subtle visible rendering for bed footprints
- Persistence of bed membership and layout state
- Tests for assignment, placement bounds, overflow, and restoration

### Out Of Scope

- Agent pathfinding or collision avoidance around beds
- Interactive bed expansion or collapse
- Full bed rebalancing whenever a new file appears
- Heavy decorative art passes for beds
- Replacing file-level plants with only aggregate directory objects

## User Experience

### Section Structure

Each zone should read as a compact cluster of plots rather than a wide strip of scattered files. The section should have a visible center, and the user should naturally read that center as the most important area of that zone.

### Bed Appearance

Beds should be visible enough to organize the scene but quiet enough that plants remain the main focus. A faint soil fill, outline, or border treatment is sufficient for the first version.

### Ongoing Growth

When new files are created, they should usually appear inside an existing bed that already represents their directory or nearby structure. Only when a section fills up should the garden add a new outer bed. Central beds should remain stable.

## Architecture

The layout model should move from "each plant owns a free x/y position" to "zones own beds and beds own placement slots or bounded scatter regions."

The cleanest architecture is to introduce a shared layout service that both initial generation and live insertion can use. That service should:

1. Compute zone bed groups from the current file set
2. Assign files or directory groups to beds
3. Produce plant positions inside each bed
4. Select the target bed for live file creation
5. Expand a zone with a new outer bed when its existing capacity is exceeded

The main-process initial generator can use this service to emit a fully laid-out initial state. The renderer-side live insertion path should use the same rules instead of continuing to place plants through the current per-zone slot math.

## Data Model

The feature should make beds first-class persisted layout state.

### Bed State

Add a per-bed shape with fields such as:

- `id`
- `zone`
- `x`
- `y`
- `width`
- `height`
- `rank`
- `capacity`
- `directoryGroups`
- `plantKeys`

### Plant State

Plants should remain individually persisted, but each plant should also know which bed it belongs to. Raw `x` and `y` can remain part of persistence if that reduces migration risk, but the bed id should become the durable grouping key that allows restore and resize flows to reconstruct the same layout.

### Garden State

Persist per-zone bed collections alongside the existing plant list. This allows the app to restore stable bed geometry and gives future movement or interaction work a concrete model to build on.

## Bed Count And Geometry

Each zone should derive its bed count from the number of files assigned to that zone using a simple stepped rule. The rule should keep small zones compact and prevent very large projects from turning a zone into a wall of plots.

The geometry rules should be:

- use a compact grid per zone
- keep a consistent minimum horizontal and vertical gap between beds
- place the highest-ranked bed at the visual center of the section
- expand outward symmetrically as more beds are added
- keep all beds within their zone bounds with padding from the section edges

The exact thresholds can be tuned during implementation, but the count function should be deterministic for a given file set.

## Assignment Model

Files should first be grouped by directory for bed assignment. Each directory group should receive a combined importance score derived from:

- file count
- aggregate importance or growth weight
- path significance such as `src/`, `services/`, `components/`, `scenes/`, `systems/`
- file type bonuses already used in initial generation

Assignment rules:

1. Rank directory groups by descending signal.
2. Rank beds by center priority.
3. Assign the strongest groups to the highest-priority beds first.
4. Keep a directory group within one bed when capacity allows.
5. If a group overflows, spill it into the next nearest outer bed rather than breaking the central ranking model.

This keeps the user’s mental model consistent: central beds represent the strongest code areas, while overflow expands outward.

## In-Bed Plant Placement

Plants inside a bed should use loose bounded scatter rather than rows or a strict grid.

Placement rules:

- sample positions only inside the bed bounds
- keep padding from the bed edge so the bed remains visible
- enforce a minimum plant-to-plant distance
- preserve enough randomness that the plot still feels organic
- stay deterministic when possible for generation and restore flows

The first version does not need a complex packing solver. A bounded scatter pass with retries and a fallback placement rule is enough.

## Live Insertion Rules

When a new file event arrives after initial generation:

1. Determine the file’s zone.
2. Look for a bed in that zone already holding the same directory group.
3. If none exists, look for the best nearby bed with available capacity.
4. Place the new plant into that bed using the in-bed scatter rules.
5. If no bed has room and the zone has crossed its expansion threshold, add a new outer bed and place the file there.

The important constraint is stability. New files should extend the current shape of the section rather than causing frequent whole-zone reshuffles.

## Rendering

`GardenScene` should render bed backgrounds before rendering plant containers. The first version should use simple primitives already common in the scene:

- muted soil rectangles or rounded plots
- optional faint border or shadow
- low depth so plants and labels remain dominant

Resize and restore behavior should rebuild bed visuals from persisted bed state, then rebuild plant display on top.

## Integration Notes

Current behavior is split:

- initial generation lays out file plants in the main process
- live file creation places plants in the renderer with zone-slot math

Garden beds should unify those paths around one shared layout contract. The implementation should avoid leaving the app with two competing placement systems, because that would make restored gardens drift away from live-grown gardens.

## Risks

### Overly Fragile Persistence

If bed ids, plant membership, and geometry are not modeled clearly, restored gardens may lose structure or create duplicate layout logic. The persisted shape needs a stable identifier strategy.

### Crowded Beds

If bed capacity is too high or plant spacing too loose, beds will either overlap visually or look empty. The capacity formula needs a small amount of tuning.

### Drift Between Generator And Renderer

If initial generation and live insertion do not share the same assignment rules, the garden will gradually stop looking intentional. The core layout algorithm should live in one place.

### Large Project Scaling

Very large zones could produce too many beds or too much re-layout work. Bed count should be capped and the overflow strategy should favor readability over perfect fidelity.

## Testing Strategy

Add focused tests for:

- bed count derived from per-zone file counts
- center-priority ranking for bed assignment
- directory groups staying together when capacity allows
- controlled overflow into outer beds
- plant positions staying inside bed bounds
- minimum spacing between plants in the same bed
- new files joining an existing matching bed when possible
- zone expansion creating a new outer bed only when thresholds are exceeded
- restore and resize rebuilding the same bed membership and relative organization

The tests should target pure layout helpers wherever possible rather than forcing every rule through Phaser scene integration.

## Implementation Direction

The implementation should proceed in this order:

1. Define persisted bed state and plant-to-bed membership types.
2. Extract a shared bed layout module that can compute zone bed geometry and assignments.
3. Update initial garden generation to output plants and beds together.
4. Update live file insertion to place new plants through the bed layout module.
5. Render subtle bed footprints in the scene.
6. Extend persistence and restore flows to preserve bed state.
7. Add focused tests for layout and insertion rules before tuning visuals.
