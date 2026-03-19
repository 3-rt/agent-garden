import type { AgentRole, PlantState } from '../../shared/types';

export interface PlantClusterOptions {
  mergeThreshold?: number;
  minGroupSize?: number;
}

export interface DisplayPlant {
  id: string;
  kind: 'single' | 'merged';
  zone: string;
  bedId?: string;
  x: number;
  y: number;
  label: string;
  fileCount: number;
  filenames: string[];
  filename?: string;
  directory?: string;
  creatorRole?: AgentRole;
  growthScale?: number;
}

export interface PlantDisplayLayout {
  totalFiles: number;
  visiblePlants: DisplayPlant[];
}

interface CandidateGroup {
  id: string;
  zone: string;
  bedId?: string;
  groupPath: string;
  plants: PlantState[];
  signalScore: number;
  lowSignal: boolean;
  aggregateGrowth: number;
}

const DEFAULT_OPTIONS: Required<PlantClusterOptions> = {
  mergeThreshold: 24,
  minGroupSize: 3,
};

const MAX_VISIBLE_PER_ZONE = 3;

const LOW_SIGNAL_FILE_PATTERNS = [
  /^readme(\..+)?$/i,
  /^package-lock\.json$/i,
  /^yarn\.lock$/i,
  /^pnpm-lock\.ya?ml$/i,
  /^poetry\.lock$/i,
  /^pipfile\.lock$/i,
  /^cargo\.lock$/i,
  /^composer\.lock$/i,
];

const LOW_SIGNAL_SEGMENTS = new Set([
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.pytest_cache',
  'tmp',
  'temp',
]);

const HIGH_SIGNAL_SEGMENTS = new Map<string, number>([
  ['src', 18],
  ['app', 18],
  ['web', 10],
  ['components', 12],
  ['component', 12],
  ['services', 12],
  ['service', 12],
  ['models', 10],
  ['model', 10],
  ['lib', 8],
  ['pages', 8],
  ['routes', 8],
  ['tests', 12],
  ['test', 10],
  ['unit', 6],
  ['integration', 6],
]);

const ENTRYPOINT_NAMES = new Set([
  'index.ts',
  'index.tsx',
  'main.ts',
  'main.tsx',
  'app.ts',
  'app.tsx',
  'page.tsx',
  'layout.tsx',
  'route.ts',
  'route.tsx',
]);

const ZONE_FALLBACK_LABELS: Record<string, string> = {
  frontend: 'frontend files',
  backend: 'backend files',
  tests: 'test files',
};

function splitPosixPath(value: string): string[] {
  return value.split('/').filter(Boolean);
}

function basename(value: string): string {
  const parts = splitPosixPath(value);
  return parts[parts.length - 1] || value;
}

function dirname(value: string): string {
  const parts = splitPosixPath(value);
  if (parts.length <= 1) return '.';
  return parts.slice(0, -1).join('/');
}

