'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const directory = path.resolve(__dirname, '../desktop/windows');

function run(file, globals) { vm.runInNewContext(fs.readFileSync(path.join(directory, file), 'utf8'), globals, { filename: file }); }

test('sandbox preload exposes only initial state and request; adapter remains mutable for app flush', async () => {
  let exposed, requests = [];
  run('preload.cjs', { require: (module) => {
    assert.equal(module, 'electron');
    return { contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'QuizNative'); exposed = Object.freeze(value); } }, ipcRenderer: {
      sendSync: (channel) => { assert.equal(channel, 'quiz:bootstrap'); return { initialState: '{"version":1,"papers":[]}' }; },
      invoke: async (channel, payload) => { assert.equal(channel, 'quiz:request'); requests.push(payload); return { copied: true }; }
    } };
  } });
  assert.deepEqual(Object.keys(exposed).sort(), ['initialState', 'request']);
  const window = { QuizNative: exposed };
  run('renderer-adapter.js', { window });
  assert.equal(window.QuizDesktop.initialState, '{"version":1,"papers":[]}');
  window.QuizDesktop.flush = async () => true;
  assert.equal(await window.QuizDesktop.flush(), true);
  assert.equal((await window.QuizDesktop.request({ action: 'copy', text: '中文' })).copied, true);
  assert.equal(requests[0].text, '中文');
});

async function harness(t, initialBytes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-electron-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const dataDir = path.join(root, 'QuizNotebook');
  fs.mkdirSync(path.join(root, 'web'));
  fs.copyFileSync(path.join(directory, '../../index.html'), path.join(root, 'web/index.html'));
  if (initialBytes !== undefined) { fs.mkdirSync(dataDir); fs.writeFileSync(path.join(dataDir, 'state.json'), initialBytes); }
  const app = new EventEmitter();
  Object.assign(app, { commandLine: { getSwitchValue: () => '' }, setName() {}, getPath: () => root, setPath(_name, target) { if (!fs.statSync(target).isDirectory()) throw new Error('Profile directory missing'); }, requestSingleInstanceLock: () => true, whenReady: async () => {}, quit: () => { app.didQuit = true; } });
  const ipcMain = new EventEmitter();
  ipcMain.handle = (channel, handler) => { ipcMain[channel] = handler; };
  const ses = new EventEmitter();
  Object.assign(ses, { setPermissionRequestHandler: (handler) => { ses.permissions = handler; }, setPermissionCheckHandler: (handler) => { ses.check = handler; }, webRequest: { onBeforeRequest: (...args) => { ses.filter = args.at(-1); } } });
  let win;
  class BrowserWindow extends EventEmitter {
    constructor(options) { super(); win = this; this.options = options; const wc = new EventEmitter(); this.webContents = wc; wc.mainFrame = { url: 'quiz://app/index.html' }; wc.setWindowOpenHandler = (handler) => { wc.newWindow = handler; }; wc.executeJavaScript = async () => true; wc.session = ses; }
    async loadURL(url) { this.url = url; }
    show() {} focus() {} isMinimized() { return false; } isDestroyed() { return false; }
    destroy() { this.destroyed = true; }
    removeMenu() {}
  }
  const protocol = { registerSchemesAsPrivileged(schemes) { this.schemes = schemes; }, handle(name, handler) { this[name] = handler; } };
  const dialog = { showErrorBox: (...args) => { dialog.error = args; }, showMessageBox: async () => ({ response: 0 }), showSaveDialog: async () => ({ canceled: true }) };
  const clipboard = { writeText: (text) => { clipboard.value = text; } };
  const electron = { app, BrowserWindow, ipcMain, protocol, session: { defaultSession: ses }, dialog, clipboard, Menu: { setApplicationMenu() {} } };
  run('main.cjs', { require: (name) => name === 'electron' ? electron : require(name.startsWith('./') ? path.join(directory, name) : name), __dirname: root, process, console, Buffer, Response, setTimeout, clearTimeout });
  await new Promise((resolve) => setImmediate(resolve));
  return { app, ipcMain, ses, win, protocol, dialog, clipboard, root, dataDir };
}

