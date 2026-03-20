import type { GardenBedState, GardenZone, PlantState, WorldBounds } from './types';

export interface BedLayoutFile {
  filename: string;
  zone: string;
  growthScale?: number;
  importanceScore?: number;
}

export interface BedLayoutGroup {
  groupPath: string;
  signalScore: number;
  files: BedLayoutFile[];
}

export interface BuildZoneBedsOptions {
  zone: GardenZone;
  fileCount: number;
  zoneStart: number;
  zoneWidth: number;
  centerY: number;
}

export interface ScatterPlantsInBedOptions {
  bed: GardenBedState;
  files: BedLayoutFile[];
  createdAt: number;
  minSpacing?: number;
  edgePadding?: number;
}

export interface AssignGroupsToBedsOptions {
  beds: GardenBedState[];
  groups: BedLayoutGroup[];
  createdAt: number;
  minSpacing?: number;
  edgePadding?: number;
}

export interface BedAssignmentResult {
  beds: GardenBedState[];
  plants: PlantState[];
}

const DEFAULT_EDGE_PADDING = 12;
const DEFAULT_MIN_SPACING = 18;

export function deriveBedCount(fileCount: number): number {
  if (fileCount <= 0) return 0;
  if (fileCount <= 4) return 1;
  if (fileCount <= 9) return 2;
  if (fileCount <= 14) return 3;
  if (fileCount <= 22) return 4;
  if (fileCount <= 30) return 5;
  return 6;
}

function gridShape(count: number): { columns: number; rows: number } {
  if (count <= 3) return { columns: count, rows: 1 };
  if (count <= 4) return { columns: 2, rows: 2 };
  return { columns: 3, rows: Math.ceil(count / 3) };
}

function distanceSquared(x: number, y: number, centerX: number, centerY: number): number {
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy;
}

function compareCenterPriority(
  a: { x: number; y: number; slot: number },
  b: { x: number; y: number; slot: number },
  centerX: number,
  centerY: number,
): number {
  return (
    distanceSquared(a.x, a.y, centerX, centerY) - distanceSquared(b.x, b.y, centerX, centerY) ||
    Math.abs(a.y - centerY) - Math.abs(b.y - centerY) ||
    Math.abs(a.x - centerX) - Math.abs(b.x - centerX) ||
    a.slot - b.slot
  );
}

function filePriority(a: BedLayoutFile, b: BedLayoutFile): number {
  return (
    (b.importanceScore || 0) - (a.importanceScore || 0) ||
    (b.growthScale || 1) - (a.growthScale || 1) ||
    a.filename.localeCompare(b.filename)
  );
}

export function buildZoneBeds({
  zone,
  fileCount,
  zoneStart,
  zoneWidth,
  centerY,
}: BuildZoneBedsOptions): GardenBedState[] {
  const bedCount = deriveBedCount(fileCount);
  if (!bedCount) return [];

  const { columns, rows } = gridShape(bedCount);
  const horizontalGap = 24;
  const verticalGap = 26;
  const horizontalPadding = 18;
  const maxWidth = Math.floor(
    (zoneWidth - horizontalPadding * 2 - horizontalGap * Math.max(columns - 1, 0)) / Math.max(columns, 1),
  );
  const bedWidth = Math.max(96, Math.min(140, maxWidth));
  const bedHeight = rows === 1 ? 88 : 82;
  const totalWidth = bedWidth * columns + horizontalGap * Math.max(columns - 1, 0);
  const totalHeight = bedHeight * rows + verticalGap * Math.max(rows - 1, 0);
  const centerX = zoneStart + zoneWidth / 2;
  const startX = centerX - totalWidth / 2 + bedWidth / 2;
  const startY = centerY - totalHeight / 2 + bedHeight / 2;
  const capacity = Math.max(3, Math.ceil(fileCount / bedCount));

  const slots: Array<{ x: number; y: number; slot: number }> = [];
  for (let slot = 0; slot < columns * rows; slot++) {
    const row = Math.floor(slot / columns);
    const column = slot % columns;
    slots.push({
      x: startX + column * (bedWidth + horizontalGap),
      y: startY + row * (bedHeight + verticalGap),
      slot,
    });
  }

  return slots
    .sort((a, b) => compareCenterPriority(a, b, centerX, centerY))
    .slice(0, bedCount)
    .map((slot, rank) => ({
      id: `${zone}-bed-${rank}`,
      zone,
      x: Math.round(slot.x),
      y: Math.round(slot.y),
      width: bedWidth,
      height: bedHeight,
      rank,
      capacity,
      directoryGroups: [],
      plantKeys: [],
    }));
}

