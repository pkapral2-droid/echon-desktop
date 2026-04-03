const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, shell, desktopCapturer, session } = require('electron');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let tray = null;

const APP_URL = 'https://echon-voice.com';
const isMac = process.platform === 'darwin';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'Echon',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0d0f1a',
    // macOS: native titlebar with hidden inset (traffic lights). Windows: frameless custom titlebar.
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // Keep renderer active when unfocused (needed for PTT + voice)
      // Enable media features
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  // Load the web app
  mainWindow.loadURL(APP_URL);

  const INJECT_CSS = isMac ? `
    div[style*="position: fixed"][style*="gradient"]{display:none!important;}
    html, body { height: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
    #root { height: 100% !important; overflow: hidden !important; }
    #root > div { height: 100% !important; max-height: 100% !important; }
    body { overflow: hidden !important; }
    ::-webkit-scrollbar { width: 0px !important; height: 0px !important; display: none !important; }
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  ` : `
    div[style*="position: fixed"][style*="gradient"]{display:none!important;}
    html, body { height: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
    #root { height: calc(100% - 32px) !important; overflow: hidden !important; }
    #root > div { height: 100% !important; max-height: 100% !important; }
    body { overflow: hidden !important; }
    ::-webkit-scrollbar { width: 0px !important; height: 0px !important; display: none !important; }
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  `;

  // macOS uses native titlebar — no custom titlebar injection needed
  const INJECT_JS = isMac ? `(function(){})();` : `
    (function() {
      if (document.getElementById('echon-titlebar')) return;
      const bar = document.createElement('div');
      bar.id = 'echon-titlebar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:32px;background:var(--echon-bg-darker, #0d0f1a);display:flex;align-items:center;justify-content:space-between;z-index:99999;-webkit-app-region:drag;padding-left:12px;border-bottom:1px solid var(--echon-border, #0f1220);';
      bar.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 48 48" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="24" r="5" fill="#4f46e5" stroke="none"/><path d="M16 14a14 14 0 0 0 0 20" opacity="0.6"/><path d="M32 14a14 14 0 0 1 0 20" opacity="0.6"/></svg><span style="color:#b5bac1;font-size:12px;font-weight:600;font-family:Inter,sans-serif;">Echon</span></div>';
      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;-webkit-app-region:no-drag;height:32px;';
      const btnStyle = 'width:46px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;color:#b5bac1;';
      controls.innerHTML = '<button id="echon-min" style="' + btnStyle + '"><svg width="12" height="1" viewBox="0 0 12 1"><rect width="12" height="1" fill="currentColor"/></svg></button><button id="echon-max" style="' + btnStyle + '"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg></button><button id="echon-close" style="' + btnStyle + '" onmouseover="this.style.background=\\'#ed4245\\';this.style.color=\\'white\\'" onmouseout="this.style.background=\\'transparent\\';this.style.color=\\'#b5bac1\\'"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/></svg></button>';
      bar.appendChild(controls);
      document.body.prepend(bar);
      document.body.style.paddingTop = '0';
      document.body.style.marginTop = '0';
      const root = document.getElementById('root');
      if (root) { root.style.marginTop = '32px'; root.style.height = 'calc(100vh - 32px)'; root.style.overflow = 'hidden'; }
      // Allow scrolling on standalone pages (privacy, terms, landing)
      const enableScrollForStandalonePages = () => {
        const path = window.location.pathname;
        const standalone = ['\/privacy', '\/terms', '\/\$'].some(p => new RegExp(p).test(path));
        if (root) root.style.overflow = standalone ? 'auto' : 'hidden';
        document.body.style.overflow = standalone ? 'auto' : 'hidden';
      };
      enableScrollForStandalonePages();
      window.addEventListener('popstate', enableScrollForStandalonePages);
      document.getElementById('echon-min').onclick = () => window.echonDesktop?.minimize?.();
      document.getElementById('echon-max').onclick = () => window.echonDesktop?.maximize?.();
      document.getElementById('echon-close').onclick = () => window.echonDesktop?.close?.();
    })();
  `;

  function injectCustomizations() {
    mainWindow.webContents.insertCSS(INJECT_CSS);
    mainWindow.webContents.executeJavaScript(INJECT_JS);
    // Load saved PTT key from localStorage
    mainWindow.webContents.executeJavaScript(`
      try {
        const s = JSON.parse(localStorage.getItem('echon_audio_settings'));
        if (s?.pttKeyCode) window.echonDesktop?.setPttKey?.(s.pttKeyCode);
      } catch {}
    `).catch(() => {});
    // Log PTT status to renderer console (page is loaded at this point)
    mainWindow.webContents.executeJavaScript(
      `console.log('[PTT] status — pttKeycode: ${pttKeycode}, pttMouseBtn: ${pttMouseBtn}')`
    ).catch(() => {});
  }

  // Inject on first load
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    injectCustomizations();
  });

  // Re-inject on every page load (refresh, navigation)
  mainWindow.webContents.on('did-finish-load', () => {
    injectCustomizations();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Close behavior: macOS = quit on Cmd+Q, hide on red button. Windows = minimize to tray.
  mainWindow.on('close', (e) => {
    if (app.isQuitting) return; // Let it close
    if (isMac) {
      // On macOS, Cmd+Q sets app.isQuitting via before-quit. Red button just hides.
      e.preventDefault();
      mainWindow.hide();
    } else {
      // On Windows/Linux, minimize to tray
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Handle media permissions — only grant to echon-voice.com
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    if (url.includes('echon-voice.com')) {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    const url = webContents.getURL();
    return url.includes('echon-voice.com');
  });

  // Lock navigation to echon-voice.com only
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.includes('echon-voice.com')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Block creation of unexpected new windows/webContents
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    // Only the screen picker should create child windows — it's always modal + parented
    if (!childWindow.getParentWindow()) {
      childWindow.close();
    }
  });

  // Enable screen sharing in Electron — show source picker
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      });
      if (sources.length === 0) { callback({ video: null }); return; }

      // Build picker data
      const sourceData = sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      }));

      // Create picker window (secure: uses preload instead of nodeIntegration)
      const picker = new BrowserWindow({
        width: 680,
        height: 500,
        parent: mainWindow,
        modal: true,
        frame: false,
        resizable: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(__dirname, 'preload-picker.js'),
        },
        backgroundColor: '#1e1f22',
      });

      const pickerHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1f22; color: #dbdee1; font-family: Inter, sans-serif; padding: 20px; overflow-y: auto; }
  h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: white; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .source { cursor: pointer; border-radius: 8px; border: 2px solid transparent; overflow: hidden; transition: all 0.15s; background: #2b2d31; }
  .source:hover { border-color: #4f46e5; transform: scale(1.02); }
  .source img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .source .name { padding: 8px; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #b5bac1; }
  .btns { display: flex; justify-content: flex-end; margin-top: 16px; gap: 8px; }
  .btn { padding: 8px 20px; border-radius: 4px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-cancel { background: #4f545c; color: white; }
  .btn-cancel:hover { background: #5d6269; }
</style></head><body>
  <h2>Choose what to share</h2>
  <div class="grid" id="grid"></div>
  <div class="btns"><button class="btn btn-cancel" onclick="cancel()">Cancel</button></div>
  <script>
    const sources = ${JSON.stringify(sourceData)};
    const grid = document.getElementById('grid');
    sources.forEach(s => {
      const div = document.createElement('div');
      div.className = 'source';
      div.innerHTML = '<img src="' + s.thumbnail + '"><div class="name">' + s.name.replace(/</g,'&lt;') + '</div>';
      div.onclick = () => window.picker.selectSource(s.id);
      grid.appendChild(div);
    });
    function cancel() { window.picker.selectSource(null); }
  </script>
</body></html>`;

      picker.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pickerHTML));

      ipcMain.once('screen-picker-select', (_, sourceId) => {
        picker.close();
        if (!sourceId) { callback({ video: null }); return; }
        const selected = sources.find(s => s.id === sourceId);
        if (selected) {
          callback({ video: selected, audio: 'loopback' });
        } else {
          callback({ video: null });
        }
      });

      picker.on('closed', () => {
        ipcMain.removeAllListeners('screen-picker-select');
      });
    } catch (err) {
      console.error('Screen picker failed:', err);
      callback({ video: null });
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  if (isMac) icon.setTemplateImage(true); // macOS: auto-adapts to light/dark menu bar
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

// Push-to-talk with global input detection (works even when app is not focused)
// Uses uiohook-napi which supports BOTH keyboard keys and mouse buttons globally.

// Map JS event.code → uiohook keycode
const JS_CODE_TO_UIOHOOK = {
  // Letters
  KeyA: UiohookKey.A, KeyB: UiohookKey.B, KeyC: UiohookKey.C, KeyD: UiohookKey.D,
  KeyE: UiohookKey.E, KeyF: UiohookKey.F, KeyG: UiohookKey.G, KeyH: UiohookKey.H,
  KeyI: UiohookKey.I, KeyJ: UiohookKey.J, KeyK: UiohookKey.K, KeyL: UiohookKey.L,
  KeyM: UiohookKey.M, KeyN: UiohookKey.N, KeyO: UiohookKey.O, KeyP: UiohookKey.P,
  KeyQ: UiohookKey.Q, KeyR: UiohookKey.R, KeyS: UiohookKey.S, KeyT: UiohookKey.T,
  KeyU: UiohookKey.U, KeyV: UiohookKey.V, KeyW: UiohookKey.W, KeyX: UiohookKey.X,
  KeyY: UiohookKey.Y, KeyZ: UiohookKey.Z,
  // Numbers
  Digit0: UiohookKey[0], Digit1: UiohookKey[1], Digit2: UiohookKey[2],
  Digit3: UiohookKey[3], Digit4: UiohookKey[4], Digit5: UiohookKey[5],
  Digit6: UiohookKey[6], Digit7: UiohookKey[7], Digit8: UiohookKey[8], Digit9: UiohookKey[9],
  // Function keys
  F1: UiohookKey.F1, F2: UiohookKey.F2, F3: UiohookKey.F3, F4: UiohookKey.F4,
  F5: UiohookKey.F5, F6: UiohookKey.F6, F7: UiohookKey.F7, F8: UiohookKey.F8,
  F9: UiohookKey.F9, F10: UiohookKey.F10, F11: UiohookKey.F11, F12: UiohookKey.F12,
  // Modifiers
  ShiftLeft: UiohookKey.Shift, ShiftRight: UiohookKey.ShiftRight,
  ControlLeft: UiohookKey.Ctrl, ControlRight: UiohookKey.CtrlRight,
  AltLeft: UiohookKey.Alt, AltRight: UiohookKey.AltRight,
  MetaLeft: UiohookKey.Meta, MetaRight: UiohookKey.MetaRight,
  // Special keys
  Backquote: UiohookKey.Backquote, Space: UiohookKey.Space,
  Tab: UiohookKey.Tab, CapsLock: UiohookKey.CapsLock, Escape: UiohookKey.Escape,
  Enter: UiohookKey.Enter, Backspace: UiohookKey.Backspace,
  Delete: UiohookKey.Delete, Insert: UiohookKey.Insert,
  Home: UiohookKey.Home, End: UiohookKey.End,
  PageUp: UiohookKey.PageUp, PageDown: UiohookKey.PageDown,
  // Arrow keys
  ArrowUp: UiohookKey.ArrowUp, ArrowDown: UiohookKey.ArrowDown,
  ArrowLeft: UiohookKey.ArrowLeft, ArrowRight: UiohookKey.ArrowRight,
  // Numpad
  Numpad0: UiohookKey.Numpad0, Numpad1: UiohookKey.Numpad1, Numpad2: UiohookKey.Numpad2,
  Numpad3: UiohookKey.Numpad3, Numpad4: UiohookKey.Numpad4, Numpad5: UiohookKey.Numpad5,
  Numpad6: UiohookKey.Numpad6, Numpad7: UiohookKey.Numpad7, Numpad8: UiohookKey.Numpad8,
  Numpad9: UiohookKey.Numpad9,
  NumpadMultiply: UiohookKey.NumpadMultiply, NumpadAdd: UiohookKey.NumpadAdd,
  NumpadSubtract: UiohookKey.NumpadSubtract, NumpadDecimal: UiohookKey.NumpadDecimal,
  NumpadDivide: UiohookKey.NumpadDivide, NumpadEnter: UiohookKey.NumpadEnter,
  NumLock: UiohookKey.NumLock, ScrollLock: UiohookKey.ScrollLock,
  PrintScreen: UiohookKey.PrintScreen,
};

// Map "mouseN" (browser e.button) → uiohook mouse button number
// Browser: 0=left, 1=middle, 2=right, 3=back(X1), 4=forward(X2)
// uiohook: 1=left, 2=right, 3=middle, 4=back(X1), 5=forward(X2)
const MOUSE_TO_UIOHOOK = {
  mouse0: 1, mouse1: 3, mouse2: 2, mouse3: 4, mouse4: 5,
};

let pttKeycode = UiohookKey.Backquote; // default: backtick (keyboard)
let pttMouseBtn = null;                 // null = keyboard mode; number = mouse mode
let pttActive = false;

function rendererLog(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  mainWindow?.webContents.executeJavaScript(`console.log(${JSON.stringify(msg)})`).catch(() => {});
}

function firePTT(pressed) {
  mainWindow?.webContents.executeJavaScript(
    `if (window.__echonPTT) window.__echonPTT(${pressed});`
  ).catch(() => {});
}

function registerPushToTalk() {
  try {
    uIOhook.on('keydown', (e) => {
      if (pttMouseBtn !== null) return;
      if (e.keycode === pttKeycode && !pttActive) {
        pttActive = true;
        firePTT(true);
      }
    });

    uIOhook.on('keyup', (e) => {
      if (pttMouseBtn !== null) return;
      if (e.keycode === pttKeycode && pttActive) {
        pttActive = false;
        firePTT(false);
      }
    });

    uIOhook.on('mousedown', (e) => {
      rendererLog('[PTT] mousedown button:', e.button, '| pttMouseBtn:', pttMouseBtn);
      if (pttMouseBtn === null) return;
      if (e.button === pttMouseBtn && !pttActive) {
        pttActive = true;
        firePTT(true);
      }
    });

    uIOhook.on('mouseup', (e) => {
      if (pttMouseBtn === null) return;
      if (e.button === pttMouseBtn && pttActive) {
        pttActive = false;
        firePTT(false);
      }
    });

    uIOhook.start();
    rendererLog('[PTT] uiohook started successfully');
  } catch (err) {
    rendererLog('[PTT] Failed to start uiohook:', String(err));
  }
}

// IPC to update PTT binding from settings UI (called on page load + when user changes setting)
ipcMain.on('set-ptt-key', (_, jsKeyCode) => {
  pttActive = false; // reset any stuck state when binding changes
  if (jsKeyCode && jsKeyCode.startsWith('mouse')) {
    pttMouseBtn = MOUSE_TO_UIOHOOK[jsKeyCode] ?? null;
    pttKeycode = null;
  } else {
    pttKeycode = JS_CODE_TO_UIOHOOK[jsKeyCode] ?? UiohookKey.Backquote;
    pttMouseBtn = null;
  }
});

// Window control IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.hide());
ipcMain.on('window-fullscreen', (_, on) => mainWindow?.setFullScreen(!!on));
ipcMain.handle('window-is-fullscreen', () => mainWindow?.isFullScreen() || false);
ipcMain.on('restart-for-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

// High-fps screen capture picker — returns sourceId for getUserMedia path
ipcMain.handle('show-screen-picker', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    });
    if (sources.length === 0) return null;

    const sourceData = sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));

    const picker = new BrowserWindow({
      width: 680,
      height: 500,
      parent: mainWindow,
      modal: true,
      frame: false,
      resizable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload-picker.js'),
      },
      backgroundColor: '#1e1f22',
    });

    const pickerHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1f22; color: #dbdee1; font-family: Inter, sans-serif; padding: 20px; overflow-y: auto; }
  h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: white; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .source { cursor: pointer; border-radius: 8px; border: 2px solid transparent; overflow: hidden; transition: all 0.15s; background: #2b2d31; }
  .source:hover { border-color: #4f46e5; transform: scale(1.02); }
  .source img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .source .name { padding: 8px; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #b5bac1; }
  .btns { display: flex; justify-content: flex-end; margin-top: 16px; gap: 8px; }
  .btn { padding: 8px 20px; border-radius: 4px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-cancel { background: #4f545c; color: white; }
  .btn-cancel:hover { background: #5d6269; }
</style></head><body>
  <h2>Choose what to share</h2>
  <div class="grid" id="grid"></div>
  <div class="btns"><button class="btn btn-cancel" onclick="cancel()">Cancel</button></div>
  <script>
    const sources = ${JSON.stringify(sourceData)};
    const grid = document.getElementById('grid');
    sources.forEach(s => {
      const div = document.createElement('div');
      div.className = 'source';
      div.innerHTML = '<img src="' + s.thumbnail + '"><div class="name">' + s.name.replace(/</g,'&lt;') + '</div>';
      div.onclick = () => window.picker.selectSource(s.id);
      grid.appendChild(div);
    });
    function cancel() { window.picker.selectSource(null); }
  </script>
</body></html>`;

    picker.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pickerHTML));

    return new Promise((resolve) => {
      const onSelect = (_, sourceId) => {
        picker.close();
        resolve(sourceId || null);
      };
      ipcMain.once('screen-picker-select', onSelect);
      picker.on('closed', () => {
        ipcMain.removeListener('screen-picker-select', onSelect);
        resolve(null);
      });
    });
  } catch (err) {
    console.error('Screen picker failed:', err);
    return null;
  }
});

app.whenReady().then(async () => {
  // Clear all caches so desktop always loads the latest web version
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({
    storages: ['cachestorage', 'serviceworkers'],
  });

  createWindow();
  createTray();
  registerPushToTalk();

  // Auto-update — check GitHub releases on launch + every 15 minutes
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 15 * 60 * 1000); // Check every 15 minutes

  // When update is downloaded, signal the web app's update button
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.executeJavaScript('window.__echonDesktopUpdateReady = true;').catch(() => {});
  });

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
  app.isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch {}
  try { uIOhook.stop(); } catch {}
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
