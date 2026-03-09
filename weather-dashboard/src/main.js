const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;

// Resolve paths for development vs production
const isDev = !app.isPackaged;
const getResourcePath = (relativePath) => {
  if (isDev) {
    return path.join(__dirname, '..', relativePath);
  }
  return path.join(process.resourcesPath, relativePath);
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================================
// IPC Handlers
// ============================================================

// Open file dialog for markdown selection
ipcMain.handle('dialog:openMarkdown', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Weather Report',
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  
  return { 
    canceled: false, 
    filePath: result.filePaths[0],
    fileName: path.basename(result.filePaths[0])
  };
});

// Open file dialog for CSV selection/location
ipcMain.handle('dialog:selectCSV', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Weather Reports CSV',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  
  return { 
    canceled: false, 
    filePath: result.filePaths[0]
  };
});

// Read CSV file
ipcMain.handle('file:readCSV', async (event, csvPath) => {
  try {
    if (!fs.existsSync(csvPath)) {
      return { success: false, error: 'File not found' };
    }
    const content = fs.readFileSync(csvPath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read markdown file content (for preview)
ipcMain.handle('file:readMarkdown', async (event, mdPath) => {
  try {
    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'File not found' };
    }
    const content = fs.readFileSync(mdPath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Run Python loader script
ipcMain.handle('python:runLoader', async (event, { markdownPath, csvPath, pythonPath }) => {
  return new Promise((resolve) => {
    // Determine Python script location
    let scriptPath;
    if (pythonPath && fs.existsSync(pythonPath)) {
      scriptPath = pythonPath;
    } else {
      // Look for it in resources (packaged) or parent directory (dev)
      const possiblePaths = [
        getResourcePath('python/weather_report_loader.py'),
        path.join(__dirname, '..', 'python', 'weather_report_loader.py'),
        path.join(path.dirname(csvPath), 'weather_report_loader.py'),
      ];
      scriptPath = possiblePaths.find(p => fs.existsSync(p));
    }
    
    if (!scriptPath) {
      resolve({
        success: false,
        error: 'Python loader script not found. Please ensure weather_report_loader.py is in the python/ directory.',
        stdout: '',
        stderr: ''
      });
      return;
    }

    const args = [
      scriptPath,
      markdownPath,
      '--force',
      '--yes',
      '--csv-path', csvPath
    ];

    // Try python3 first, fall back to python
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    
    const proc = spawn(pythonExecutable, args, {
      cwd: path.dirname(scriptPath)
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      // Send progress updates to renderer
      mainWindow.webContents.send('python:progress', data.toString());
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
        error: code !== 0 ? `Process exited with code ${code}` : null
      });
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to start Python: ${error.message}`,
        stdout,
        stderr
      });
    });
  });
});

// Get app paths for settings
ipcMain.handle('app:getPaths', async () => {
  return {
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    home: app.getPath('home'),
  };
});

// Save/load settings
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('settings:load', async () => {
  try {
    if (fs.existsSync(settingsPath())) {
      const content = fs.readFileSync(settingsPath(), 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return {};
});

ipcMain.handle('settings:save', async (event, settings) => {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