export function scatterPlantsInBed({
  bed,
  files,
  createdAt,
  minSpacing = DEFAULT_MIN_SPACING,
  edgePadding = DEFAULT_EDGE_PADDING,
}: ScatterPlantsInBedOptions): PlantState[] {
  if (!files.length) return [];

  const sortedFiles = [...files].sort(filePriority);
  const innerWidth = Math.max(0, bed.width - edgePadding * 2);
  const innerHeight = Math.max(0, bed.height - edgePadding * 2);
  const columns = Math.max(1, Math.ceil(Math.sqrt(sortedFiles.length)));
  const rows = Math.max(1, Math.ceil(sortedFiles.length / columns));
  const xStep = columns === 1 ? 0 : innerWidth / (columns - 1);
  const yStep = rows === 1 ? 0 : innerHeight / (rows - 1);
  const centerX = bed.x;
  const centerY = bed.y;

  const slots: Array<{ x: number; y: number; slot: number }> = [];
  for (let slot = 0; slot < columns * rows; slot++) {
    const row = Math.floor(slot / columns);
    const column = slot % columns;
    slots.push({
      x: columns === 1 ? centerX : bed.x - innerWidth / 2 + column * xStep,
      y: rows === 1 ? centerY : bed.y - innerHeight / 2 + row * yStep,
      slot,
    });
  }

  const selectedSlots = slots
    .sort((a, b) => compareCenterPriority(a, b, centerX, centerY))
    .slice(0, sortedFiles.length);

  return sortedFiles.map((file, index) => {
    const slot = selectedSlots[index];
    return {
      filename: file.filename,
      x: Math.round(slot.x),
      y: Math.round(slot.y),
      zone: file.zone,
      createdAt,
      bedId: bed.id,
      growthScale: file.growthScale,
    };
  }).filter((plant, index, allPlants) => {
    return allPlants.slice(index + 1).every((other) => {
      const dx = plant.x - other.x;
      const dy = plant.y - other.y;
      return Math.sqrt(dx * dx + dy * dy) >= minSpacing;
    });
  });
}

export interface ComputeWorldBoundsOptions {
  beds: GardenBedState[];
  minWidth: number;
  minHeight: number;
  padding?: number;
}

export function computeWorldBounds({
  beds,
  minWidth,
  minHeight,
  padding = 64,
}: ComputeWorldBoundsOptions): WorldBounds {
  if (beds.length === 0) {
    return { x: 0, y: 0, width: minWidth, height: minHeight };
  }

  let maxRight = 0;
  let maxBottom = 0;

  for (const bed of beds) {
    const right = bed.x + bed.width / 2;
    const bottom = bed.y + bed.height / 2;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  return {
    x: 0,
    y: 0,
    width: Math.max(minWidth, maxRight + padding * 2),
    height: Math.max(minHeight, maxBottom + padding * 2),
  };
}

export function assignGroupsToBeds({
  beds,
  groups,
  createdAt,
  minSpacing,
  edgePadding,
}: AssignGroupsToBedsOptions): BedAssignmentResult {
  const nextBeds = beds.map((bed) => ({
    ...bed,
    directoryGroups: [...bed.directoryGroups],
    plantKeys: [...bed.plantKeys],
  }));
  const filesByBed = new Map(nextBeds.map((bed) => [bed.id, [] as BedLayoutFile[]]));
  const orderedGroups = [...groups]
    .map((group) => ({
      ...group,
      files: [...group.files].sort(filePriority),
    }))
    .sort((a, b) => b.signalScore - a.signalScore || a.groupPath.localeCompare(b.groupPath));

  for (const group of orderedGroups) {
    const remainingFiles = [...group.files];
    const orderedBeds = [...nextBeds].sort((a, b) => {
      const emptyDiff = Number(a.directoryGroups.length > 0) - Number(b.directoryGroups.length > 0);
      return emptyDiff || a.rank - b.rank || a.id.localeCompare(b.id);
    });

    for (const bed of orderedBeds) {
      if (!remainingFiles.length) break;

      const occupied = filesByBed.get(bed.id)?.length || 0;
      const available = Math.max(0, bed.capacity - occupied);
      if (!available) continue;

      const assignedFiles = remainingFiles.splice(0, available);
      if (!assignedFiles.length) continue;

      if (!bed.directoryGroups.includes(group.groupPath)) {
        bed.directoryGroups.push(group.groupPath);
      }
      bed.plantKeys.push(...assignedFiles.map((file) => file.filename));
      filesByBed.get(bed.id)?.push(...assignedFiles);
    }

    if (remainingFiles.length) {
      const overflowBed = [...nextBeds].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))[0];
      if (!overflowBed.directoryGroups.includes(group.groupPath)) {
        overflowBed.directoryGroups.push(group.groupPath);
      }
      overflowBed.plantKeys.push(...remainingFiles.map((file) => file.filename));
      filesByBed.get(overflowBed.id)?.push(...remainingFiles);
    }
  }

  return {
    beds: nextBeds,
    plants: nextBeds.flatMap((bed) => scatterPlantsInBed({
      bed,
      files: filesByBed.get(bed.id) || [],
      createdAt,
      minSpacing,
      edgePadding,
    })),
  };
}