function normalizeOptions(options?: PlantClusterOptions): Required<PlantClusterOptions> {
  return {
    mergeThreshold: options?.mergeThreshold ?? DEFAULT_OPTIONS.mergeThreshold,
    minGroupSize: options?.minGroupSize ?? DEFAULT_OPTIONS.minGroupSize,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function selectRole(plants: PlantState[]): AgentRole | undefined {
  const counts = new Map<AgentRole, number>();
  for (const plant of plants) {
    if (!plant.creatorRole) continue;
    counts.set(plant.creatorRole, (counts.get(plant.creatorRole) || 0) + 1);
  }

  let bestRole: AgentRole | undefined;
  let bestCount = 0;
  for (const [role, count] of counts) {
    if (count > bestCount) {
      bestRole = role;
      bestCount = count;
    }
  }
  return bestRole;
}

function normalizeGroupPath(filename: string): string {
  const parent = dirname(filename);
  return parent === '.' ? filename : parent;
}

function isLowSignalGroup(groupPath: string): boolean {
  const name = basename(groupPath).toLowerCase();
  if (LOW_SIGNAL_FILE_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }

  const segments = groupPath.toLowerCase().split('/').filter(Boolean);
  return segments.some((segment) => LOW_SIGNAL_SEGMENTS.has(segment));
}

function scoreGroup(groupPath: string, plants: PlantState[]): number {
  const segments = groupPath.toLowerCase().split('/').filter(Boolean);
  const name = basename(groupPath).toLowerCase();
  const totalGrowth = plants.reduce((sum, plant) => sum + (plant.growthScale || 1), 0);

  let score = plants.length * 10 + totalGrowth * 6;

  for (const segment of segments) {
    score += HIGH_SIGNAL_SEGMENTS.get(segment) || 0;
  }

  for (const plant of plants) {
    const filenameLower = plant.filename.toLowerCase();
    const fileBase = basename(filenameLower);
    if (ENTRYPOINT_NAMES.has(fileBase)) {
      score += 4;
    }
    if (filenameLower.includes('/src/')) score += 3;
    if (filenameLower.includes('/app/')) score += 3;
    if (filenameLower.includes('/tests/')) score += 3;
  }

  if (segments.length === 0 || groupPath === name) {
    score -= 10;
  }

  if (isLowSignalGroup(groupPath)) {
    score -= 100;
  }

  return score;
}

function getVisibleQuota(groups: CandidateGroup[]): number {
  const meaningful = groups.filter((group) => !group.lowSignal && group.signalScore > 0);
  if (meaningful.length >= MAX_VISIBLE_PER_ZONE) return MAX_VISIBLE_PER_ZONE;
  if (meaningful.length >= 2) return 2;
  if (meaningful.length >= 1) return 1;
  return Math.min(1, groups.length);
}

function sanitizeLabel(label: string, zone: string): string {
  return isLowSignalGroup(label) ? (ZONE_FALLBACK_LABELS[zone] || 'project files') : label;
}

function groupLabel(groupPath: string, zone: string): string {
  if (groupPath === basename(groupPath) && isLowSignalGroup(groupPath)) {
    return ZONE_FALLBACK_LABELS[zone] || 'project files';
  }
  return sanitizeLabel(groupPath, zone);
}

function toDisplayPlant(group: CandidateGroup): DisplayPlant {
  const filenames = group.plants.map((plant) => plant.filename).sort();
  const label = groupLabel(group.groupPath, group.zone);

  if (group.plants.length === 1) {
    const plant = group.plants[0];
    return {
      id: plant.directory ? `${plant.directory}:${plant.filename}` : plant.filename,
      kind: 'single',
      zone: plant.zone,
      bedId: plant.bedId,
      x: plant.x,
      y: plant.y,
      label,
      fileCount: 1,
      filenames: [plant.filename],
      filename: plant.filename,
      directory: plant.directory,
      creatorRole: plant.creatorRole,
      growthScale: plant.growthScale,
    };
  }

  return {
    id: `merged:${group.zone}:${group.bedId || 'none'}:${group.groupPath}`,
    kind: 'merged',
    zone: group.zone,
    bedId: group.bedId,
    x: Math.round(average(group.plants.map((plant) => plant.x))),
    y: Math.round(average(group.plants.map((plant) => plant.y))),
    label,
    fileCount: group.plants.length,
    filenames,
    directory: group.plants.find((plant) => plant.directory)?.directory,
    creatorRole: selectRole(group.plants),
    growthScale: Math.min(2.8, Math.max(...group.plants.map((plant) => plant.growthScale || 1)) + Math.min(0.9, group.plants.length * 0.12)),
  };
}

function buildMergedRemainders(zone: string, groups: CandidateGroup[], minGroupSize: number): DisplayPlant[] {
  if (!groups.length) return [];

  const groupsByBed = new Map<string, CandidateGroup[]>();
  for (const group of groups) {
    const key = group.bedId || '__no_bed__';
    const bucket = groupsByBed.get(key) || [];
    bucket.push(group);
    groupsByBed.set(key, bucket);
  }

  const remainderPlants: DisplayPlant[] = [];

  for (const [bedKey, bedGroups] of groupsByBed) {
    const plants = bedGroups.flatMap((group) => group.plants);
    const filenames = plants.map((plant) => plant.filename).sort();

    if (plants.length === 1 && bedGroups.length === 1 && bedGroups[0].plants.length < minGroupSize) {
      remainderPlants.push(toDisplayPlant(bedGroups[0]));
      continue;
    }

    remainderPlants.push({
      id: `merged:${zone}:${bedKey}:remainder`,
      kind: 'merged',
      zone,
      bedId: bedKey === '__no_bed__' ? undefined : bedKey,
      x: Math.round(average(plants.map((plant) => plant.x))),
      y: Math.round(average(plants.map((plant) => plant.y))),
      label: ZONE_FALLBACK_LABELS[zone] || 'project files',
      fileCount: plants.length,
      filenames,
      directory: plants.find((plant) => plant.directory)?.directory,
      creatorRole: selectRole(plants),
      growthScale: Math.min(2.8, Math.max(...plants.map((plant) => plant.growthScale || 1)) + Math.min(0.9, plants.length * 0.12)),
    });
  }

  return remainderPlants;
}

export function groupPlantsForDisplay(
  plants: PlantState[],
  options?: PlantClusterOptions,
): PlantDisplayLayout {
  const resolved = normalizeOptions(options);

  if (plants.length < resolved.mergeThreshold) {
    return {
      totalFiles: plants.length,
      visiblePlants: plants.map((plant) => ({
        id: plant.directory ? `${plant.directory}:${plant.filename}` : plant.filename,
        kind: 'single',
        zone: plant.zone,
        bedId: plant.bedId,
        x: plant.x,
        y: plant.y,
        label: plant.filename,
        fileCount: 1,
        filenames: [plant.filename],
        filename: plant.filename,
        directory: plant.directory,
        creatorRole: plant.creatorRole,
        growthScale: plant.growthScale,
      })),
    };
  }

  const rawGroups = new Map<string, PlantState[]>();

  for (const plant of plants) {
    const groupPath = normalizeGroupPath(plant.filename);
    const key = `${plant.zone}\u0000${plant.bedId || ''}\u0000${groupPath}`;
    const group = rawGroups.get(key) || [];
    group.push(plant);
    rawGroups.set(key, group);
  }

  const groupsByZone = new Map<string, CandidateGroup[]>();

  for (const [key, groupPlants] of rawGroups) {
    const [zone, bedId, groupPath] = key.split('\u0000');
    const candidate: CandidateGroup = {
      id: key,
      zone,
      bedId: bedId || undefined,
      groupPath,
      plants: groupPlants,
      signalScore: scoreGroup(groupPath, groupPlants),
      lowSignal: isLowSignalGroup(groupPath),
      aggregateGrowth: groupPlants.reduce((sum, plant) => sum + (plant.growthScale || 1), 0),
    };

    const zoneGroups = groupsByZone.get(zone) || [];
    zoneGroups.push(candidate);
    groupsByZone.set(zone, zoneGroups);
  }

  const visiblePlants: DisplayPlant[] = [];

  for (const [zone, zoneGroups] of groupsByZone) {
    zoneGroups.sort((a, b) =>
      b.signalScore - a.signalScore ||
      b.plants.length - a.plants.length ||
      b.aggregateGrowth - a.aggregateGrowth ||
      a.groupPath.localeCompare(b.groupPath),
    );

    const quota = getVisibleQuota(zoneGroups);
    const visibleGroups = zoneGroups.slice(0, quota);
    const remainingGroups = zoneGroups.slice(quota);

    for (const group of visibleGroups) {
      visiblePlants.push(toDisplayPlant(group));
    }

    visiblePlants.push(...buildMergedRemainders(zone, remainingGroups, resolved.minGroupSize));
  }

  visiblePlants.sort((a, b) => a.zone.localeCompare(b.zone) || a.x - b.x || a.y - b.y || a.label.localeCompare(b.label));

  return {
    totalFiles: plants.length,
    visiblePlants,
  };
}
