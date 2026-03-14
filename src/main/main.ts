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

import type { AgentRole } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
const watcher = new FileWatcher();
let persistence: PersistenceService;
const hookServer = new HookServer();
const ccTracker = new ClaudeCodeTracker();
const processScanner = new ProcessScanner();
const ccManager = new ClaudeCodeManager();
let headGardener: HeadGardener;

// File-agent correlation buffer: maps filename → { agentId, role, timestamp }
const fileAgentBuffer = new Map<string, { agentId: string; role: AgentRole; timestamp: number }>();
const CORRELATION_TTL = 2000; // 2 seconds

function recordAgentFileWrite(agentId: string, role: AgentRole, filename: string) {
  fileAgentBuffer.set(filename, { agentId, role, timestamp: Date.now() });
}

function getFileCorrelation(filename: string): { agentId: string; role: AgentRole } | null {
  const entry = fileAgentBuffer.get(filename);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CORRELATION_TTL) {
    fileAgentBuffer.delete(filename);
    return null;
  }
  return { agentId: entry.agentId, role: entry.role };
}

// Config persistence
const configPath = path.join(app.getPath('userData'), 'agent-garden-config.json');

interface AppConfig {
  watchDirectory: string;
  additionalDirectories?: string[];
  theme?: string;
  bannerDismissed?: boolean;
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
    // Enrich with agent correlation
    if (event.type === 'created' || event.type === 'modified') {
      const filename = event.path.split('/').pop() || event.path;
      const correlation = getFileCorrelation(filename);
      if (correlation) {
        event.agentId = correlation.agentId;
        event.creatorRole = correlation.role;
      }
    }
    mainWindow?.webContents.send('file:event', event);
  });
}

