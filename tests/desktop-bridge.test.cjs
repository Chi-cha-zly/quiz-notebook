const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../core.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(result = false) {
  return JSON.stringify({ version: 1, activeId: 'paper-1', papers: [{
    id: 'paper-1', title: '中文试卷', questions: [{ id: 'q1', type: 'single', stem: '哪个是语言？', options: [{ key: 'A', text: 'Python' }, { key: 'B', text: '数据库' }], answer: ['A'], explanation: 'Python 是语言。' }],
    answers: { q1: ['B'] }, history: [], result: result ? {} : null
  }] });
}
// Exercise the actual app event handlers. Only DOM, browser services, and the
// external native bridge are replaced; parser, grading, and app logic run as shipped.
function launch({ desktop = true, initialState = fixture(), browserState = null, request } = {}) {
  const nodes = new Map(), events = {}, calls = [], writes = [], downloads = [], clipboard = [];
  let reads = 0;
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: '', innerHTML: '', hidden: true, style: {}, dataset: {},
      setAttribute() {}, focus() {}, querySelectorAll: () => inputs, append() {}, click() {}, remove() {}, select() {} });
    return nodes.get(selector);
  }
  let inputs = [];
  const document = { querySelector: node, addEventListener: (type, handler) => { events[type] = handler; }, body: node('body'),
    createElement: tag => ({ style: {}, remove() {}, select() {}, click() { if (tag === 'a') downloads.push(this.download); } }) };
  const window = { QuizCore: Core, scrollTo() {}, crypto: { randomUUID: () => 'created-paper' } };
  if (desktop) window.QuizDesktop = { initialState, request(message) { calls.push(message); return request ? request(message) : Promise.resolve({ saved: true, copied: true }); } };
  vm.runInNewContext(source, { window, document, localStorage: { getItem() { reads++; return browserState; }, setItem(key, data) { writes.push(JSON.parse(data)); } }, navigator: { clipboard: { async writeText(text) { clipboard.push(text); } } }, Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout() {} });
  return { window, node, calls, writes, downloads, clipboard, get reads() { return reads; },
    click(action) { events.click({ target: { closest: () => ({ dataset: { action } }) } }); },
    answer(value) { inputs = [{ dataset: { question: 'q1' }, value, checked: true }]; events.change({ target: inputs[0] }); }
  };
}

test('desktop restores native Unicode draft without reading browser storage', () => {
  const app = launch();
  assert.match(app.node('#main').innerHTML, /中文试卷/);
  assert.match(app.node('#main').innerHTML, /value="B" checked/);
  assert.equal(app.reads, 0);
  assert.match(app.node('.sidebar-footer').innerHTML, /本机/);
});

test('empty desktop store does not import browser records; corrupt native data warns', () => {
  const empty = launch({ initialState: null, browserState: fixture() });
  assert.equal(empty.node('#paper-count').textContent, 0);
  assert.match(empty.node('#main').innerHTML, /本机/);
  const corrupt = launch({ initialState: '{broken' });
  assert.equal(corrupt.node('#storage-warning').hidden, false);
  assert.doesNotMatch(corrupt.node('#storage-warning').textContent, /浏览器/);
});

test('each answer sends an immediate immutable snapshot; stale success cannot hide latest failure', async () => {
  const pending = [];
  const app = launch({ request: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  app.answer('A'); app.answer('B');
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[0].action, 'persist');
  assert.deepEqual(JSON.parse(app.calls[0].data).papers[0].answers.q1, ['A']);
  assert.deepEqual(JSON.parse(app.calls[1].data).papers[0].answers.q1, ['B']);
  assert.match(app.node('#save-label').textContent, /保存中/);
  pending[1].reject(new Error('磁盘已满')); await tick();
  pending[0].resolve({ saved: true }); await tick();
  assert.match(app.node('#save-label').textContent, /未保存/);
  assert.equal(app.node('#storage-warning').hidden, false);
  assert.match(app.node('#storage-warning').textContent, /磁盘已满/);
  await assert.rejects(app.window.QuizDesktop.flush(), /磁盘已满/);
  assert.equal(app.writes.length, 0);
});

test('flush waits for all acknowledgments and a later save recovers an earlier error', async () => {
  const pending = [];
  const app = launch({ request: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  app.answer('A');
  let flushed = false;
  const firstFlush = app.window.QuizDesktop.flush().then(() => { flushed = true; });
  await tick(); assert.equal(flushed, false);
  pending[0].resolve({ saved: true }); await firstFlush;
  assert.match(app.node('#save-label').textContent, /已保存/);
  app.answer('B'); pending[1].reject(new Error('只读')); await tick();
  app.answer('A'); pending[2].resolve({ saved: true }); await app.window.QuizDesktop.flush();
  assert.equal(app.node('#storage-warning').hidden, true);
  assert.match(app.node('#save-label').textContent, /已保存/);
});

test('invalid native save acknowledgment is an unsaved state', async () => {
  const app = launch({ request: async () => ({ saved: false }) });
  app.answer('A'); await tick();
  assert.match(app.node('#save-label').textContent, /未保存/);
  await assert.rejects(app.window.QuizDesktop.flush());
});

for (const action of ['export', 'template']) {
  for (const outcome of ['saved', 'cancelled', 'failed']) {
    test(`${action} awaits native ${outcome} outcome and reports truthfully`, async () => {
      let finish;
      const app = launch({ initialState: fixture(true), request: () => new Promise((resolve, reject) => { finish = outcome === 'failed' ? () => reject(new Error('无写入权限')) : () => resolve({ saved: outcome === 'saved' }); }) });
      app.click(action);
      assert.equal(app.calls.length, 1);
      assert.equal(app.calls[0].action, 'export');
      assert.match(app.calls[0].filename, /\.md$/);
      assert.match(app.calls[0].text, action === 'export' ? /中文试卷[\s\S]*我的答案：B/ : /答案/);
      assert.doesNotMatch(app.node('#feedback').textContent, /已保存|已导出|已准备下载/);
      finish(); await tick();
      assert.match(app.node('#feedback').textContent, outcome === 'saved' ? /已保存|已导出/ : outcome === 'cancelled' ? /取消/ : /无写入权限/);
      assert.equal(app.downloads.length, 0);
    });
  }
}

for (const failure of [false, true]) test(`native copy ${failure ? 'failure' : 'success'} is acknowledged without browser clipboard`, async () => {
  const app = launch({ initialState: fixture(true), request: async () => { if (failure) throw new Error('剪贴板不可用'); return { copied: true }; } });
  app.click('copy'); await tick();
  assert.equal(app.calls[0].action, 'copy');
  assert.match(app.calls[0].text, /我的答案：B/);
  assert.match(app.node('#feedback').textContent, failure ? /剪贴板不可用/ : /已复制/);
  assert.equal(app.clipboard.length, 0);
});

test('browser fallback restores and saves draft, downloads template, and copies mistakes', async () => {
  const draft = launch({ desktop: false, browserState: fixture() });
  assert.match(draft.node('#main').innerHTML, /中文试卷/);
  draft.answer('A'); assert.deepEqual(draft.writes[0].papers[0].answers.q1, ['A']);
  draft.click('template'); await tick(); assert.equal(draft.downloads.length, 1);
  const graded = launch({ desktop: false, browserState: fixture(true) });
  graded.click('copy'); await tick(); assert.match(graded.clipboard[0], /我的答案：B/);
});
