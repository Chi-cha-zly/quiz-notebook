const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const corePath = path.join(__dirname, '..', 'core.js');
const core = fs.existsSync(corePath) ? require(corePath) : {};
const { parseMarkdown, grade, exportMistakes } = core;
const basic = '# 自测\n\n## 1. Python 是什么？\nA. 编程语言\nB. 数据库\n答案：A\n解析：Python 是编程语言。';

test('解析编号题并提供稳定标识、选项、答案与解析', () => {
  assert.equal(typeof parseMarkdown, 'function', '需要提供解析器');
  const paper = parseMarkdown(basic);
  assert.equal(paper.title, '自测');
  assert.deepEqual(paper.questions, [{ id: 'q1', type: 'single', stem: 'Python 是什么？', options: [{ key: 'A', text: '编程语言' }, { key: 'B', text: '数据库' }], answer: ['A'], explanation: 'Python 是编程语言。' }]);
  assert.deepEqual(parseMarkdown(basic), paper);
});

test('支持分节、加粗标签、中文标点、小写答案和多选分隔符', () => {
  const text = '# Python\n## 一、单选题\n### 第 1 题：选择结果\n- **A.** 1\n- **B.** 2\n**正确答案：** b\n**解析：** 结果是 2。\n## 二、多选题\n2、选择容器\nA、list\nB、int\nC、dict\n**答案**：a、c\n';
  const { questions } = parseMarkdown(text);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].stem, '选择结果');
  assert.equal(questions[0].type, 'single');
  assert.deepEqual(questions[0].answer, ['B']);
  assert.equal(questions[1].type, 'multiple');
  assert.deepEqual(questions[1].answer, ['A', 'C']);
});

test('支持无编号的题目类型、题目和选项字段', () => {
  const paper = parseMarkdown('# 练习\n题目类型：单选题\n题目：哪个是整数？\n选项：\nA) 3\nB) "3"\n答案：A\n解析：整数没有引号。\n\n题目类型：多选题\n题目：哪些是数字？\n选项：\nA：3\nB：4\n答案：AB');
  assert.equal(paper.questions.length, 2);
  assert.equal(paper.questions[1].stem, '哪些是数字？');
  assert.equal(paper.questions[1].type, 'multiple');
});

test('保留多行题干、选项及代码，不把代码内容解析成题目或答案', () => {
  const text = '# 代码\n## 1. [单选题] 输出是什么？\n\n```python\n答案：B\n2. fake\nA. fake\n```\n\n考虑类型。\nA. 第一行\n   第二行\nB. 另一项\n答案：A\n解析：\n```text\n答案：B\n```';
  const q = parseMarkdown(text).questions[0];
  assert.match(q.stem, /答案：B\n2\. fake\nA\. fake/);
  assert.match(q.stem, /考虑类型/);
  assert.equal(q.options[0].text, '第一行\n   第二行');
  assert.match(q.explanation, /```text\n答案：B\n```/);
});

test('未声明题型时从多个答案推断多选', () => {
  assert.equal(parseMarkdown(basic.replace('答案：A', '答案：A / B')).questions[0].type, 'multiple');
});

for (const [label, text, error] of [
  ['空文件', ' \n', /空|内容/],
  ['没有题目', '# 标题\n仅介绍', /题目/],
  ['缺少答案', basic.replace('答案：A\n', ''), /第\s*1\s*题.*答案/],
  ['无效答案', basic.replace('答案：A', '答案：C'), /第\s*1\s*题.*C.*选项/],
  ['答案夹杂未识别文字', basic.replace('答案：A', '答案：A 因为正确'), /第\s*1\s*题.*答案/],
  ['重复选项', basic.replace('B. 数据库', 'A. 数据库'), /第\s*1\s*题.*重复.*A/],
  ['空选项', basic.replace('B. 数据库', 'B.'), /第\s*1\s*题.*B.*空|第\s*1\s*题.*B.*内容/],
  ['只有一个选项', basic.replace('B. 数据库\n', ''), /第\s*1\s*题.*至少.*选项/],
  ['空题干', basic.replace('Python 是什么？', ''), /第\s*1\s*题.*题干/],
  ['单选多个答案', basic.replace('1. Python', '1. [单选] Python').replace('答案：A', '答案：AB'), /第\s*1\s*题.*单选/],
  ['重复答案字段', basic.replace('解析：', '答案：B\n解析：'), /第\s*1\s*题.*答案.*重复|第\s*1\s*题.*重复.*答案/],
  ['第二题损坏', basic + '\n## 2. 缺少答案\nA. 是\nB. 否', /第\s*2\s*题.*答案/],
  ['没有闭合的代码', basic.replace('A. 编程语言', '```\nA. 编程语言'), /代码.*闭合/],
]) test(`拒绝${label}并给出中文修复信息`, () => assert.throws(() => parseMarkdown(text), error));