function broadcastDirectories() {
  mainWindow?.webContents.send('directories:updated', {
    primary: watcher.getDirectory(),
    additional: watcher.getAdditionalDirectories(),
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
  // Restore additional directories
  if (config.additionalDirectories) {
    for (const dir of config.additionalDirectories) {
      watcher.addDirectory(dir);
    }
  }
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('directory:changed', config.watchDirectory);
    broadcastDirectories();
  });

  // Directory picker (primary directory)
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select primary project directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const dir = result.filePaths[0];
    const additionalDirs = watcher.getAdditionalDirectories();
    startWatcher(dir);
    // Re-add additional directories after primary restart
    for (const d of additionalDirs) {
      watcher.addDirectory(d);
    }
    saveConfig({ watchDirectory: dir });
    headGardener?.setDefaultDirectory(dir);
    mainWindow?.webContents.send('directory:changed', dir);
    broadcastDirectories();
    return dir;
  });

  ipcMain.on('watcher:set-directory', (_event, directory: string) => {
    const additionalDirs = watcher.getAdditionalDirectories();
    startWatcher(directory);
    for (const d of additionalDirs) {
      watcher.addDirectory(d);
    }
    saveConfig({ watchDirectory: directory });
  });

  // Directory management (Phase 5f)
  ipcMain.handle('directory:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Add additional project directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const dir = result.filePaths[0];
    if (!watcher.addDirectory(dir)) return null; // Already watched

    const cfg = loadConfig();
    const additional = cfg.additionalDirectories || [];
    if (!additional.includes(dir)) {
      additional.push(dir);
      saveConfig({ additionalDirectories: additional });
    }
    broadcastDirectories();
    return dir;
  });

  ipcMain.on('directory:remove', (_event, dir: string) => {
    watcher.removeDirectory(dir);
    const cfg = loadConfig();
    const additional = (cfg.additionalDirectories || []).filter(d => d !== dir);
    saveConfig({ additionalDirectories: additional });
    broadcastDirectories();
  });

  ipcMain.handle('directory:list', () => {
    return {
      primary: watcher.getDirectory(),
      additional: watcher.getAdditionalDirectories(),
    };
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

  // Wire hook events to tracker and correlation buffer
  hookServer.on('hook', (event) => {
    ccTracker.handleHookEvent(event);

    // Record file writes for plant attribution
    if (event.type === 'PostToolUse' && event.file && event.tool) {
      const toolLower = event.tool.toLowerCase();
      if (toolLower.includes('write') || toolLower.includes('edit') ||
          toolLower.includes('create') || toolLower.includes('bash') ||
          toolLower.includes('execute')) {
        const session = ccTracker.getSession(event.sessionId);
        if (session) {
          const filename = event.file.split('/').pop() || event.file;
          recordAgentFileWrite(session.agentId, session.role, filename);
        }
      }
    }
  });

  // Hook status tracking
  let lastBroadcastedHookStatus: string = 'waiting';

  function broadcastHookStatus() {
    const lastEvent = hookServer.getLastEventTime();
    let status: string;
    if (lastEvent === 0) {
      status = 'waiting';
    } else if (Date.now() - lastEvent < 60_000) {
      status = 'connected';
    } else {
      status = 'waiting';
    }
    if (status !== lastBroadcastedHookStatus) {
      lastBroadcastedHookStatus = status;
      mainWindow?.webContents.send('hooks:status-changed', status);
    }
  }

  hookServer.on('hook', () => broadcastHookStatus());
  setInterval(() => broadcastHookStatus(), 10_000);

  ipcMain.handle('hooks:status', () => {
    const lastEvent = hookServer.getLastEventTime();
    if (lastEvent === 0) {
      // Check if hooks are even configured
      try {
        const homedir = require('os').homedir();
        const settingsPath = path.join(homedir, '.claude', 'settings.json');
        if (existsSync(settingsPath)) {
          const content = readFileSync(settingsPath, 'utf-8');
          const hookStr = JSON.stringify(JSON.parse(content).hooks || {});
          if (!hookStr.includes('localhost:7890') && !hookStr.includes('127.0.0.1:7890')) {
            return 'not-configured';
          }
        } else {
          return 'not-configured';
        }
      } catch {}
      return 'waiting';
    }
    return Date.now() - lastEvent < 60_000 ? 'connected' : 'waiting';
  });

  // Phase 5h: Hook configuration detection
  ipcMain.handle('hooks:check-config', async () => {
    const cliInstalled = (await ccManager.detectClaude()) !== null;

    let hooksConfigured = false;
    try {
      const homedir = require('os').homedir();
      const settingsPath = path.join(homedir, '.claude', 'settings.json');
      if (existsSync(settingsPath)) {
        const content = readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content);
        const hooks = settings.hooks || {};
        const hookStr = JSON.stringify(hooks);
        hooksConfigured = hookStr.includes('localhost:7890') || hookStr.includes('127.0.0.1:7890');
      }
    } catch {}

    return { cliInstalled, hooksConfigured };
  });

  ipcMain.handle('hooks:auto-configure', async () => {
    const hookConfig: Record<string, string> = {
      'SessionStart': 'http://localhost:7890/hooks/SessionStart',
      'SessionEnd': 'http://localhost:7890/hooks/SessionEnd',
      'Stop': 'http://localhost:7890/hooks/Stop',
      'PreToolUse': 'http://localhost:7890/hooks/PreToolUse',
      'PostToolUse': 'http://localhost:7890/hooks/PostToolUse',
      'UserPromptSubmit': 'http://localhost:7890/hooks/UserPromptSubmit',
      'Notification': 'http://localhost:7890/hooks/Notification',
    };

    try {
      const homedir = require('os').homedir();
      const claudeDir = path.join(homedir, '.claude');
      const settingsPath = path.join(claudeDir, 'settings.json');

      let settings: Record<string, any> = {};
      if (existsSync(settingsPath)) {
        const content = readFileSync(settingsPath, 'utf-8');
        try {
          settings = JSON.parse(content);
        } catch {
          return { success: false, error: 'Malformed JSON in ~/.claude/settings.json. Please fix manually.' };
        }
      } else {
        if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
      }

      settings.hooks = { ...(settings.hooks || {}), ...hookConfig };
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to write settings' };
    }
  });

  ipcMain.handle('setup:check-banner-dismissed', () => {
    return loadConfig().bannerDismissed === true;
  });

  ipcMain.on('setup:dismiss-banner', () => {
    saveConfig({ bannerDismissed: true });
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

  // Update stats on agent lifecycle events
  function updateActiveAgentCount() {
    const count = ccTracker.getActiveSessions().length;
    persistence.setActiveAgents(count);
    const stats = persistence.getStats();
    mainWindow?.webContents.send('stats:updated', stats);
  }

  ccTracker.on('connected', () => updateActiveAgentCount());
  ccTracker.on('disconnected', () => updateActiveAgentCount());

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
    // Only register process-scanned agents that are working in a watched directory
    if (!proc.directory) return; // No directory info — can't attribute, skip
    const watchedDirs = [watcher.getDirectory(), ...watcher.getAdditionalDirectories()];
    const isRelevant = watchedDirs.some(d => d && proc.directory.startsWith(d));
    if (!isRelevant) return;
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

    // Track task completion/failure
    if (data.code === 0) {
      persistence.recordTaskCompleted();
    } else {
      persistence.recordTaskFailed();
    }
    updateActiveAgentCount();
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
