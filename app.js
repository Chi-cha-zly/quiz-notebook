(function () {
  'use strict';
  const Core = window.QuizCore;
  const desktop = window.QuizDesktop;
  const KEY = 'markdown-quiz-notebook.v1';
  const $ = (selector) => document.querySelector(selector);
  const main = $('#main');
  let state = { papers: [], activeId: null };
  let reviewId = null;
  let wrongOnly = false;
  let importing = false;
  let storageAvailable = true;
  let saveStatus = 'idle';
  let saveRevision = 0;
  let lastSaveError = null;
  const pendingSaves = new Set();

  // Native quit waits for every in-flight acknowledgment before closing the view.
  if (desktop) desktop.flush = async () => {
    while (pendingSaves.size) await Promise.all([...pendingSaves]);
    if (lastSaveError) throw lastSaveError;
  };

  const saveLabel = () => saveStatus === 'saving' ? '正在保存中…' : !storageAvailable ? '当前未保存' : desktop && saveStatus === 'saved' ? '已保存到本机' : '作答自动保存';
  function updateSaveLabel() {
    if ($('#save-label')) $('#save-label').textContent = saveLabel();
  }

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dateLabel = (date) => new Date(date).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const currentPaper = () => state.papers.find((paper) => paper.id === state.activeId);
  const selectedCount = (paper) => paper.questions.filter((q) => (paper.answers[q.id] || []).length).length;
  const wrongItems = (result) => result.items.filter((item) => !item.correct);
  const contentKey = (paper) => JSON.stringify([paper.title, paper.questions.map(({ type, stem, options, answer, explanation }) => ({ type, stem, options, answer, explanation }))]);

  // Only these text decorations are supported. Every source fragment is escaped first.
  function inlineMarkdown(source) {
    return String(source).split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part) => {
      if (part.startsWith('`') && part.endsWith('`')) return `<code>${escapeHTML(part.slice(1, -1))}</code>`;
      if (part.startsWith('**') && part.endsWith('**')) return `<strong>${escapeHTML(part.slice(2, -2))}</strong>`;
      if (part.startsWith('*') && part.endsWith('*')) return `<em>${escapeHTML(part.slice(1, -1))}</em>`;
      return escapeHTML(part);
    }).join('');
  }
  function markdown(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    let output = '', paragraph = [], code = null;
    const flush = () => { if (paragraph.length) { output += `<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`; paragraph = []; } };
    lines.forEach((line) => {
      if (/^\s*```/.test(line)) { flush(); if (code === null) code = []; else { output += `<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`; code = null; } }
      else if (code !== null) code.push(line);
      else if (!line.trim()) flush();
      else paragraph.push(line);
    });
    flush();
    if (code !== null) output += `<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`;
    return output;
  }
  function notify(message, error = false) {
    const area = $('#feedback');
    area.textContent = message;
    area.className = `feedback${error ? ' error' : ''}`;
    area.hidden = !message;
  }
  function storageError(message) {
    storageAvailable = false;
    const warning = $('#storage-warning');
    warning.textContent = message;
    warning.hidden = false;
  }
  function save() {
    if (desktop) {
      const revision = ++saveRevision;
      saveStatus = 'saving';
      updateSaveLabel();
      let request;
      try {
        // Capture now and send immediately: native persists requests in order.
        request = desktop.request({ action: 'persist', data: JSON.stringify({ version: 1, ...state }) });
      } catch (error) { request = Promise.reject(error); }
      const operation = Promise.resolve(request).then((result) => {
        if (result?.saved !== true) throw new Error('未收到保存确认');
        if (revision === saveRevision) {
          storageAvailable = true;
          saveStatus = 'saved';
          lastSaveError = null;
          $('#storage-warning').hidden = true;
          updateSaveLabel();
        }
        return true;
      }).catch((error) => {
        if (revision === saveRevision) {
          lastSaveError = error instanceof Error ? error : new Error(error?.message || String(error));
          saveStatus = 'failed';
          storageError(`本机保存失败：${lastSaveError.message}。请检查磁盘空间与文件权限。本次作答仍在当前窗口，关闭后可能丢失；请保留原试卷，并及时导出错题。`);
          updateSaveLabel();
        }
        return false;
      }).finally(() => pendingSaves.delete(operation));
      pendingSaves.add(operation);
      return operation;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, ...state }));
      storageAvailable = true;
      $('#storage-warning').hidden = true;
      return true;
    } catch (_) {
      storageError('本地保存失败：浏览器可能禁止存储，或存储空间已满。本次作答仍在当前页面，关闭后可能丢失。请保留原试卷，并及时导出错题。');
      return false;
    }
  }
  function validatePaper(paper) {
    return paper && typeof paper.id === 'string' && typeof paper.title === 'string' && Array.isArray(paper.questions) && paper.questions.length && paper.questions.every((q) => q && typeof q.id === 'string' && ['single', 'multiple'].includes(q.type) && typeof q.stem === 'string' && Array.isArray(q.options) && q.options.length >= 2 && q.options.every((o) => typeof o.key === 'string' && typeof o.text === 'string') && Array.isArray(q.answer) && q.answer.length && q.answer.every((a) => q.options.some((o) => o.key === a)));
  }
  function cleanAnswers(questions, answers) {
    const clean = {};
    questions.forEach((q) => { const values = Array.isArray(answers?.[q.id]) ? answers[q.id] : []; clean[q.id] = [...new Set(values.filter((v) => q.options.some((o) => o.key === v)))]; });
    return clean;
  }
  function load() {
    try {
      const raw = desktop ? desktop.initialState : localStorage.getItem(KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (stored.version !== 1 || !Array.isArray(stored.papers) || !stored.papers.every(validatePaper)) throw new Error('invalid');
      state.papers = stored.papers.map((paper) => {
        const answers = cleanAnswers(paper.questions, paper.answers);
        const history = Array.isArray(paper.history) ? paper.history.filter((h) => h && typeof h.id === 'string' && h.answers).map((h) => {
          const historyAnswers = cleanAnswers(paper.questions, h.answers);
          return { ...h, answers: historyAnswers, result: Core.grade(paper.questions, historyAnswers) };
        }) : [];
        return { ...paper, answers, history, result: paper.result ? Core.grade(paper.questions, answers) : null };
      });
      state.activeId = state.papers.some((p) => p.id === stored.activeId) ? stored.activeId : null;
    } catch (_) {
      storageError(desktop ? '无法读取已保存的试卷。本机记录可能已损坏。原存储尚未改动；重新导入或开始练习将尝试保存新记录。' : '无法读取已保存的试卷。浏览器可能禁止存储，或本地记录已损坏。原存储尚未改动；重新导入或开始练习将尝试保存新记录。');
    }
  }
  function viewFor(paper) {
    const history = reviewId ? paper.history.find((entry) => entry.id === reviewId) : null;
    return { result: history?.result || paper.result, answers: history?.answers || paper.answers, history };
  }
  function renderSidebar() {
    $('#paper-count').textContent = state.papers.length;
    $('#paper-list').innerHTML = state.papers.length ? state.papers.map((p) => `<button class="paper-item${p.id === state.activeId ? ' active' : ''}" data-action="paper" data-id="${escapeHTML(p.id)}" ${p.id === state.activeId ? 'aria-current="page"' : ''}><span class="paper-icon" aria-hidden="true">▤</span><span class="paper-label"><span class="paper-title">${escapeHTML(p.title)}</span><span class="paper-meta">${p.questions.length} 道题 · ${p.result ? `已完成 ${p.result.score} 分` : `已答 ${selectedCount(p)} 题`}</span></span></button>`).join('') : '<p class="empty-library">还没有试卷<br>导入一份 Markdown，开始练习。</p>';
    const paper = currentPaper();
    if (!paper) { $('#question-navigation').innerHTML = ''; return; }
    const { result, answers } = viewFor(paper);
    $('#question-navigation').innerHTML = `<h2 class="navigation-title">题目导航</h2><div class="question-grid">${paper.questions.map((q, index) => {
      const item = result?.items[index];
      const status = item ? item.correct ? 'correct' : 'wrong' : answers[q.id]?.length ? 'answered' : '';
      const label = item ? item.correct ? '答对' : item.unanswered ? '未答' : '答错' : status ? '已答' : '未答';
      return `<button class="question-number ${status}" data-action="question" data-index="${index}" aria-label="第 ${index + 1} 题，${label}">${index + 1}</button>`;
    }).join('')}</div><p class="nav-legend">${result ? '绿色：答对　红色：答错或未答' : '蓝色：已答　白色：未答'}</p>`;
  }
  function renderHome() {
    $('#breadcrumb-current').textContent = '开始练习';
    document.title = '自测本 · Markdown 选择题';
    main.innerHTML = `<h1>自测本</h1><p class="lede">把 AI 生成的题目变成一份试卷。<br>导入 Markdown，安静作答，再把错题交给 AI 一起复盘。</p>
      <section class="drop-zone" id="drop-zone" aria-label="导入 Markdown 试卷">
        <svg class="upload-icon" viewBox="0 0 36 42" fill="none" aria-hidden="true"><path d="M7 2h15l8 8v29H7V2Z" stroke="currentColor" stroke-width="1.3"/><path d="M22 2v9h8M12 20h13M12 25h13M12 30h8" stroke="currentColor" stroke-width="1.3"/></svg>
        <strong>将 Markdown 试卷拖到这里</strong><p>支持 .md、.markdown 和 .txt 文件</p><button class="button button-primary" data-action="import">选择本地文件</button>
      </section><div class="welcome-tools"><button class="text-button" data-action="sample">用示例试卷试一试</button><span class="divider" aria-hidden="true"></span><button class="text-button" data-action="template">下载题目模板</button></div>
      <h2 class="section-heading">一份试卷，应该怎么写？</h2><p class="guide-intro">让 AI 按下面的格式出题，保存为 Markdown 文件后导入。支持单选和多选。</p>
      <pre class="format-example"># Python 基础练习

## 1. 单选题
题目：下面哪个是 Python 的列表？
A. (1, 2, 3)
B. [1, 2, 3]
C. {1, 2, 3}
D. "1, 2, 3"
答案：B
解析：列表使用方括号表示。

## 2. 多选题
题目：哪些类型是不可变类型？
A. int
B. list
C. str
D. dict
答案：A、C
解析：整数和字符串都是不可变类型。</pre>
      <p class="format-note">每道题包含题型、题目、选项和答案；解析可选。多选题须全部选对才得分，未答计入错题。答案和解析会在交卷后显示。</p>
      <aside class="local-note">${desktop ? '试卷、作答进度和历史记录保存在本机。<br>移动应用不会影响记录。建议保留原始试卷和导出的错题，并定期备份电脑。' : '试卷、作答进度和历史记录保存在当前浏览器。<br>清理浏览器数据或更换浏览器后，记录不会保留。建议保留原始试卷和导出的错题。'}</aside>`;
  }
  function renderQuestion(question, index, answers, item) {
    const selected = answers[question.id] || [];
    return `<fieldset class="question" id="question-${index}" data-question-id="${escapeHTML(question.id)}"><legend><span class="question-kicker"><span class="question-index">第 ${index + 1} 题</span><span class="question-type">${question.type === 'multiple' ? '多选题' : '单选题'}</span>${item ? `<span class="${item.correct ? 'correct-label' : 'wrong-label'}">${item.correct ? '回答正确' : item.unanswered ? '未作答' : '回答错误'}</span>` : ''}</span><span class="question-stem markdown">${markdown(question.stem)}</span></legend><div class="options">${question.options.map((option) => {
      const checked = selected.includes(option.key);
      const correct = item && question.answer.includes(option.key);
      return `<label class="option${correct ? ' correct-option' : item && checked ? ' wrong-option' : ''}"><input type="${question.type === 'single' ? 'radio' : 'checkbox'}" name="question-${index}" data-question="${escapeHTML(question.id)}" value="${escapeHTML(option.key)}" ${checked ? 'checked' : ''} ${item ? 'disabled' : ''}><span class="option-key">${escapeHTML(option.key)}.</span><span class="option-text markdown">${inlineMarkdown(option.text).replace(/\n/g, '<br>')}</span></label>`;
    }).join('')}</div>${item ? `<div class="answer-review ${item.correct ? 'correct-review' : 'wrong-review'}"><p><span class="review-title">你的答案：</span>${selected.length ? escapeHTML(selected.join('、')) : '未作答'}　 <span class="review-title">正确答案：</span>${escapeHTML(question.answer.join('、'))}</p>${question.explanation ? `<div class="markdown"><span class="review-title">解析</span>${markdown(question.explanation)}</div>` : '<p>本题未提供解析，可导出错题后请 AI 讲解。</p>'}</div>` : ''}</fieldset>`;
  }
  function renderPaper(paper) {
    const { result, answers, history } = viewFor(paper);
    $('#breadcrumb-current').textContent = paper.title;
    document.title = `${paper.title} · 自测本`;
    const wrong = result ? wrongItems(result).length : 0;
    main.innerHTML = `${history ? `<div class="history-banner"><span>正在查看 ${escapeHTML(dateLabel(history.at))} 的作答记录</span><button class="text-button" data-action="current">返回当前练习</button></div>` : ''}<div class="paper-heading"><h1>${escapeHTML(paper.title)}</h1></div><div class="paper-toolbar"><span class="muted">${paper.questions.length} 道题 · ${paper.questions.filter((q) => q.type === 'single').length} 道单选 · ${paper.questions.filter((q) => q.type === 'multiple').length} 道多选</span><button class="button button-small button-plain" data-action="home">返回首页</button></div>
      ${result ? `<section class="result-summary" aria-label="本次成绩"><div class="score">${escapeHTML(result.score)}<small>分</small></div><div><h2>${wrong ? '完成了，回看一下错在哪里。' : '全部答对，做得不错。'}</h2><p>答对 ${result.correct} / ${result.total} 题，错题 ${wrong} 道${result.unanswered ? `（其中 ${result.unanswered} 道未答）` : ''}</p></div></section><div class="result-actions"><button class="button button-primary" data-action="export">导出错题 Markdown</button><button class="button" data-action="copy">复制给 AI</button>${wrong ? '<button class="button" data-action="retry-wrong">只练错题</button>' : ''}${!history ? '<button class="button" data-action="retake">重新作答</button>' : ''}</div><label class="result-filter"><input id="wrong-filter" type="checkbox" ${wrongOnly ? 'checked' : ''}>只看错题 <span>（${wrong}）</span></label>` : `<div class="progress-row"><span id="progress-label"></span><span id="save-label">${saveLabel()}</span></div><div class="progress-track" role="progressbar" aria-label="作答进度" aria-valuemin="0" aria-valuemax="${paper.questions.length}" aria-valuenow="${selectedCount(paper)}"><div class="progress-fill"></div></div><p class="quiz-instruction">单选只选一项，多选可选多项。交卷后查看答案与解析。</p>`}
      <section aria-label="试卷题目">${paper.questions.map((q, i) => (!wrongOnly || !result || !result.items[i].correct) ? renderQuestion(q, i, answers, result?.items[i]) : '').join('')}${result && wrongOnly && !wrong ? '<p class="empty-result">本次没有错题，所有题目均已答对。</p>' : ''}</section>
      ${!result ? '<div class="submit-row"><p id="submit-hint"></p><button class="button button-primary" data-action="submit">交卷并查看结果</button></div>' : ''}
      ${paper.history.length ? `<details class="history"><summary>历史作答（${paper.history.length} 次）</summary><ul class="history-list">${[...paper.history].reverse().map((h, i) => `<li><span>第 ${paper.history.length - i} 次 · ${escapeHTML(dateLabel(h.at))}</span><span>${h.result.score} 分 · 答对 ${h.result.correct} / ${h.result.total} 题</span><button class="text-button" data-action="history" data-id="${escapeHTML(h.id)}">查看记录</button></li>`).join('')}</ul></details>` : ''}<div class="paper-bottom"><button class="button button-small button-plain button-danger" data-action="delete">删除这份试卷</button></div>`;
    if (!result) updateProgress();
  }
  function updateProgress() {
    const paper = currentPaper();
    if (!paper || !$('#progress-label')) return;
    const done = selectedCount(paper), total = paper.questions.length;
    $('#progress-label').textContent = `已答 ${done} / ${total} 题`;
    updateSaveLabel();
    $('.progress-track').setAttribute('aria-valuenow', done);
    $('.progress-fill').style.width = `${done / total * 100}%`;
    $('#submit-hint').textContent = total - done ? `还有 ${total - done} 道题未作答，未答将计入错题。` : '全部作答完毕，可以交卷了。';
  }
  function render(focus = false) {
    renderSidebar();
    const paper = currentPaper();
    if (paper) renderPaper(paper); else renderHome();
    if (focus) { window.scrollTo({ top: 0, behavior: 'instant' }); main.focus({ preventScroll: true }); }
  }
  function selectPaper(id) {
    state.activeId = id;
    reviewId = null;
    wrongOnly = false;
    notify('');
    save();
    render(true);
  }
  function confirmAction(title, description, label, dangerous = false) {
    const dialog = $('#confirm-dialog');
    if (dialog.open) return Promise.resolve(false);
    $('#dialog-title').textContent = title;
    $('#dialog-description').textContent = description;
    $('#dialog-confirm').textContent = label;
    $('#dialog-confirm').className = `button ${dangerous ? 'button-danger' : 'button-primary'}`;
    dialog.returnValue = '';
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      dialog.showModal();
    });
  }
  async function download(text, filename) {
    const safeFilename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    if (desktop) {
      const result = await desktop.request({ action: 'export', text, filename: safeFilename });
      if (typeof result?.saved !== 'boolean') throw new Error('未收到导出确认');
      return result.saved;
    }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFilename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }
  function addPaper(parsed, sourceLabel) {
    const key = contentKey(parsed);
    const existing = state.papers.find((p) => contentKey(p) === key);
    if (existing) { selectPaper(existing.id); notify('这份试卷已经导入，已打开原记录。作答进度和历史保持不变。'); return; }
    const paper = { id: uid(), title: parsed.title || sourceLabel || '未命名试卷', questions: parsed.questions, answers: {}, result: null, history: [], createdAt: new Date().toISOString() };
    state.papers.push(paper);
    selectPaper(paper.id);
    notify(`已导入「${paper.title}」，共 ${paper.questions.length} 道题。`);
  }
  async function importFile(file) {
    if (!file || importing) return;
    if (file.size > 5 * 1024 * 1024) { notify('文件超过 5 MB，请将试卷拆分为较小的 Markdown 文件后导入。', true); return; }
    importing = true;
    try { addPaper(Core.parseMarkdown(await file.text()), file.name.replace(/\.[^.]+$/, '')); }
    catch (error) { notify(`导入失败：${error.message || '无法读取文件，请确认文件采用 UTF-8 编码。'}`, true); window.scrollTo({ top: 0, behavior: 'instant' }); }
    finally { importing = false; $('#file-input').value = ''; }
  }
  async function copyMistakes(paper, result) {
    const text = Core.exportMistakes(paper.title, result);
    if (desktop) {
      try {
        const response = await desktop.request({ action: 'copy', text });
        if (response?.copied !== true) throw new Error('未收到复制确认');
        notify('已复制错题与复盘提示，可直接粘贴给 AI。');
      } catch (error) {
        notify(`复制失败：${error.message || '剪贴板不可用'}。请点击「导出错题 Markdown」，将文件交给 AI。`, true);
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(text);
      notify('已复制错题与复盘提示，可直接粘贴给 AI。');
    } catch (_) {
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;';
      document.body.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) { /* Offer the download below. */ }
      field.remove();
      notify(copied ? '已复制错题与复盘提示，可直接粘贴给 AI。' : '浏览器不允许自动复制。请点击「导出错题 Markdown」，将文件交给 AI。', !copied);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function handleAction(action, button) {
    const paper = currentPaper();
    if (action === 'import') { $('#file-input').click(); return; }
    if (action === 'home') { selectPaper(null); return; }
    if (action === 'sample') { addPaper(Core.parseMarkdown(Core.sampleMarkdown), '示例试卷'); return; }
    if (action === 'template') {
      notify(desktop ? '请选择模板保存位置。' : '');
      const saved = await download(Core.sampleMarkdown, 'Markdown 题目模板.md');
      notify(!saved ? '已取消保存模板。' : desktop ? '模板已保存，可按模板修改题目后重新导入。' : '模板已准备下载，可按模板修改题目后重新导入。');
      return;
    }
    if (action === 'paper') { selectPaper(button.dataset.id); return; }
    if (!paper) return;
    const { result } = viewFor(paper);
    if (action === 'question') {
      const index = Number(button.dataset.index);
      if (wrongOnly && result?.items[index]?.correct) { wrongOnly = false; render(); }
      const target = document.getElementById(`question-${index}`);
      if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
    } else if (action === 'submit' && !paper.result && !reviewId) {
      const unanswered = paper.questions.length - selectedCount(paper);
      if (unanswered && !await confirmAction('还有题目未作答', `还有 ${unanswered} 道题未作答。交卷后会按错题计入成绩，仍要交卷吗？`, '确认交卷')) return;
      if (paper !== currentPaper() || paper.result) return;
      paper.result = Core.grade(paper.questions, paper.answers);
      paper.history.push({ id: uid(), at: new Date().toISOString(), answers: JSON.parse(JSON.stringify(paper.answers)), result: paper.result });
      save(); notify(''); render(true);
    } else if (action === 'retake') {
      if (!await confirmAction('重新作答这份试卷？', '本次作答已保存在历史记录中。重新开始后，当前选项将清空。', '重新作答')) return;
      paper.answers = {}; paper.result = null; reviewId = null; wrongOnly = false; save(); render(true);
    } else if (action === 'retry-wrong' && result) {
      const questions = wrongItems(result).map((item) => item.question);
      if (!questions.length) return;
      const retry = { id: uid(), title: `${paper.title.replace(/ · 错题练习(?: \d+)?$/, '')} · 错题练习`, questions: JSON.parse(JSON.stringify(questions)), answers: {}, result: null, history: [], createdAt: new Date().toISOString() };
      state.papers.push(retry); selectPaper(retry.id); notify('已创建错题练习，原试卷与历史记录已保留。');
    } else if (action === 'export' && result) {
      notify(desktop ? '请选择错题保存位置。' : '');
      const saved = await download(Core.exportMistakes(paper.title, result), `${paper.title} - 错题复盘.md`);
      notify(!saved ? '已取消导出错题。' : desktop ? '错题 Markdown 已保存，包含题目、作答、答案、解析和复盘提示。' : '错题 Markdown 已准备下载，包含题目、作答、答案、解析和复盘提示。'); window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (action === 'copy' && result) await copyMistakes(paper, result);
    else if (action === 'delete') {
      if (!await confirmAction('删除这份试卷？', `「${paper.title}」及其作答、历史记录都会从${desktop ? '本机' : '此浏览器'}删除。此操作无法撤销。`, '确认删除', true)) return;
      state.papers = state.papers.filter((p) => p.id !== paper.id); selectPaper(null); notify('已删除试卷及其作答记录。');
    } else if (action === 'history') { reviewId = button.dataset.id; wrongOnly = false; notify(''); render(true); }
    else if (action === 'current') { reviewId = null; wrongOnly = false; render(true); }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button.dataset.action, button).catch((error) => notify(`操作未完成：${error.message}`, true));
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input.id === 'file-input') { importFile(input.files[0]); return; }
    if (input.id === 'wrong-filter') { wrongOnly = input.checked; render(); $('#wrong-filter').focus({ preventScroll: true }); return; }
    if (!input.dataset.question) return;
    const paper = currentPaper();
    if (!paper || paper.result || reviewId) return;
    const question = paper.questions.find((q) => q.id === input.dataset.question);
    if (!question) return;
    const selected = Array.from(main.querySelectorAll('input[data-question]')).filter((element) => element.dataset.question === question.id && element.checked).map((element) => element.value);
    paper.answers[question.id] = selected;
    save(); updateProgress(); renderSidebar();
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', (event) => { if (Array.from(event.dataTransfer?.types || []).includes('Files')) { event.preventDefault(); dragDepth++; $('#drop-zone')?.classList.add('dragging'); } });
  document.addEventListener('dragover', (event) => { if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault(); });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-zone')?.classList.remove('dragging'); });
  document.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); dragDepth = 0; $('#drop-zone')?.classList.remove('dragging');
    if (event.dataTransfer.files.length !== 1) notify('请每次导入一份试卷，避免混淆作答记录。', true);
    else importFile(event.dataTransfer.files[0]);
  });
  if (!Core) { main.innerHTML = '<h1>自测本未能启动</h1><p>请将 index.html、styles.css、core.js 和 app.js 放在同一文件夹后重新打开。</p>'; return; }
  if (desktop) $('.sidebar-footer').innerHTML = '<span class="local-dot" aria-hidden="true"></span>仅保存在本机<small>你的试卷和作答不会上传</small>';
  load(); render();
})();