test('main uses isolated sandbox, denies remote navigation and untrusted IPC', async (t) => {
  const h = await harness(t);
  assert.equal(h.win.url, 'quiz://app/index.html');
  assert.equal(h.win.options.webPreferences.sandbox, true);
  assert.equal(h.win.options.webPreferences.contextIsolation, true);
  assert.equal(h.win.options.webPreferences.nodeIntegration, false);
  assert.equal(h.win.webContents.newWindow({ url: 'https://example.com' }).action, 'deny');
  let prevented = false;
  h.win.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, 'https://example.com');
  assert.equal(prevented, true);
  prevented = false;
  h.win.webContents.emit('will-frame-navigate', { url: 'quiz://app/index.html', isMainFrame: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'document reload must not bypass save/close');
  assert.equal(h.ses.check(), false);
  let permitted;
  h.ses.permissions(null, 'camera', (allow) => { permitted = allow; });
  assert.equal(permitted, false);
  let blocked;
  h.ses.filter({ url: 'https://example.com' }, (result) => { blocked = result.cancel; });
  assert.equal(blocked, true);
  await assert.rejects(h.ipcMain['quiz:request']({ sender: {}, senderFrame: {} }, { action: 'copy', text: 'bad' }));
  const unauthorizedBootstrap = { sender: {}, senderFrame: {} };
  h.ipcMain.emit('quiz:bootstrap', unauthorizedBootstrap);
  assert.ok(unauthorizedBootstrap.returnValue.error);
});

test('real handlers persist and acknowledge, copy text, and honor export cancel', async (t) => {
  const h = await harness(t), event = { sender: h.win.webContents, senderFrame: h.win.webContents.mainFrame };
  h.ipcMain.emit('quiz:bootstrap', event);
  assert.equal(event.returnValue.initialState, null);
  const request = h.ipcMain['quiz:request'];
  const data = '{"version":1,"papers":[],"activeId":null}';
  assert.equal((await request(event, { action: 'persist', data })).saved, true);
  assert.equal(fs.readFileSync(path.join(h.dataDir, 'state.json'), 'utf8'), data);
  assert.equal((await request(event, { action: 'copy', text: '中文🍊' })).copied, true);
  assert.equal(h.clipboard.value, '中文🍊');
  assert.equal((await request(event, { action: 'export', text: 'markdown', filename: '题库.md' })).saved, false);
  const exportPath = path.join(h.root, 'out.md');
  h.dialog.showSaveDialog = async (_win, options) => { assert.match(options.defaultPath, /_CON\.md$/); return { canceled: false, filePath: exportPath }; };
  assert.equal((await request(event, { action: 'export', text: '# 中文🍊', filename: 'CON.md' })).saved, true);
  assert.equal(fs.readFileSync(exportPath, 'utf8'), '# 中文🍊');
});

test('protocol rejects nonallowlisted assets, non-GET methods and provides CSP', async (t) => {
  const h = await harness(t);
  assert.equal((await h.protocol.quiz({ url: 'quiz://app/preload.cjs', method: 'GET' })).status, 404);
  assert.equal((await h.protocol.quiz({ url: 'quiz://app/index.html', method: 'POST' })).status, 405);
  const response = await h.protocol.quiz({ url: 'quiz://app/index.html', method: 'GET' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /自测本/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('corrupt startup state quits with recovery path while preserving original bytes', async (t) => {
  const h = await harness(t, '{broken');
  assert.equal(h.app.didQuit, true);
  assert.equal(h.win, undefined);
  assert.match(h.dialog.error[1], /state\.json/);
  assert.equal(fs.readFileSync(path.join(h.dataDir, 'state.json'), 'utf8'), '{broken');
});
