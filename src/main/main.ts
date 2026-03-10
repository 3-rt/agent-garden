import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { FileWatcher } from './services/watcher';
import { PersistenceService } from './services/persistence';
import { HookServer } from './services/hook-server';
import { ClaudeCodeTracker } from './services/claude-code-tracker';
import { ProcessScanner } from './services/process-scanner';
import { ClaudeCodeManager } from './services/claude-code-manager';
import { HeadGardener } from './services/head-gardener';

let mainWindow: BrowserWindow | null = null;
const watcher = new FileWatcher();
let persistence: PersistenceService;
const hookServer = new HookServer();
const ccTracker = new ClaudeCodeTracker();
const processScanner = new ProcessScanner();
const ccManager = new ClaudeCodeManager();
let headGardener: HeadGardener;

// Config persistence
const configPath = path.join(app.getPath('userData'), 'agent-garden-config.json');

interface AppConfig {
  watchDirectory: string;
  theme?: string;
}

function loadConfig(): AppConfig {
  const defaultDir = path.join(app.getPath('home'), 'agent-garden-output');
  try {
    if (existsSync(configPath)) {
      return { watchDirectory: defaultDir, ...JSON.parse(readFileSync(configPath, 'utf-8')) };
    }
  } catch {}
  return { watchDirectory: defaultDir };
}

function saveConfig(config: Partial<AppConfig>) {
  const dir = path.dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

function startWatcher(directory: string) {
  watcher.start(directory, (event) => {
    mainWindow?.webContents.send('file:event', event);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Agent Garden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  // Initialize persistence
  persistence = new PersistenceService(app.getPath('userData'));

  createWindow();

  // Start file watcher with persisted directory
  const config = loadConfig();
  startWatcher(config.watchDirectory);
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('directory:changed', config.watchDirectory);
  });

  // Directory picker
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select output directory for generated files',
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const dir = result.filePaths[0];
    startWatcher(dir);
    saveConfig({ watchDirectory: dir });
    headGardener?.setDefaultDirectory(dir);
    mainWindow?.webContents.send('directory:changed', dir);
    return dir;
  });

  ipcMain.on('watcher:set-directory', (_event, directory: string) => {
    startWatcher(directory);
    saveConfig({ watchDirectory: directory });
  });

  // Garden persistence
  ipcMain.handle('garden:load', () => {
    return persistence.loadState();
  });

  ipcMain.on('garden:save', (_event, plants, theme) => {
    persistence.saveState(plants, theme);
  });

  ipcMain.handle('garden:stats', () => {
    return persistence.getStats();
  });

  // Theme persistence
  ipcMain.on('garden:set-theme', (_event, themeId: string) => {
    saveConfig({ theme: themeId });
  });

  // --- Claude Code Hook Server & Tracker ---

  // Wire hook events to tracker
  hookServer.on('hook', (event) => {
    ccTracker.handleHookEvent(event);
  });

  hookServer.on('listening', (port: number) => {
    console.log(`Hook server listening on 127.0.0.1:${port}`);
  });

  hookServer.on('error', (msg: string) => {
    console.error(`Hook server error: ${msg}`);
  });

  // Forward tracker events to renderer
  ccTracker.on('connected', (session) => {
    mainWindow?.webContents.send('cc-agent:connected', session);
  });

  ccTracker.on('activity', (data) => {
    mainWindow?.webContents.send('cc-agent:activity', data);
  });

  ccTracker.on('disconnected', (data) => {
    mainWindow?.webContents.send('cc-agent:disconnected', data);
  });

  // IPC: get all tracked Claude Code agents
  ipcMain.handle('cc-agents:list', () => {
    return ccTracker.getActiveSessions();
  });

  // IPC: set role on a Claude Code agent
  ipcMain.on('cc-agent:set-role', (_event, sessionId: string, role: string) => {
    ccTracker.setRole(sessionId, role as any);
  });

  // --- Process Scanner ---

  processScanner.on('detected', (proc) => {
    ccTracker.registerProcessSession(proc.pid, proc.directory);
  });

  processScanner.on('exited', (pid: number) => {
    ccTracker.removeProcessSession(pid);
  });

  // --- Claude Code Manager (Spawning) ---

  ccManager.on('spawned', (data) => {
    // Register spawned agent in tracker
    ccTracker.registerSpawnedSession(data.sessionId, data.role, data.directory);
    mainWindow?.webContents.send('cc-agent:spawned', data);
  });

  ccManager.on('output', (data) => {
    mainWindow?.webContents.send('cc-agent:output', data);
    // Also show as activity in the garden
    mainWindow?.webContents.send('cc-agent:activity', {
      agentId: data.agentId,
      event: 'PostToolUse',
      tool: 'output',
    });
  });

  ccManager.on('exited', (data) => {
    ccTracker.removeSpawnedSession(data.sessionId);
    mainWindow?.webContents.send('cc-agent:exited', data);
  });

  ccManager.on('error', (msg: string) => {
    console.error('ClaudeCodeManager:', msg);
  });

  // IPC: spawn a new Claude Code agent
  ipcMain.handle('cc-agent:spawn', async (_event, role: string, prompt?: string, directory?: string) => {
    const dir = directory || watcher.getDirectory();
    return ccManager.spawn({ role: role as any, prompt, directory: dir });
  });

  // IPC: stop a spawned agent
  ipcMain.on('cc-agent:stop', (_event, sessionId: string) => {
    ccManager.stop(sessionId);
  });

  // IPC: open terminal for a spawned agent
  ipcMain.on('cc-agent:open-terminal', (_event, sessionId: string) => {
    ccManager.openTerminal(sessionId);
  });

  // IPC: check if claude CLI is installed
  ipcMain.handle('cc-agent:detect-claude', async () => {
    const path = await ccManager.detectClaude();
    return path !== null;
  });

  // --- Head Gardener Orchestrator ---

  headGardener = new HeadGardener(ccTracker, ccManager, config.watchDirectory);

  headGardener.on('plan-created', (plan) => {
    mainWindow?.webContents.send('head-gardener:plan-created', plan);
  });

  headGardener.on('subtask-updated', (data) => {
    mainWindow?.webContents.send('head-gardener:subtask-updated', data);
  });

  headGardener.on('plan-completed', (plan) => {
    mainWindow?.webContents.send('head-gardener:plan-completed', plan);
  });

  ipcMain.handle('head-gardener:submit-goal', async (_event, goal: string) => {
    return headGardener.submitGoal(goal);
  });

  ipcMain.handle('head-gardener:get-plans', () => {
    return headGardener.getAllPlans();
  });

  // Start hook server, tracker, and process scanner
  ccTracker.start();
  processScanner.start();
  hookServer.start().catch((err) => {
    console.error('Failed to start hook server:', err.message);
  });

  // Auto-save garden state periodically
  setInterval(() => {
    mainWindow?.webContents.send('garden:request-save');
  }, 30_000);
});

app.on('window-all-closed', () => {
  ccManager.stopAll();
  watcher.stop();
  processScanner.stop();
  ccTracker.stop();
  hookServer.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
