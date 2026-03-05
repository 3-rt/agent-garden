import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { ClaudeService } from './services/claude';

let mainWindow: BrowserWindow | null = null;
const claude = new ClaudeService();

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

  ipcMain.on('task:submit', async (event, prompt: string) => {
    const taskId = Date.now().toString();

    try {
      await claude.streamTask(prompt, (text, done) => {
        mainWindow?.webContents.send('agent:stream', { taskId, text, done });
      });
    } catch (err) {
      mainWindow?.webContents.send('agent:stream', {
        taskId,
        text: `Error: ${err}`,
        done: true,
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
