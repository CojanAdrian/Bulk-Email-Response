// BulkPosting desktop: the BulkPosting website in its own window, with a
// desktop shortcut and native notifications. Everything else (loads,
// inquiries, Gmail) works exactly as on the website, against the same server.
const { app, BrowserWindow, WebContentsView, Menu, shell, ipcMain, nativeTheme, screen, clipboard } = require('electron');
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

let win = null; // the window: its own page is the title bar
let web = null; // BulkPosting, in a view below the title bar

const TITLE_BAR = 36;
const webPreferences = () => ({
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  spellcheck: true,
});

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
  if (!origin) return web.loadFile(page('setup.html'));
  return web.loadURL(origin);
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
    // A custom black title bar; Windows still draws the minimize, maximize
    // and close buttons, in the app's colours.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#a3a39e', height: TITLE_BAR },
    webPreferences: webPreferences(),
  });
  win.setMenuBarVisibility(false);
  win.loadFile(page('titlebar.html'));

  const view = new WebContentsView({ webPreferences: webPreferences() });
  view.setBackgroundColor('#000000');
  win.contentView.addChildView(view);
  web = view.webContents;

  // The view fills the window below the title bar (all of it in full screen).
  const layout = () => {
    const [width, height] = win.getContentSize();
    const top = win.isFullScreen() ? 0 : TITLE_BAR;
    view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
  };
  layout();
  for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore']) win.on(event, layout);
  if (maximized) win.maximize();

  // The title bar shows the page's title ("(16) BulkPosting": 16 waiting)
  // and dims when the window is not in front.
  const tellTitleBar = (channel, value) => {
    if (!win.isDestroyed()) win.webContents.send(channel, value);
  };
  web.on('page-title-updated', (_event, title) => {
    win.setTitle(title);
    tellTitleBar('desktop:title', title);
  });
  win.on('focus', () => tellTitleBar('desktop:focus', true));
  win.on('blur', () => tellTitleBar('desktop:focus', false));
  win.webContents.on('did-finish-load', () => tellTitleBar('desktop:title', web.getTitle() || 'BulkPosting'));
  win.on('focus', () => web.focus());

  // Save the login to disk right away (not only every so often), so
  // reopening the app finds you signed in even after a crash.
  const saveCookies = () => web.session.cookies.flushStore().catch(() => {});
  web.on('did-finish-load', saveCookies);
  web.on('did-navigate-in-page', saveCookies);
  win.on('close', saveCookies);

  // BulkPosting can tell it runs in the desktop app.
  const baseAgent = web.getUserAgent();
  web.setUserAgent(`${plainChrome(baseAgent)} BulkPostingDesktop/${app.getVersion()}`);
  web.session.webRequest.onBeforeSendHeaders({ urls: ['https://*.google.com/*', 'https://*.gstatic.com/*', 'https://*.youtube.com/*'] }, (details, callback) => {
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
  web.setWindowOpenHandler(({ url }) => {
    const origin = address();
    if (origin && isInsideApp(url, origin)) return { action: 'allow' };
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Sign-in with Google and Connect Gmail go through BulkPosting's server
  // (/api/...) and Google's sign-in pages, then come back: those stay in the
  // window. Any other site opens in the browser.
  web.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return;
    const origin = address();
    if (origin && isInsideApp(url, origin)) return;
    if (isGoogleSignIn(url) || isServerCall(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // No server: a quiet screen with Try again and Change address.
  web.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return; // -3: navigation replaced
    web.loadFile(page('offline.html'));
  });

  // Right-click: copy, paste and spelling, like a browser.
  web.on('context-menu', (_event, params) => {
    const items = [];
    for (const suggestion of params.dictionarySuggestions || []) {
      items.push({ label: suggestion, click: () => web.replaceMisspelling(suggestion) });
    }
    if (items.length) items.push({ type: 'separator' });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' });
    if (params.linkURL) items.push({ label: 'Copy link', click: () => clipboard.writeText(params.linkURL) });
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
          { label: 'Change BulkPosting address…', accelerator: 'CmdOrCtrl+Shift+A', click: () => web && web.loadFile(page('setup.html')) },
          { type: 'separator' },
          { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => web && web.reload() },
          { label: 'Reload ignoring cache', accelerator: 'CmdOrCtrl+Shift+R', click: () => web && web.reloadIgnoringCache() },
          { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => web && web.toggleDevTools() },
          { type: 'separator' },
          { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => web && web.setZoomLevel(0) },
          { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => web && web.setZoomLevel(web.getZoomLevel() + 0.5) },
          { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => web && web.setZoomLevel(web.getZoomLevel() - 0.5) },
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
ipcMain.handle('desktop:change-address', () => web.loadFile(page('setup.html')));

// One window: opening the app again brings it to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    web.focus();
  });
  app.setAppUserModelId('com.bulkposting.desktop'); // Windows notifications show "BulkPosting"
  nativeTheme.themeSource = 'dark';
  app.whenReady().then(() => {
    setMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
