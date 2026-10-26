'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const MAX_BYTES = 32 * 1024 * 1024;
const INDEX_URL = 'quiz://app/index.html';
const ASSETS = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8'],
  ['core.js', 'text/javascript; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['renderer-adapter.js', 'text/javascript; charset=utf-8']
].map(([filename, contentType]) => [`quiz://app/${filename}`, { filename, contentType }]));

function validateText(text) {
  if (typeof text !== 'string') throw new Error('内容必须是文本。');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('内容超过 32 MB，请拆分题库后重试。');
}
function validateState(text) {
  validateText(text);
  const state = JSON.parse(text);
  const validPaper = (paper) => paper && typeof paper.id === 'string' && typeof paper.title === 'string' &&
    Array.isArray(paper.questions) && paper.questions.length > 0 && paper.questions.every((q) => q &&
      typeof q.id === 'string' && ['single', 'multiple'].includes(q.type) && typeof q.stem === 'string' &&
      Array.isArray(q.options) && q.options.length >= 2 && q.options.every((o) => o && typeof o.key === 'string' && typeof o.text === 'string') &&
      Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every((a) => q.options.some((o) => o.key === a)));
  if (!state || state.version !== 1 || !Array.isArray(state.papers) || !state.papers.every(validPaper)) {
    throw new Error('本机记录格式不正确，原文件已保留。');
  }
}

// Synchronous writes on Electron's main thread cannot overtake each other.
// Acknowledgment follows fsync + atomic replacement; failures leave old state intact.
class StateStore {
  constructor(directory, filesystem = fs) { this.directory = directory; this.fs = filesystem; this.file = path.join(directory, 'state.json'); }
  load() {
    let data;
    try { data = this.fs.readFileSync(this.file); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (data.length > MAX_BYTES) throw new Error('本机记录超过 32 MB，原文件已保留。');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    validateState(text);
    return text;
  }
  save(text) {
    validateState(text);
    this.fs.mkdirSync(this.directory, { recursive: true });
    const temporary = path.join(this.directory, `.state-${crypto.randomUUID()}.tmp`);
    let fd;
    try {
      fd = this.fs.openSync(temporary, 'wx', 0o600);
      this.fs.writeFileSync(fd, text, 'utf8');
      this.fs.fsyncSync(fd);
      this.fs.closeSync(fd);
      fd = undefined;
      this.fs.renameSync(temporary, this.file);
    } finally {
      if (fd !== undefined) { try { this.fs.closeSync(fd); } catch (_) {} }
      try { this.fs.unlinkSync(temporary); } catch (_) {}
    }
  }
}
function isAppURL(url) { return typeof url === 'string' && url.split('#')[0] === INDEX_URL; }
function isTrustedSender(event, contents) {
  return Boolean(contents && event && event.sender === contents && event.senderFrame && event.senderFrame === contents.mainFrame && isAppURL(event.senderFrame.url));
}
function assetForURL(url) { return ASSETS.get(url) || null; }
function exportFilename(name) {
  let clean = name.split(/[\\/]/).pop().replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim().replace(/[. ]+$/g, '');
  if (!clean) return '自测本-错题.md';
  // Windows also reserves the superscript digits in COM/LPT device names.
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)) clean = `_${clean}`;
  clean = [...clean].slice(0, 120).join('').replace(/[. ]+$/g, '');
  return clean || '自测本-错题.md';
}
function parseRequest(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('无法识别桌面请求。');
  switch (message.action) {
    case 'persist': validateText(message.data); return { action: 'persist', data: message.data };
    case 'copy': validateText(message.text); return { action: 'copy', text: message.text };
    case 'export':
      validateText(message.text);
      if (typeof message.filename !== 'string' || Buffer.byteLength(message.filename, 'utf8') > 4096) throw new Error('导出文件名无效或过长。');
      return { action: 'export', text: message.text, filename: exportFilename(message.filename) };
    default: throw new Error('不支持的桌面请求。');
  }
}
function createCloseGuard({ flush, confirmDiscard, close, timeoutMs = 10000 }) {
  let pending = false, completed = false;
  return async () => {
    if (pending || completed) return;
    pending = true;
    let timer;
    try {
      let allowed = true;
      try {
        await Promise.race([
          Promise.resolve().then(flush),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('等待保存超时，本次作答可能尚未写入磁盘。')), timeoutMs); })
        ]);
      } catch (error) { allowed = await confirmDiscard(error); }
      if (allowed === true) { completed = true; close(); }
    } finally { clearTimeout(timer); pending = false; }
  };
}
module.exports = { StateStore, INDEX_URL, isAppURL, isTrustedSender, assetForURL, exportFilename, parseRequest, createCloseGuard };
