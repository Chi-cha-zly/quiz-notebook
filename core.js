(function (root) {
  'use strict';

  function cleanLabel(line) {
    let value = line.trim().replace(/^#{1,6}\s*/, '').replace(/^[-*+]\s+/, '');
    // Unwrap metadata only: Python's ** operator and __name__ are content.
    value = value.replace(/^(\*\*|__)((?:题目类型|题型|类型|题目|题干|问题|选项|正确答案|参考答案|答案解析|答案|解析|解释|解答)\s*[:：]?)\1/, '$2');
    value = value.replace(/^(\*\*|__)((?:题目类型|题型|类型|题目|题干|问题|选项|正确答案|参考答案|答案解析|答案|解析|解释|解答)\s*[:：].*)\1$/, '$2');
    value = value.replace(/^(\*\*|__)([A-Za-z]\s*[.．、)）:：]?)\1/, '$2');
    return value.trim();
  }

  function parseMarkdown(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('文件内容为空。请粘贴或导入包含题目、选项和答案的 Markdown。');
    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    let title = '未命名试卷';
    let current = null;
    let sectionType = null;
    let fence = null;
    let mode = 'stem';
    const questions = [];

    function fail(message) {
      throw new Error(`第 ${questions.length + 1} 题：${message}`);
    }
    function begin(stem, type) {
      current = { stem: stem || '', type: type || sectionType, options: [], rawAnswer: null, explanation: '' };
      mode = 'stem';
    }
    function append(line) {
      if (!current) return;
      if (mode === 'option') {
        const option = current.options[current.options.length - 1];
        option.text += (option.text ? '\n' : '') + line;
      } else if (mode === 'explanation' || mode === 'answer') {
        current.explanation += (current.explanation ? '\n' : '') + line;
      } else {
        current.stem += (current.stem ? '\n' : '') + line;
      }
    }
    function finish() {
      if (!current) return;
      const stem = current.stem.trim();
      if (!stem) fail('题干为空。请在题号后或“题目：”后补充题干。');
      if (current.options.length < 2) fail('至少需要两个选项，请使用 A.、B. 等格式。');
      const seen = new Set();
      for (const option of current.options) {
        if (seen.has(option.key)) fail(`重复选项 ${option.key}。请为每个选项使用不同字母。`);
        seen.add(option.key);
        option.text = option.text.trim();
        if (!option.text) fail(`选项 ${option.key} 内容为空，请补充选项文字。`);
      }
      if (current.rawAnswer === null || !current.rawAnswer.trim()) fail('缺少答案。请补充“答案：A”或“答案：A、C”。');
      const compact = current.rawAnswer.toUpperCase().replace(/[\s,，、;；/|+和与\[\]【】()（）`*]/g, '');
      if (!/^[A-Z]+$/.test(compact)) fail('答案格式无法识别。答案中只填写选项字母，例如“答案：A、C”；说明另写在“解析：”后。');
      const answer = [...new Set(compact.split(''))].sort();
      for (const key of answer) if (!seen.has(key)) fail(`答案 ${key} 没有对应选项，请核对答案和选项字母。`);
      const type = current.type || (answer.length > 1 ? 'multiple' : 'single');
      if (type === 'single' && answer.length !== 1) fail('单选题只能有一个正确答案。请修改答案，或将题型改成“多选题”。');
      questions.push({ id: `q${questions.length + 1}`, type, stem, options: current.options, answer, explanation: current.explanation.trim() });
      current = null;
    }
    function typeOf(value) {
      if (/多选/.test(value)) return 'multiple';
      if (/单选/.test(value)) return 'single';
      return null;
    }
    function takeType(value) {
      let type = null;
      const stem = value.replace(/^\s*(?:[\[【（(]\s*)?(单选题?|多选题?)(?:\s*[\]】）)])?\s*[:：、.．-]?\s*/, (_, name) => {
        type = typeOf(name);
        return '';
      });
      return { stem, type };
    }
    function startsQuestion(index, raw) {
      if (!current || /^\s*#{1,6}\s+/.test(raw) || /^\s*(?:第\s*\d+\s*题|题目?\s*\d+)/.test(raw)) return true;
      // A plain numbered list is also valid Markdown inside a question.
      // Only split it when the following options establish a new question.
      if (!current.options.length && current.rawAnswer === null) return false;
      let codeFence = null;
      for (let next = index + 1; next < lines.length; next++) {
        const candidate = lines[next].trim();
        const marker = candidate.match(/^(`{3,}|~{3,})/);
        if (codeFence) {
          if (marker && marker[1][0] === codeFence[0] && marker[1].length >= codeFence.length && !candidate.slice(marker[1].length).trim()) codeFence = null;
          continue;
        }
        if (marker) { codeFence = marker[1]; continue; }
        const value = cleanLabel(candidate);
        if (/^#{1,6}\s+/.test(candidate) || /^(?:第\s*\d+\s*题|题目?\s*\d+|\d+\s*[.．、)）])/.test(value)) break;
        const option = value.match(/^([A-Za-z])\s*[.．、)）:：]/);
        if (option && (current.rawAnswer !== null || current.options.some(item => item.key === option[1].toUpperCase()))) return true;
        if (/^(?:正确答案|参考答案|答案)\s*[:：]/.test(value)) break;
      }
      return false;
    }

    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index];
      const trimmed = raw.trim();
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
      if (fence) {
        append(raw);
        if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length && !trimmed.slice(fenceMatch[1].length).trim()) fence = null;
        continue;
      }
      if (fenceMatch) {
        fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
        append(raw);
        continue;
      }
      const line = cleanLabel(raw);
      if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) continue;
      const section = line.match(/^(?:(?:[一二三四五六七八九十]+|\d+)[、.．]\s*)?(单选题?|多选题?)(?:\s*[（(].*[）)])?\s*$/);
      if (section && !/^\d+[.．、]/.test(line)) {
        finish();
        sectionType = typeOf(section[1]);
        continue;
      }
      const typeField = line.match(/^(?:题目类型|题型|类型)\s*[:：]\s*(.*)$/);
      if (typeField) {
        const type = typeOf(typeField[1]);
        if (!type) fail('不支持此题型。请使用“题目类型：单选题”或“题目类型：多选题”。');
        if (current && (current.rawAnswer !== null || current.options.length)) finish();
        if (!current) begin('', type);
        current.type = type;
        continue;
      }
      const numbered = line.match(/^(?:第\s*\d+\s*题|题目?\s*\d+|\d+\s*[.．、)）])\s*[:：.．、]?\s*(.*)$/);
      if (numbered) {
        if (!startsQuestion(index, raw)) { append(raw); continue; }
        const pendingType = current && !current.stem.trim() && !current.options.length && current.rawAnswer === null ? current.type : null;
        if (pendingType) current = null;
        else finish();
        const entry = takeType(numbered[1]);
        begin(entry.stem, entry.type || pendingType);
        continue;
      }
      const stemField = line.match(/^(?:题目|题干|问题)\s*[:：]\s*(.*)$/);
      if (stemField) {
        if (current && (current.rawAnswer !== null || current.options.length)) finish();
        if (!current) begin('', null);
        // A heading such as “1. 单选题” is metadata; a real heading stem is retained.
        if (current.stem) current.stem += '\n';
        current.stem += stemField[1];
        mode = 'stem';
        continue;
      }
      const optionField = line.match(/^选项\s*[:：]?\s*$/);
      if (optionField) {
        if (!current) fail('选项前缺少题目。请先写“## 1. 题干”或“题目：题干”。');
        continue;
      }
      const option = line.match(/^([A-Za-z])\s*[.．、)）:：]\s*(.*)$/);
      if (option) {
        if (!current) fail('选项前缺少题目。请先写“## 1. 题干”或“题目：题干”。');
        if (current.rawAnswer !== null && mode !== 'explanation') fail('答案后出现选项。若是下一题，请先补充题号或“题目：”。');
        if (mode === 'explanation') { append(raw); continue; }
        current.options.push({ key: option[1].toUpperCase(), text: option[2] });
        mode = 'option';
        continue;
      }
      const answerField = line.match(/^(?:正确答案|参考答案|答案)\s*[:：]\s*(.*)$/);
      if (answerField) {
        if (!current) fail('答案前缺少题目。请为每题添加题号和选项。');
        if (current.rawAnswer !== null) fail('答案字段重复。每题只保留一个“答案：”，理由放在“解析：”中。');
        current.rawAnswer = answerField[1];
        mode = 'answer';
        continue;
      }
      const explanationField = line.match(/^(?:答案解析|解析|解释|解答)\s*[:：]\s*(.*)$/);
      if (explanationField) {
        if (!current) fail('解析前缺少题目。请核对题目格式。');
        current.explanation += (current.explanation ? '\n' : '') + explanationField[1];
        mode = 'explanation';
        continue;
      }
      if (current && current.rawAnswer !== null && /^#{1,6}\s+/.test(trimmed)) {
        fail('无法识别后面的题目标题。请为新题添加编号，例如“## 2. 题干”；解析的小标题请改成普通文字或加粗文字。');
      }
      if (!current && /^#\s+/.test(trimmed) && title === '未命名试卷') title = cleanLabel(raw);
      else append(raw);
    }
    if (fence) fail('代码块没有闭合。请补充相同的 ``` 或 ~~~ 结束标记。');
    finish();
    if (!questions.length) throw new Error('没有识别到题目。请使用“## 1. 题干”、A./B. 选项和“答案：A”格式。');
    return { title, questions };
  }

  function grade(questions, answers) {
    const selections = answers || {};
    const items = questions.map(question => {
      const value = selections[question.id];
      const selected = [...new Set((Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).map(key => String(key).toUpperCase()))].sort();
      const expected = [...new Set(question.answer)].sort();
      const unanswered = selected.length === 0;
      const correct = !unanswered && selected.length === expected.length && selected.every((key, index) => key === expected[index]);
      return { question, selected, correct, unanswered };
    });
    const correct = items.filter(item => item.correct).length;
    const total = items.length;
    return { total, correct, wrong: total - correct, unanswered: items.filter(item => item.unanswered).length, score: total ? Math.round(correct / total * 100) : 0, items };
  }

  function exportMistakes(title, result) {
    const mistakes = result.items.filter(item => !item.correct);
    const lines = [`# ${title} · 错题复盘`, '', `本次得分：${result.score} 分；答对 ${result.correct}/${result.total} 题；错题 ${result.wrong} 题（含未作答 ${result.unanswered} 题）。`, ''];
    if (!mistakes.length) lines.push('全部答对，没有错题。', '');
    mistakes.forEach((item, index) => {
      const q = item.question;
      lines.push(`## ${index + 1}. ${q.type === 'multiple' ? '多选题' : '单选题'}`, '', q.stem, '');
      q.options.forEach(option => lines.push(`${option.key}. ${option.text}`));
      lines.push('', `我的答案：${item.selected.length ? item.selected.join('、') : '未作答'}`, `正确答案：${q.answer.join('、')}`, '', `解析：${q.explanation || '原试卷未提供解析。'}`, '');
    });
    lines.push('## AI 复盘提示', '', '请根据以上题目和我的作答，逐题解释相关知识点与错误原因，区分理解偏差和未作答，给出一个简短例子，再出一道类似练习题。请先让我尝试作答，再公布新题答案；如果原题或答案存在歧义，请明确指出。', '');
    return lines.join('\n');
  }

  const sampleMarkdown = '# Python 基础复习\n\n五道练习，检查列表、切片、可变类型、循环与字典的基础知识。\n\n## 1. 单选题\n题目：下面代码输出什么？\n\n```python\nnumbers = [1, 2, 3]\nnumbers.append(4)\nprint(len(numbers))\n```\n\nA. 3\nB. 4\nC. [1, 2, 3, 4]\nD. 抛出异常\n\n答案：B\n解析：append 会在原列表末尾添加一个元素，列表长度由 3 变为 4。\n\n## 2. 单选题\n题目：表达式 `"Python"[1:4]` 的结果是什么？\n\nA. "Pyt"\nB. "yth"\nC. "ytho"\nD. "tho"\n\n答案：B\n解析：切片包含起始索引，不包含结束索引；索引 1、2、3 对应 y、t、h。\n\n## 3. 多选题\n题目：以下哪些 Python 内置类型是可变的？\n\nA. list\nB. tuple\nC. dict\nD. set\n\n答案：A、C、D\n解析：列表、字典和集合都可以原地修改；元组的元素引用不可更改。\n\n## 4. 单选题\n题目：下面代码输出什么？\n\n```python\ntotal = 0\nfor number in range(1, 4):\n    total += number\nprint(total)\n```\n\nA. 3\nB. 4\nC. 6\nD. 10\n\n答案：C\n解析：range(1, 4) 依次产生 1、2、3，相加得到 6。\n\n## 5. 多选题\n题目：给定 `student = {"name": "小林", "score": 90}`，哪些表达式不会抛出异常？\n\nA. student["name"]\nB. student["age"]\nC. student.get("age")\nD. "score" in student\n\n答案：A、C、D\n解析：访问已有键会返回值；直接索引不存在的 age 会抛出 KeyError；get 在键不存在时默认返回 None；in 检查键是否存在。\n';

  const api = { parseMarkdown, grade, exportMistakes, sampleMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QuizCore = api;
})(typeof window !== 'undefined' ? window : null);
