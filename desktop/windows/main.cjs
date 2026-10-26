'use strict';
const { app, BrowserWindow, ipcMain, protocol, session, dialog, clipboard, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { StateStore, INDEX_URL, isTrustedSender, assetForURL, parseRequest, createCloseGuard } = require('./services.cjs');

app.setName('QuizNotebook');
const explicitDataDirectory = app.commandLine.getSwitchValue('user-data-dir');
const dataDirectory = explicitDataDirectory ? path.resolve(explicitDataDirectory) : path.join(app.getPath('appData'), 'QuizNotebook');
let profileError;
try {
  fs.mkdirSync(dataDirectory, { recursive: true });
  app.setPath('userData', dataDirectory);
} catch (error) { profileError = error; }
protocol.registerSchemesAsPrivileged([{ scheme: 'quiz', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'";
let mainWindow;
let closingAllowed = false;

if (profileError) {
  app.whenReady().then(() => {
    dialog.showErrorBox('无法创建本机存储', `${dataDirectory}\n\n${profileError.message}\n请检查磁盘空间与文件夹权限后重新打开。`);
    app.quit();
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(start).catch((error) => {
    dialog.showErrorBox('无法启动自测本', `${error.message}\n请重新解压完整程序文件夹后再试。`);
    app.quit();
  });
}

async function start() {
  const store = new StateStore(dataDirectory);
  let initialState;
  try { initialState = store.load(); }
  catch (error) {
    dialog.showErrorBox('无法读取本机记录', `原记录没有改动：\n${store.file}\n\n${error.message}\n\n请先复制此文件备份，再检查磁盘空间和文件权限。若记录已损坏，可将 state.json 改名为 state.backup.json 后重新打开程序，并重新导入原试卷。`);
    app.quit();
    return;
  }
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !assetForURL(details.url) }));
  ses.on('will-download', (event) => event.preventDefault());
  protocol.handle('quiz', async (request) => {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const asset = assetForURL(request.url);
    if (!asset) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.promises.readFile(path.join(__dirname, 'web', asset.filename));
      return new Response(body, { headers: { 'Content-Type': asset.contentType, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
    } catch (_) { return new Response('Application asset missing', { status: 404 }); }
  });
  Menu.setApplicationMenu(null);
  const icon = path.join(__dirname, 'icon.ico');
  mainWindow = new BrowserWindow({
    title: '自测本', width: 1280, height: 860, minWidth: 760, minHeight: 560,
    backgroundColor: '#f8f7f3', show: false,
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false }
  });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // This single-page app never needs a new document; hash anchors still work.
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('will-frame-navigate', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  // Reload can throw away unsaved state without the close/flush handshake.
  contents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) event.preventDefault();
  });
  ipcMain.on('quiz:bootstrap', (event) => {
    event.returnValue = isTrustedSender(event, contents) ? { initialState } : { error: '已阻止不可信的桌面请求。' };
  });
  ipcMain.handle('quiz:request', async (event, message) => {
    if (!isTrustedSender(event, contents)) throw new Error('已阻止不可信的桌面请求。');
    const request = parseRequest(message);
    if (request.action === 'persist') {
      store.save(request.data);
      initialState = request.data;
      return { saved: true };
    }
    if (request.action === 'copy') {
      clipboard.writeText(request.text);
      return { copied: true };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出错题 Markdown', defaultPath: request.filename,
      filters: [{ name: 'Markdown 文档', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, request.text, 'utf8');
    return { saved: true };
  });
  const close = createCloseGuard({
    flush: () => contents.executeJavaScript("(async () => { if (!window.QuizDesktop || typeof window.QuizDesktop.flush !== 'function') throw new Error('页面尚未就绪，无法确认保存状态。'); await window.QuizDesktop.flush(); return true; })()"),
    confirmDiscard: async (error) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: '本次作答可能尚未保存',
        message: '保留窗口以继续保存，还是放弃未保存的更改？',
        detail: `${error.message}\n取消关闭可保留当前作答；请检查磁盘空间和文件权限，或先导出错题。`,
        buttons: ['取消关闭', '放弃更改并退出'], defaultId: 0, cancelId: 0, noLink: true
      });
      return result.response === 1;
    },
    close: () => { closingAllowed = true; mainWindow.destroy(); }
  });
  mainWindow.on('close', (event) => { if (!closingAllowed) { event.preventDefault(); void close(); } });
  await mainWindow.loadURL(INDEX_URL);
  mainWindow.show();
}
