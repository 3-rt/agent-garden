import { readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import type { GardenLayoutState, PlantState } from '../../shared/types';
import { assignGroupsToBeds, buildZoneBeds, type BedLayoutGroup } from '../../shared/garden-bed-layout';

const MAX_GENERATED_FILES = 250;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test-build',
  // Python
  'venv',
  '.venv',
  'env',
  '__pycache__',
  'site-packages',
  '.eggs',
  // Ruby
  'vendor',
  // Java / JVM
  'target',
  '.gradle',
  // Rust
  // Go
  // General artifacts
  '.cache',
  '.tmp',
  '.temp',
  '.parcel-cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.svelte-kit',
  '.output',
]);

const LOW_SIGNAL_FILES = [
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.ya?ml$/i,
  /\.min\.(js|css)$/i,
  /\.snap$/i,
  /\.pyc$/i,
  /\.pyo$/i,
  /\.class$/i,
  /\.o$/i,
  /\.so$/i,
  /\.dylib$/i,
  /\.dll$/i,
  /\.exe$/i,
  /\.whl$/i,
  /\.egg$/i,
  /\.jar$/i,
  /\.map$/i,
  /\.d\.ts$/i,
];

const PATH_BONUSES: Array<[RegExp, number]> = [
  [/^src\//, 3],
  [/^src\/main\//, 3],
  [/^src\/renderer\//, 3],
  [/\/components?\//, 2],
  [/\/services?\//, 2],
  [/\/scenes?\//, 2],
  [/\/systems?\//, 2],
];

const EXTENSION_BONUSES: Record<string, number> = {
  '.ts': 3,
  '.tsx': 2,
  '.js': 2,
  '.jsx': 2,
  '.css': 1,
  '.json': -1,
};

interface ScannedFile {
  relativePath: string;
  directoryGroup: string;
  zone: string;
  importanceScore: number;
  growthScale: number;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

export function shouldIgnoreRelativePath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split('/');
  if (segments.some((segment) => IGNORE_DIRS.has(segment))) return true;
  if (segments.some((segment) => segment.startsWith('.') && segment.length > 1)) return true;
  if (segments.some((segment) => segment.endsWith('.egg-info'))) return true;
  return LOW_SIGNAL_FILES.some((pattern) => pattern.test(normalized));
}

export function scoreRelativePath(relativePath: string, sizeBytes: number): number {
  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  const ext = path.extname(normalized);

  let score = 0;

  if (sizeBytes >= 64 * 1024) score += 6;
  else if (sizeBytes >= 16 * 1024) score += 4;
  else if (sizeBytes >= 4 * 1024) score += 3;
  else if (sizeBytes >= 1024) score += 2;
  else if (sizeBytes > 0) score += 1;

  score += EXTENSION_BONUSES[ext] || 0;

  for (const [pattern, bonus] of PATH_BONUSES) {
    if (pattern.test(normalized)) score += bonus;
  }

  if (normalized.includes('/test/') || normalized.includes('.test.') || normalized.includes('.spec.')) {
    score += 1;
  }

  return Math.max(1, score);
}

function fileToZone(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('test')) return 'tests';
  if (lower.includes('.tsx') || lower.includes('.css') || lower.includes('component')) return 'frontend';
  return 'backend';
}

function directoryWeight(directoryGroup: string): number {
  if (!directoryGroup || directoryGroup === '.') return 0;
  return directoryGroup.split('/').length;
}

function growthScaleForScore(score: number): number {
  if (score >= 16) return 1.9;
  if (score >= 13) return 1.65;
  if (score >= 10) return 1.4;
  if (score >= 7) return 1.2;
  if (score >= 4) return 1.15;
  return 0.95;
}

function scanDirectory(rootDir: string, currentDir: string, acc: ScannedFile[]) {
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath));

    if (shouldIgnoreRelativePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(rootDir, absolutePath, acc);
      continue;
    }

    if (!entry.isFile()) continue;

    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    const importanceScore = scoreRelativePath(relativePath, stats.size);
    const directoryGroup = path.dirname(relativePath) === '.' ? 'root' : path.dirname(relativePath);

    acc.push({
      relativePath,
      directoryGroup,
      zone: fileToZone(relativePath),
      importanceScore,
      growthScale: growthScaleForScore(importanceScore),
    });
  }
}

function compareScannedFiles(a: ScannedFile, b: ScannedFile): number {
  return (
    a.zone.localeCompare(b.zone) ||
    directoryWeight(b.directoryGroup) - directoryWeight(a.directoryGroup) ||
    a.directoryGroup.localeCompare(b.directoryGroup) ||
    b.importanceScore - a.importanceScore ||
    a.relativePath.localeCompare(b.relativePath)
  );
}

function scoreDirectoryGroup(files: ScannedFile[]): number {
  const importanceTotal = files.reduce((sum, file) => sum + file.importanceScore, 0);
  const growthTotal = files.reduce((sum, file) => sum + file.growthScale, 0);
  return importanceTotal * 10 + growthTotal * 6 + files.length * 8;
}

function layoutZone(zoneFiles: ScannedFile[], zone: string, createdAt: number): GardenLayoutState {
  const zoneLayout: Record<string, { x: number; width: number }> = {
    frontend: { x: 0, width: 0.33 },
    backend: { x: 0.33, width: 0.34 },
    tests: { x: 0.67, width: 0.33 },
  };

  const layout = zoneLayout[zone];
  const zoneStart = layout.x * CANVAS_WIDTH;
  const zoneWidth = layout.width * CANVAS_WIDTH;
  const filesByDirectory = new Map<string, ScannedFile[]>();

  for (const file of zoneFiles) {
    const group = filesByDirectory.get(file.directoryGroup) || [];
    group.push(file);
    filesByDirectory.set(file.directoryGroup, group);
  }

  const beds = buildZoneBeds({
    zone: zone as 'frontend' | 'backend' | 'tests',
    fileCount: zoneFiles.length,
    zoneStart,
    zoneWidth,
    centerY: CANVAS_HEIGHT / 2,
  });
  const groups: BedLayoutGroup[] = Array.from(filesByDirectory.entries()).map(([directoryGroup, files]) => ({
    groupPath: directoryGroup,
    signalScore: scoreDirectoryGroup(files),
    files: [...files]
      .sort(compareScannedFiles)
      .map((file) => ({
        filename: file.relativePath,
        zone,
        growthScale: file.growthScale,
        importanceScore: file.importanceScore,
      })),
  }));

  return assignGroupsToBeds({
    beds,
    groups,
    createdAt,
  });
}

export function generateInitialGardenLayout(rootDir: string): GardenLayoutState {
  const scanned: ScannedFile[] = [];
  scanDirectory(rootDir, rootDir, scanned);

  const prioritized = scanned
    .sort(compareScannedFiles)
    .slice(0, MAX_GENERATED_FILES);

  const createdAt = Date.now();
  const zones: Array<'frontend' | 'backend' | 'tests'> = ['frontend', 'backend', 'tests'];

  return zones.reduce<GardenLayoutState>((acc, zone) => {
    const zoneLayout = layoutZone(
      prioritized.filter((file) => file.zone === zone),
      zone,
      createdAt,
    );
    acc.plants.push(...zoneLayout.plants);
    acc.beds.push(...zoneLayout.beds);
    return acc;
  }, { plants: [], beds: [] });
}

export function generateInitialGarden(rootDir: string): PlantState[] {
  return generateInitialGardenLayout(rootDir).plants;
}

export function readLineCount(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  if (!content) return 0;
  return content.split('\n').length;
}
