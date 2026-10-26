'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StateStore, isTrustedSender, assetForURL, exportFilename, parseRequest, createCloseGuard } = require('../desktop/windows/services.cjs');
const state = (id) => JSON.stringify({ version: 1, papers: [], activeId: id });
function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-win-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('state is UTF-8 and the last acknowledged save survives reopening', (t) => {
  const dir = directory(t), store = new StateStore(dir);
  assert.equal(store.load(), null);
  for (const id of ['one', '题库🍊', 'last']) store.save(state(id));
  assert.equal(new StateStore(dir).load(), state('last'));
  assert.deepEqual(fs.readdirSync(dir), ['state.json']);
});

test('invalid and failed atomic writes preserve the previously saved file', (t) => {
  const dir = directory(t), store = new StateStore(dir);
  store.save(state('previous'));
  assert.throws(() => store.save('[]'));
  assert.equal(store.load(), state('previous'));
  const failingFS = Object.create(fs);
  failingFS.renameSync = () => { throw new Error('simulated disk failure'); };
  assert.throws(() => new StateStore(dir, failingFS).save(state('new')), /disk failure/);
  assert.equal(store.load(), state('previous'));
  assert.deepEqual(fs.readdirSync(dir), ['state.json']);
});

test('corrupt JSON, invalid state schema and malformed UTF-8 are preserved', (t) => {
  const dir = directory(t), file = path.join(dir, 'state.json');
  for (const bytes of [Buffer.from('{bad'), Buffer.from('{}'), Buffer.from('{"version":1,"papers":[{}]}'), Buffer.from([0xff])]) {
    fs.writeFileSync(file, bytes);
    assert.throws(() => new StateStore(dir).load());
    assert.deepEqual(fs.readFileSync(file), bytes);
  }
});

test('IPC trusts only the exact main frame at the app index', () => {
  const frame = { url: 'quiz://app/index.html' }, contents = { mainFrame: frame };
  assert.equal(isTrustedSender({ sender: contents, senderFrame: frame }, contents), true);
  frame.url += '#main';
  assert.equal(isTrustedSender({ sender: contents, senderFrame: frame }, contents), true);
  for (const url of ['https://app/index.html', 'quiz://app.evil/index.html', 'quiz://app/index.html?x=1', 'quiz://app/other', 'quiz://user@app/index.html', 'quiz://app:80/index.html', 'about:blank']) {
    frame.url = url;
    assert.equal(isTrustedSender({ sender: contents, senderFrame: frame }, contents), false, url);
  }
  frame.url = 'quiz://app/index.html';
  assert.equal(isTrustedSender({ sender: {}, senderFrame: frame }, contents), false);
  assert.equal(isTrustedSender({ sender: contents, senderFrame: { url: frame.url } }, contents), false);
});

test('protocol maps a fixed asset set and rejects alternate or traversal URLs', () => {
  assert.equal(assetForURL('quiz://app/core.js').filename, 'core.js');
  assert.equal(assetForURL('quiz://app/renderer-adapter.js').filename, 'renderer-adapter.js');
  for (const url of ['quiz://app/../main.cjs', 'quiz://app/%2e%2e/main.cjs', 'quiz://app/../app.js', 'quiz://app/app.js?x', 'quiz://app/preload.cjs', 'file:///etc/passwd', 'https://app/app.js', 'quiz://user@app/app.js', 'quiz://app:80/app.js', 'quiz://app//app.js']) assert.equal(assetForURL(url), null, url);
});

test('Windows export names cannot traverse directories or use device names', () => {
  for (const [input, expected] of [['../../题库.md', '题库.md'], ['C:\\temp\\CON.md', '_CON.md'], ['aux', '_aux'], ['LPT9.txt', '_LPT9.txt'], ['题:库?.md', '题_库_.md'], [' . ', '自测本-错题.md'], ['正常.md. ', '正常.md'], ['COM¹.txt', '_COM¹.txt']]) assert.equal(exportFilename(input), expected);
  assert.ok(exportFilename('x'.repeat(250) + '.md').length <= 120);
});

test('bridge accepts only supported typed and bounded actions', () => {
  assert.deepEqual(parseRequest({ action: 'copy', text: '中文🍊' }), { action: 'copy', text: '中文🍊' });
  assert.deepEqual(parseRequest({ action: 'export', text: 'text', filename: '../CON.md' }), { action: 'export', text: 'text', filename: '_CON.md' });
  for (const input of [null, [], {}, { action: 'shell' }, { action: 'persist', data: 1 }, { action: 'export', text: 'x', filename: 4 }, { action: 'copy', text: 'x'.repeat(32 * 1024 * 1024 + 1) }]) assert.throws(() => parseRequest(input));
});

test('close waits for flush and suppresses concurrent close requests', async () => {
  let release, closed = 0;
  const guard = createCloseGuard({ flush: () => new Promise((resolve) => { release = resolve; }), confirmDiscard: () => { throw new Error('should not prompt'); }, close: () => closed++ });
  const pending = guard();
  await guard();
  assert.equal(closed, 0);
  release();
  await pending;
  assert.equal(closed, 1);
});

test('failed flush cancels by default, and permits explicit discard on retry', async () => {
  let closed = 0, discard = false, prompts = 0;
  const guard = createCloseGuard({ flush: async () => { throw new Error('disk full'); }, confirmDiscard: async (error) => { assert.match(error.message, /disk full/); prompts++; return discard; }, close: () => closed++ });
  await guard();
  assert.equal(closed, 0);
  discard = true;
  await guard();
  assert.equal(closed, 1);
  assert.equal(prompts, 2);
});

test('hung flush times out into cancel/discard choice', async () => {
  let closed = false, reason;
  const guard = createCloseGuard({ flush: () => new Promise(() => {}), confirmDiscard: async (error) => { reason = error.message; return false; }, close: () => { closed = true; }, timeoutMs: 5 });
  await guard();
  assert.match(reason, /超时/);
  assert.equal(closed, false);
});
