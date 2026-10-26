// Opt-in integration test: run the Windows wrapper with a native Electron runtime.
// ELECTRON_EXECUTABLE and QUIZ_ELECTRON_APP must point to runtime and staged app.
'use strict';
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  assert.ok(process.env.ELECTRON_EXECUTABLE, 'Set ELECTRON_EXECUTABLE');
  assert.ok(process.env.QUIZ_ELECTRON_APP, 'Set QUIZ_ELECTRON_APP');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quiz-electron-smoke-'));
  const errors = [];
  let app;
  async function launch() {
    app = await _electron.launch({
      executablePath: process.env.ELECTRON_EXECUTABLE,
      args: [process.env.QUIZ_ELECTRON_APP, `--user-data-dir=${directory}`],
      timeout: 30000
    });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof window.QuizDesktop?.flush === 'function');
    await page.locator('[data-action="sample"], .question').first().waitFor();
    return page;
  }
  const choice = (page, q, value) => page.locator(`input[data-question="${q}"][value="${value}"]`);
  const action = (page, name) => page.locator(`[data-action="${name}"]`).first();
  try {
    let page = await launch();
    assert.equal(page.url(), 'quiz://app/index.html');
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    assert.equal(await page.evaluate(() => typeof process), 'undefined');
    assert.equal(await page.evaluate(() => Object.isFrozen(window.QuizNative)), true);
    assert.equal(await page.evaluate(() => Object.isFrozen(window.QuizDesktop)), false);
    assert.equal(await page.locator('.paper-item').count(), 0);
    const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    await action(page, 'sample').click();
    assert.equal(await page.locator('.question').count(), 5);
    await choice(page, 'q1', 'B').check();
    await app.close(); app = null; // real app quit must wait for pending persistence
    let state = JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.deepEqual(state.papers[0].answers.q1, ['B']);
    page = await launch();
    assert.equal(await choice(page, 'q1', 'B').isChecked(), true);
    await choice(page, 'q2', 'A').check();
    for (const value of ['A', 'C', 'D']) await choice(page, 'q3', value).check();
    await choice(page, 'q4', 'C').check();
    await action(page, 'submit').click();
    await page.locator('#dialog-confirm').click();
    await page.locator('.result-summary').waitFor();
    await page.evaluate(() => window.QuizDesktop.flush());
    state = JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.deepEqual([state.papers[0].result.correct, state.papers[0].result.wrong, state.papers[0].result.unanswered], [3, 2, 1]);
    // Replace only OS dialogs/clipboard: exercise actual renderer -> preload -> IPC -> file write.
    const exportPath = path.join(directory, '错题导出.md');
    await app.evaluate(({ dialog, clipboard }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
      clipboard.writeText = text => { globalThis.testClipboard = text; };
    }, exportPath);
    await action(page, 'export').click();
    await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('已保存'));
    const exported = await fs.readFile(exportPath, 'utf8');
    assert.match(exported, /AI 复盘提示/);
    assert.equal((exported.match(/^## \d+\./gm) || []).length, 2);
    await action(page, 'copy').click();
    await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('已复制'));
    assert.equal(await app.evaluate(() => globalThis.testClipboard), exported);
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    assert.deepEqual(await page.evaluate(() => window.QuizDesktop.request({ action: 'export', text: 'cancel', filename: 'cancel.md' })), { saved: false });
    await page.locator('#file-input').setInputFiles(path.resolve(__dirname, '../examples/示例试卷.md'));
    await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('已经导入'));
    assert.equal(await page.locator('.paper-item').count(), 1);
    assert.equal(await page.evaluate(async () => { try { await fetch('quiz://app/../main.cjs'); return false; } catch (_) { return true; } }), true);
    await page.screenshot({ path: path.join(directory, 'electron-result.png'), fullPage: true });
    await app.close(); app = null;
    assert.deepEqual(errors, []);
    console.log('PASS: real Electron isolated bridge, sandbox, draft save/quit/relaunch, grading, IPC export/write/cancel/copy, import/dedup, protocol allowlist.');
    console.log('OS dialog and clipboard endpoints simulated; this is not Windows execution. Evidence:', directory);
  } finally {
    if (app) await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
