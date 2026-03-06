import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { ClaudeService } from './services/claude';
import { FileWatcher } from './services/watcher';

let mainWindow: BrowserWindow | null = null;
const claude = new ClaudeService();
const watcher = new FileWatcher();

// Task queue
const taskQueue: { id: string; prompt: string }[] = [];
let isProcessing = false;

// Config persistence
const configPath = path.join(app.getPath('userData'), 'agent-garden-config.json');

function loadConfig(): { watchDirectory: string } {
  const defaultDir = path.join(app.getPath('home'), 'agent-garden-output');
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return { watchDirectory: defaultDir };
}

function saveConfig(config: { watchDirectory: string }) {
  const dir = path.dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function startWatcher(directory: string) {
  watcher.start(directory, (event) => {
    mainWindow?.webContents.send('file:event', event);
  });
}

async function processTask(taskId: string, prompt: string) {
  isProcessing = true;
  mainWindow?.webContents.send('task:status', { taskId, status: 'in-progress' });

  try {
    const result = await claude.streamTask(prompt, (text, done) => {
      mainWindow?.webContents.send('agent:stream', { taskId, text, done });
    });

    // Save generated file
    if (result.filename) {
      const dir = watcher.getDirectory();
      const filePath = await claude.saveToFile(dir, result.filename, result.content);
      mainWindow?.webContents.send('file:saved', {
        taskId,
        filename: result.filename,
        path: filePath,
      });
    }

    mainWindow?.webContents.send('task:status', { taskId, status: 'complete' });
  } catch (err) {
    mainWindow?.webContents.send('agent:stream', {
      taskId,
      text: `Error: ${err}`,
      done: true,
    });
    mainWindow?.webContents.send('task:status', { taskId, status: 'error' });
  }

  isProcessing = false;
  processNextTask();
}

function processNextTask() {
  if (isProcessing || taskQueue.length === 0) return;
  const next = taskQueue.shift()!;
  processTask(next.id, next.prompt);
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
  createWindow();

  // Start file watcher with persisted directory
  const config = loadConfig();
  startWatcher(config.watchDirectory);
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('directory:changed', config.watchDirectory);
  });

  // Task submission with queue
  ipcMain.on('task:submit', (_event, prompt: string) => {
    const taskId = Date.now().toString();
    if (isProcessing) {
      taskQueue.push({ id: taskId, prompt });
      mainWindow?.webContents.send('task:status', {
        taskId,
        status: 'queued',
        queueLength: taskQueue.length,
      });
    } else {
      processTask(taskId, prompt);
    }
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

  // Manual directory change
  ipcMain.on('watcher:set-directory', (_event, directory: string) => {
    startWatcher(directory);
    saveConfig({ watchDirectory: directory });
  });
});

app.on('window-all-closed', () => {
  watcher.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