test('判分使用完全匹配的多选集合，未答计入错题并保留条目契约', () => {
  const questions = parseMarkdown(basic + '\n## 2. [多选] 数字\nA. 1\nB. 2\nC. x\n答案：AB\n## 3. 字符串\nA. x\nB. 1\n答案：A').questions;
  const answers = { q1: ['A'], q2: ['B', 'A'] };
  const result = grade(questions, answers);
  assert.deepEqual([result.total, result.correct, result.wrong, result.unanswered, result.score], [3, 2, 1, 1, 67]);
  assert.deepEqual(result.items[2], { question: questions[2], selected: [], correct: false, unanswered: true });
  assert.equal(grade(questions, { q2: ['A'] }).items[1].correct, false);
  assert.equal(grade(questions, { q2: ['A', 'B', 'C'] }).items[1].correct, false);
  assert.deepEqual(answers, { q1: ['A'], q2: ['B', 'A'] });
  assert.equal(grade([], {}).score, 0);
});

test('错题导出包含完整题目、双方答案、解析与 AI 复盘提示', () => {
  const questions = parseMarkdown(basic).questions;
  const output = exportMistakes('自测', grade(questions, { q1: ['B'] }));
  for (const value of ['自测', 'Python 是什么？', 'A. 编程语言', 'B. 数据库', '我的答案：B', '正确答案：A', 'Python 是编程语言。', '复盘']) assert.ok(output.includes(value), value);
  assert.match(exportMistakes('自测', grade(questions, {})), /未作答/);
  assert.match(exportMistakes('自测', grade(questions, { q1: ['A'] })), /没有错题|全部答对/);
});

test('五题示例能够导入且示例文件与下载内容一致', () => {
  assert.equal(parseMarkdown(core.sampleMarkdown).questions.length, 5);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'examples', '示例试卷.md'), 'utf8'), core.sampleMarkdown);
});

test('普通浏览器脚本导出 QuizCore，不依赖 Node', () => {
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(corePath, 'utf8'), browser);
  assert.equal(browser.window.QuizCore.parseMarkdown(basic).questions.length, 1);
});

test('支持第1题括号题型、标题级字段、全角选项句点', () => {
  const paper = parseMarkdown('# 试卷\n## 第1题（单选题）\n题目：选择语言\nA．Python\nB．SQL\n**答案：** A\n### 题目类型：多选题\n### 题目：选择数字\nA) 1\nB) 2\n### 答案：A；B');
  assert.equal(paper.questions.length, 2);
  assert.equal(paper.questions[0].stem, '选择语言');
  assert.deepEqual(paper.questions[1].answer, ['A', 'B']);
});

test('不将不带编号的额外题目标题悄悄吞进上一题解析', () => {
  assert.throws(() => parseMarkdown(basic + '\n## 下一道题\n题干缺少编号'), /题目标题|编号/);
});

test('保留题干、选项和解析中的 Python 运算符、双下划线与强调标记', () => {
  const text = '# **Python**\n## 1. `2 ** 3` 的值是多少？\n- **A.** `2 ** 3`\n- **B.** `__name__`\n**答案：** A\n**解析：** `2 ** 3` 等于 8，`__name__` 是模块名；**牢记**。';
  const paper = parseMarkdown(text);
  assert.equal(paper.questions[0].stem, '`2 ** 3` 的值是多少？');
  assert.equal(paper.questions[0].options[0].text, '`2 ** 3`');
  assert.equal(paper.questions[0].options[1].text, '`__name__`');
  assert.equal(paper.questions[0].explanation, '`2 ** 3` 等于 8，`__name__` 是模块名；**牢记**。');
});

test('解析中的编号步骤不会变成新题，但无标题编号真题仍被识别', () => {
  const text = '# 试卷\n## 1. 测试\nA. 是\nB. 否\n答案：A\n解析：有两个原因：\n1. 条件成立\n2. 定义符合\n\n2. 第二题\nA. 是\nB. 否\n答案：B';
  const { questions } = parseMarkdown(text);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].explanation, '有两个原因：\n1. 条件成立\n2. 定义符合');
  assert.equal(questions[1].stem, '第二题');
});

test('保留题干与选项内部的编号列表', () => {
  const text = '# 试卷\n## 1. 按步骤思考\n1. 初始化\n2. 执行操作\nA. 采用以下步骤\n1. 读取\n2. 写入\nB. 跳过\n答案：A';
  const q = parseMarkdown(text).questions[0];
  assert.equal(q.stem, '按步骤思考\n1. 初始化\n2. 执行操作');
  assert.equal(q.options[0].text, '采用以下步骤\n1. 读取\n2. 写入');
});

test('题型字段可以出现在编号题目标题之前', () => {
  const q = parseMarkdown('# 试卷\n题目类型：多选题\n## 1. 第一题\nA. x\nB. y\n答案：A').questions[0];
  assert.equal(q.stem, '第一题');
  assert.equal(q.type, 'multiple');
});

test('支持整行加粗的元数据，同时保留字段值中的运算符和双下划线', () => {
  for (const marker of ['**', '__']) {
    const text = `# Python\n${marker}题目类型：单选题${marker}\n${marker}题目：\`2 ** 3\` 是多少？${marker}\nA. 8\nB. 6\n${marker}答案：A${marker}\n${marker}解析：\`2 ** 3\` 等于 8；\`__name__\` 是模块名。${marker}`;
    const q = parseMarkdown(text).questions[0];
    assert.equal(q.type, 'single');
    assert.equal(q.stem, '`2 ** 3` 是多少？');
    assert.deepEqual(q.answer, ['A']);
    assert.equal(q.explanation, '`2 ** 3` 等于 8；`__name__` 是模块名。');
  }
});
