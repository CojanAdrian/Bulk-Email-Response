// BulkPosting desktop: the BulkPosting website in its own window, with a
// desktop shortcut and native notifications. Everything else (loads,
// inquiries, Gmail) works exactly as on the website, against the same server.
const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { normalizeAddress, isInsideApp } = require('./address');

// A build can carry the address (BULKPOSTING_URL); otherwise the app asks
// for it once on first launch.
const BUILT_IN_ADDRESS = normalizeAddress(process.env.BULKPOSTING_URL || '');

// For testing only: keep the app's data somewhere else.
if (process.env.BULKPOSTING_USER_DATA) app.setPath('userData', process.env.BULKPOSTING_USER_DATA);

const configFile = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(change) {
  const next = { ...readConfig(), ...change };
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2));
  return next;
}

const address = () => normalizeAddress(readConfig().address) || BUILT_IN_ADDRESS;

let win = null;

const GOOGLE_SIGN_IN = /^(accounts\.google\.com|accounts\.youtube\.com|myaccount\.google\.com|ogs\.google\.com|ssl\.gstatic\.com|www\.gstatic\.com|apis\.google\.com|play\.google\.com)$/i;

function isGoogleSignIn(link) {
  try {
    return GOOGLE_SIGN_IN.test(new URL(link).hostname);
  } catch {
    return false;
  }
}

// BulkPosting's server (its address can differ from the app's).
function isServerCall(link) {
  try {
    return new URL(link).pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

// Google turns away sign-ins from apps that say they are Electron, so its
// sign-in pages see a plain Chrome identity.
function plainChrome(userAgent) {
  return userAgent.replace(/\s(Electron|BulkPostingDesktop|bulkposting-desktop|BulkPosting)\/\S+/g, '');
}

function page(name) {
  return path.join(__dirname, 'pages', name);
}

function openApp() {
  const origin = address();
  if (!origin) return win.loadFile(page('setup.html'));
  return win.loadURL(origin);
}

// The window comes back where and how big it was.
function savedBounds() {
  const { bounds } = readConfig();
  if (!bounds) return { width: 1440, height: 900 };
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return bounds.x < a.x + a.width && bounds.x + bounds.width > a.x && bounds.y < a.y + a.height && bounds.y + bounds.height > a.y;
  });
  return visible ? bounds : { width: bounds.width, height: bounds.height };
}

function createWindow() {
  const { maximized } = readConfig();
  win = new BrowserWindow({
    ...savedBounds(),
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'BulkPosting',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (maximized) win.maximize();
  win.setMenuBarVisibility(false);

  // BulkPosting can tell it runs in the desktop app.
  const baseAgent = win.webContents.getUserAgent();
  win.webContents.setUserAgent(`${plainChrome(baseAgent)} BulkPostingDesktop/${app.getVersion()}`);
  win.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['https://*.google.com/*', 'https://*.gstatic.com/*', 'https://*.youtube.com/*'] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': plainChrome(baseAgent) } });
  });

  win.once('ready-to-show', () => win.show());

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    writeConfig({ bounds: win.isMaximized() ? readConfig().bounds : win.getBounds(), maximized: win.isMaximized() });
  };
  win.on('close', remember);

  // Links to other sites (Gmail compose, Highway, Google sign-in) open in
  // your normal browser; BulkPosting's own pages stay in the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const origin = address();
    if (origin && isInsideApp(url, origin)) return { action: 'allow' };
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Sign-in with Google and Connect Gmail go through BulkPosting's server
  // (/api/...) and Google's sign-in pages, then come back: those stay in the
  // window. Any other site opens in the browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return;
    const origin = address();
    if (origin && isInsideApp(url, origin)) return;
    if (isGoogleSignIn(url) || isServerCall(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // No server: a quiet screen with Try again and Change address.
  win.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return; // -3: navigation replaced
    win.loadFile(page('offline.html'));
  });

  // Right-click: copy, paste and spelling, like a browser.
  win.webContents.on('context-menu', (_event, params) => {
    const items = [];
    for (const suggestion of params.dictionarySuggestions || []) {
      items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) });
    }
    if (items.length) items.push({ type: 'separator' });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' });
    if (params.linkURL) items.push({ label: 'Copy link', click: () => require('electron').clipboard.writeText(params.linkURL) });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  openApp();
}

// Keyboard shortcuts (the menu itself stays hidden).
function setMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'BulkPosting',
        submenu: [
          { label: 'Change BulkPosting address…', accelerator: 'CmdOrCtrl+Shift+A', click: () => win && win.loadFile(page('setup.html')) },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
    ])
  );
}

ipcMain.on('desktop:version', (event) => {
  event.returnValue = app.getVersion();
});
ipcMain.handle('desktop:address', () => address());
ipcMain.handle('desktop:set-address', (_event, input) => {
  const origin = normalizeAddress(input);
  if (!origin) return { error: 'That does not look like a web address.' };
  writeConfig({ address: origin });
  openApp();
  return { ok: true, address: origin };
});
ipcMain.handle('desktop:retry', () => openApp());
ipcMain.handle('desktop:change-address', () => win.loadFile(page('setup.html')));

// One window: opening the app again brings it to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.setAppUserModelId('com.bulkposting.desktop'); // Windows notifications show "BulkPosting"
  nativeTheme.themeSource = 'dark';
  app.whenReady().then(() => {
    setMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
