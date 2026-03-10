import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import * as path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { ClaudeApiError } from './services/claude';
import { AgentPool } from './services/agent-pool';
import { FileWatcher } from './services/watcher';
import { PersistenceService } from './services/persistence';
import { HookServer } from './services/hook-server';
import { ClaudeCodeTracker } from './services/claude-code-tracker';
import { ProcessScanner } from './services/process-scanner';

let mainWindow: BrowserWindow | null = null;
const pool = new AgentPool();
const watcher = new FileWatcher();
let persistence: PersistenceService;
const hookServer = new HookServer();
const ccTracker = new ClaudeCodeTracker();
const processScanner = new ProcessScanner();

// Config persistence
const configPath = path.join(app.getPath('userData'), 'agent-garden-config.json');

interface AppConfig {
  watchDirectory: string;
  encryptedApiKey?: string;
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

function loadApiKey(): string | null {
  const config = loadConfig();
  if (!config.encryptedApiKey) return null;
  try {
    const buf = Buffer.from(config.encryptedApiKey, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

function saveApiKey(key: string) {
  const encrypted = safeStorage.encryptString(key).toString('base64');
  saveConfig({ encryptedApiKey: encrypted });
}

function startWatcher(directory: string) {
  watcher.start(directory, (event) => {
    mainWindow?.webContents.send('file:event', event);
  });
}

async function processTask(taskId: string, prompt: string) {
  const { role } = pool.routeTask(prompt);
  const agentId = `agent-${role}`;

  mainWindow?.webContents.send('task:status', { taskId, agentId, status: 'in-progress' });

  try {
    const { result } = await pool.submitTask(prompt, (aid, text, done) => {
      mainWindow?.webContents.send('agent:stream', { taskId, agentId: aid, text, done });
    });

    // Save generated file
    if (result.filename) {
      const dir = watcher.getDirectory();
      const { ClaudeService } = require('./services/claude');
      const saver = new ClaudeService();
      const filePath = await saver.saveToFile(dir, result.filename, result.content);
      mainWindow?.webContents.send('file:saved', {
        taskId,
        agentId,
        filename: result.filename,
        path: filePath,
      });
      persistence.recordFileCreated();
    }

    // Track stats
    const tokenEstimate = Math.ceil((prompt.length + (result.content?.length || 0)) / 4);
    persistence.recordTokens(tokenEstimate);
    persistence.recordTaskCompleted();

    // Send updated agent info and stats
    mainWindow?.webContents.send('agents:updated', pool.getAgentInfo());
    mainWindow?.webContents.send('stats:updated', persistence.getStats());
    mainWindow?.webContents.send('task:status', { taskId, agentId, status: 'complete' });
  } catch (err: any) {
    const message = err instanceof ClaudeApiError ? err.message : `${err}`;

    persistence.recordTaskFailed();
    mainWindow?.webContents.send('stats:updated', persistence.getStats());

    mainWindow?.webContents.send('agent:stream', {
      taskId,
      agentId,
      text: `Error: ${message}`,
      done: true,
    });
    mainWindow?.webContents.send('agent:error', { taskId, agentId, message });
    mainWindow?.webContents.send('task:status', { taskId, agentId, status: 'error' });
  }
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

  // Load persisted API key
  const storedKey = loadApiKey();
  if (storedKey) {
    pool.setApiKey(storedKey);
  }

  // Start file watcher with persisted directory
  const config = loadConfig();
  startWatcher(config.watchDirectory);
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('directory:changed', config.watchDirectory);
  });

  // Task submission
  ipcMain.on('task:submit', (_event, prompt: string) => {
    const taskId = Date.now().toString();
    processTask(taskId, prompt);
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
    mainWindow?.webContents.send('directory:changed', dir);
    return dir;
  });

  ipcMain.on('watcher:set-directory', (_event, directory: string) => {
    startWatcher(directory);
    saveConfig({ watchDirectory: directory });
  });

  // API key management
  ipcMain.on('api-key:set', (_event, key: string) => {
    pool.setApiKey(key);
    saveApiKey(key);
  });

  ipcMain.handle('api-key:has', () => {
    return pool.hasApiKey();
  });

  // Agent info
  ipcMain.handle('agents:info', () => {
    return pool.getAgentInfo();
  });

  // Reset token count
  ipcMain.on('agent:reset-tokens', (_event, agentId: string) => {
    pool.resetTokens(agentId);
    mainWindow?.webContents.send('agents:updated', pool.getAgentInfo());
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
  watcher.stop();
  processScanner.stop();
  ccTracker.stop();
  hookServer.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
