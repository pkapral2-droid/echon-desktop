const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

const APP_URL = 'https://echon-voice.com';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'Echon',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#1e1f22',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Enable media features
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  // Load the web app
  mainWindow.loadURL(APP_URL);

  // Show when ready and inject custom title bar
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Inject custom draggable title bar
    mainWindow.webContents.executeJavaScript(`
      (function() {
        // Check if already injected
        if (document.getElementById('echon-titlebar')) return;
        const bar = document.createElement('div');
        bar.id = 'echon-titlebar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:32px;background:#1e1f22;display:flex;align-items:center;justify-content:space-between;z-index:99999;-webkit-app-region:drag;padding-left:12px;border-bottom:1px solid #111214;';

        // Left side — logo + name
        bar.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 48 48" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="24" r="5" fill="#4f46e5" stroke="none"/><path d="M16 14a14 14 0 0 0 0 20" opacity="0.6"/><path d="M32 14a14 14 0 0 1 0 20" opacity="0.6"/></svg><span style="color:#b5bac1;font-size:12px;font-weight:600;font-family:Inter,sans-serif;">Echon</span></div>';

        // Right side — window controls
        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;-webkit-app-region:no-drag;height:32px;';

        const btnStyle = 'width:46px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;color:#b5bac1;';

        controls.innerHTML = '<button id="echon-min" style="' + btnStyle + '"><svg width="12" height="1" viewBox="0 0 12 1"><rect width="12" height="1" fill="currentColor"/></svg></button><button id="echon-max" style="' + btnStyle + '"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg></button><button id="echon-close" style="' + btnStyle + '" onmouseover="this.style.background=\\'#ed4245\\';this.style.color=\\'white\\'" onmouseout="this.style.background=\\'transparent\\';this.style.color=\\'#b5bac1\\'"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/></svg></button>';

        bar.appendChild(controls);
        document.body.prepend(bar);

        // Add padding to body
        document.body.style.paddingTop = '32px';

        // Wire up buttons
        document.getElementById('echon-min').onclick = () => window.echonDesktop?.minimize?.();
        document.getElementById('echon-max').onclick = () => window.echonDesktop?.maximize?.();
        document.getElementById('echon-close').onclick = () => window.echonDesktop?.close?.();
      })();
    `);
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Handle media permissions (mic, camera, screen share)
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'notifications', 'display-capture'];
    callback(allowed.includes(permission));
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'notifications', 'display-capture'];
    return allowed.includes(permission);
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Echon',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Mute',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        mainWindow?.webContents.executeJavaScript(`
          window.__echonToggleMute?.();
        `);
      },
    },
    {
      label: 'Deafen',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        mainWindow?.webContents.executeJavaScript(`
          window.__echonToggleDeafen?.();
        `);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Echon',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Echon');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// Push-to-talk global shortcut
function registerPushToTalk() {
  // Default: Tilde key (~) for push-to-talk
  const PTT_KEY = '`';

  globalShortcut.register(PTT_KEY, () => {
    mainWindow?.webContents.executeJavaScript(`
      if (window.__echonPTT) window.__echonPTT(true);
    `);
  });

  // Note: globalShortcut doesn't support key-up events
  // For proper PTT, we'd need a native module like iohook
  // For now, PTT acts as a toggle
}

// Window control IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.hide());

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Auto-launch on startup (optional)
  app.setLoginItemSettings({
    openAtLogin: false,
    openAsHidden: true,
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close (tray keeps it alive)
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});

app.on('before-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
