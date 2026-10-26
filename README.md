# 自测本 · Quiz Notebook

把 Markdown 选择题变成可以作答、判分和复盘的本地小软件。适合自己整理题库、反复练习，以及保存错题。无需账号，桌面版无需额外安装 Python、Node.js 或浏览器，日常使用不需要联网。

作者：[Chi-cha-zly](https://github.com/Chi-cha-zly)

## 下载与系统要求

请到 [最新版本下载页](https://github.com/Chi-cha-zly/quiz-notebook/releases/latest) 下载 **Assets** 中的文件。GitHub 自动生成的 `Source code` 是源码压缩包，不是桌面安装包。

| 平台 | 下载 | 系统要求与用途 |
| --- | --- | --- |
| Mac 安装镜像 | [QuizNotebook-macOS.dmg](https://github.com/Chi-cha-zly/quiz-notebook/releases/latest/download/QuizNotebook-macOS.dmg) | macOS 13 或更新版本；通用应用，包含 Apple Silicon 与 Intel 架构 |
| Mac 压缩包 | [QuizNotebook-macOS.zip](https://github.com/Chi-cha-zly/quiz-notebook/releases/latest/download/QuizNotebook-macOS.zip) | 与 DMG 内的应用相同，解压后移动到“应用程序” |
| Windows 安装程序 | [QuizNotebook-Windows-x64-Setup.exe](https://github.com/Chi-cha-zly/quiz-notebook/releases/latest/download/QuizNotebook-Windows-x64-Setup.exe) | Windows 10 / 11 x64；使用安装向导 |
| Windows 便携版 | [QuizNotebook-Windows-x64.zip](https://github.com/Chi-cha-zly/quiz-notebook/releases/latest/download/QuizNotebook-Windows-x64.zip) | Windows 10 / 11 x64；完整解压后直接运行 |
| 网页版 | 下载本仓库源码 | 使用支持本地存储的现代浏览器打开 `index.html` |

Mac 版已在 Apple Silicon 电脑验证基本流程；Intel 架构已编译，尚未在 Intel 硬件上实测。Windows 便携版已有用户反馈确认基本功能正常；新增的 Windows 安装程序尚未在 Windows 真机执行安装、升级和卸载验证。当前不提供 Windows ARM64、32 位或 Linux 桌面安装包。完整说明见 [验证范围](docs/verification.md)。

## 功能

- **Markdown 题库**：选择本地 `.md` 文件或拖入文件，支持单选题、多选题、代码块和可选解析。
- **随时继续**：自动保存试卷、已选答案和历史记录，关闭后再次打开可以继续。
- **交卷判分**：显示百分制成绩、正确答案、你的答案和原题解析。
- **错题复盘**：只看错题，或将错题单独组成一份练习；未答题也计入错题。
- **历史作答**：查看之前提交的答案与成绩；重新作答保留已有历史。
- **导出与复制**：导出错题 Markdown，或使用“复制给 AI”复制复盘内容，供自己粘贴到其他工具。
- **本机处理**：题目解析与判分在本机完成，不自动上传题库、答案或成绩。

目前只评分选择题，不支持填空、简答、图片题、数学公式排版、云端同步或多人考试管理。Markdown 展示支持基本文本、加粗、斜体、行内代码和代码块，不是完整的 Markdown 编辑器；题目中的 HTML 不会执行。

## 安装与首次使用

### macOS

1. 下载并打开 `QuizNotebook-macOS.dmg`。
2. 把“自测本”拖到镜像中的 **Applications（应用程序）** 文件夹。
3. 推出安装镜像，从“应用程序”启动“自测本”。
4. 点击“选择本地文件”导入试卷，或打开内置示例。

如果使用 ZIP，先解压，再把“自测本.app”移到“应用程序”。当前应用使用 ad-hoc 签名，尚未经过 Apple Developer ID 签名和公证，其他电脑下载后可能出现安全提示。请核对下载来源，并按系统针对该应用提供的提示处理；不需要关闭系统整体安全检查。详见 [Mac 使用说明](desktop-使用说明.md)。

### Windows

**安装程序：** 下载 `QuizNotebook-Windows-x64-Setup.exe`，运行后按向导安装，再从开始菜单或桌面快捷方式打开“自测本”。

**便携版：** 下载 `QuizNotebook-Windows-x64.zip`，右键选择“全部解压”，进入解压后的文件夹，双击“自测本.exe”。请保留整个文件夹，不能只复制 EXE，也不要在压缩包内运行。

当前 Windows 包未进行发布者代码签名，可能出现 SmartScreen 或未知发布者提示。请确认文件来自本仓库 Release。详见 [Windows 使用说明](Windows-使用说明.md)。

### 网页版

下载源码并解压，直接用 Chrome、Edge 或 Safari 打开 `index.html`。也可以在项目目录运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8765`。这是可选的本地启动方式，Python 只用于运行本地服务器。请保持同一个浏览器、同一个访问地址和端口；双击文件与通过 HTTP 打开使用不同的存储位置。

## 一次练习怎么完成

1. **导入试卷**：点击“选择本地文件”或拖入 Markdown。相同内容的试卷会定位到已有试卷，保留进度。
2. **作答**：单选只能选一项，多选可选多项。左侧可以切换试卷或跳到指定题目。
3. **确认保存**：桌面版保存完成后显示“已保存到本机”；若出现保存失败提示，请先处理磁盘或权限问题。
4. **交卷**：确认提交后显示成绩、答案与解析，同时保存一次历史作答。
5. **复盘**：勾选“只看错题”，点击“只练错题”建立新的练习，或导出错题 Markdown。
6. **再次练习**：“重新作答”清空本次选择，保留已提交的历史；“历史作答”可查看之前的记录。

删除试卷也会删除它在软件中的作答和历史。需要保留的内容请提前备份。

### 判分规则

所有题目权重相同，总分为 `四舍五入（答对题数 ÷ 总题数 × 100）`。

- 单选：所选字母与标准答案相同才得分。
- 多选：必须与正确答案集合完全一致，顺序不影响结果；少选、多选或错选都不得分。
- 未作答：计为错误，同时单独统计未答数量。
- 例如：共 5 题，答对 3 题、答错 1 题、未答 1 题，得分为 60 分，错题合计 2 题。

判分依据是导入文件里的“答案”，软件不会自动判断标准答案本身是否正确。导入前请核对题目与答案。

## Markdown 题目格式

推荐使用 UTF-8 编码的 `.md` 文件。一级标题写试卷名，每题用带编号的二级标题，选项逐行书写，答案只写字母，解析可省略。

````markdown
# 基础练习

## 1. 单选题
题目：下面代码的输出是什么？

```python
print(2 + 3)
```

A. 2
B. 3
C. 5
D. 23

答案：C
解析：两个整数相加得到 5。

## 2. 多选题
题目：下面哪些数是偶数？

A. 2
B. 3
C. 4
D. 5

答案：A、C
解析：2 和 4 可以被 2 整除。
````

也可以直接查看 [完整示例试卷](examples/示例试卷.md)。

格式要点：

- 每题至少两个选项，选项字母不能重复，选项内容不能为空。
- 每题必须有答案，且答案中的字母必须存在于该题选项中。
- 单选题只能有一个正确答案；多选答案推荐写成 `答案：A、C`。
- 不要在答案行附加“因为……”等说明，理由放在下一行的 `解析：` 后。
- 代码块的开始、结束标记需要配对。不要把整份试卷包在一个代码块里。
- 新题推荐写 `## 2. 单选题` 这样的编号标题，避免只写无编号标题导致题目边界不清。
- 不符合格式时会显示导入错误，请按提示定位题目并修改原文件后重试。

如果让其他工具整理题目，可以使用这段格式要求：

> 请输出 UTF-8 Markdown 选择题。一级标题写试卷名称；每题使用“## 1. 单选题”或“## 2. 多选题”这样的编号标题。题干以“题目：”开头；选项按 A.、B.、C.、D. 分行；“答案：”后只写正确选项字母，多选用顿号分隔；“解析：”后写理由。代码放在闭合的代码块里，不要把整份试卷包进代码块。

## 数据保存、备份与恢复

| 版本 | 保存位置 |
| --- | --- |
| Mac 桌面版 | `~/Library/Application Support/com.local.quiznotebook/state.json` |
| Windows 桌面版 | `%APPDATA%\QuizNotebook\state.json` |
| 网页版 | 当前浏览器、当前来源下的 `localStorage` |

桌面记录文件包含已导入试卷、当前作答和历史。网页、Mac、Windows 各自保存数据，不会自动互通。Windows 安装版与便携版在同一系统用户下使用相同的数据目录，切换程序形式不会自动创建新的题库。

### 桌面版完整备份

1. 等待保存完成，彻底退出软件。
2. 打开上表的数据目录，将 `state.json` 复制到自己的备份位置。
3. 同时保留原始 Markdown 题库；重要错题可以另外导出成 Markdown。

**恢复备份：** 先退出软件，再备份当前 `state.json`，然后用自己的备份文件替换数据目录内的同名文件，重新启动检查。建议在相同平台、相同版本中恢复。恢复是整份覆盖，不会合并两份题库或历史；程序中没有一键导入完整备份的入口。

Mac 可在 Finder 的“前往 → 前往文件夹”中输入数据目录；Windows 可在资源管理器地址栏输入 `%APPDATA%\QuizNotebook`。如果目录尚不存在，先启动软件并完成一次保存后退出。

### 网页版与数据边界

网页数据依赖浏览器存储。清除网站数据、使用隐私窗口、更换浏览器、移动本地网页文件或更换访问地址，都可能让旧记录不可见或丢失。当前没有网页题库的一键完整备份/恢复功能；请保留原始 Markdown，并及时导出重要错题。

错题导出用于阅读和复盘，**不是全部题库与历史的完整备份**。更新应用前建议备份；替换程序文件本身与数据目录分离。不要在软件运行时手动修改或替换记录文件。

“复制给 AI”只把文字写入剪贴板，不会调用模型或自动发送。后续粘贴到其他服务的内容由你决定。

## 常见问题

| 问题 | 处理方法 |
| --- | --- |
| 下载后没有可运行程序 | 确认下载的是 Release 的安装包或便携包，而不是 `Source code` |
| Windows 提示缺少 DLL 或文件 | 完整解压便携包并保留全部资源，不要只移动 EXE；必要时重新下载 |
| Windows 或 Mac 显示发布者/安全提示 | 当前包没有平台发布者签名；确认来源后按系统对该文件的提示处理 |
| Mac 打不开应用 | 确认 macOS 至少为 13，把应用复制到“应用程序”后启动；不要直接在安装镜像中长期使用 |
| 导入失败 | 检查题号、选项、必填答案、答案字母是否存在，以及代码块是否闭合 |
| 多选只选了部分正确答案却判错 | 多选采用完全匹配规则，少选也不得分 |
| 找不到之前的记录 | 先确认版本、系统用户、浏览器和访问地址是否与之前一致，再检查对应数据目录 |
| 显示保存失败 | 检查磁盘空间、目录写入权限和浏览器存储设置；保留当前窗口，及时导出可保留的内容 |
| 浏览器不能自动复制 | 使用“导出错题 Markdown”保存文件，再打开复制；浏览器权限可能限制剪贴板 |
| 换电脑后没有旧题库 | 不提供自动同步；重新导入原始题库，同平台完整记录可按备份恢复步骤迁移 |

反馈问题可使用 [GitHub Issues](https://github.com/Chi-cha-zly/quiz-notebook/issues)。请说明系统版本、应用版本、复现步骤和看到的错误信息，尽量使用自己编写的最小示例，不要提交私人题库或完整作答记录。

## 开发与构建

### 项目结构

```text
quiz-notebook/
├── index.html                 网页入口
├── app.js                     页面交互、作答与保存
├── core.js                    Markdown 解析、判分与错题导出
├── styles.css                 页面样式
├── examples/                  可公开使用的示例试卷
├── desktop/
│   ├── main.swift             Mac AppKit / WKWebView 界面
│   ├── Services.swift         Mac 存储与桥接服务
│   ├── Info.plist             Mac 应用信息
│   ├── windows/              Windows Electron 外壳与运行时配置
│   └── tests/                Mac 原生服务测试
├── scripts/                   平台构建脚本
├── tests/                     核心、桥接和集成测试
└── docs/verification.md        公开验证范围
```

网页部分使用原生 HTML、CSS、JavaScript，无需前端打包即可运行。Mac 版用 Swift、AppKit 和 WKWebView；Windows 版用 Electron 加载同一份网页逻辑。

### 自动化测试

安装支持内置测试运行器的 Node.js 后，在仓库根目录运行：

```sh
node --test tests/*.test.cjs
node --check core.js
node --check app.js
```

Mac 原生服务测试需要 Apple Command Line Tools：

```sh
bash desktop/tests/run.sh
```

可选浏览器回归测试需要可被 Node.js 加载的 `playwright` 包和已安装的 Google Chrome：

```sh
node tests/browser-smoke.cjs
```

可选 Electron 集成测试同样需要 `playwright`。设置 `ELECTRON_EXECUTABLE` 为本机平台 Electron 可执行文件的路径，`QUIZ_ELECTRON_APP` 为已经封装的 `resources/app` 目录路径，再运行：

```sh
node tests/electron-smoke.cjs
```

该测试运行的是所指定平台的 Electron，不会把 macOS 上的测试变成 Windows 真机验证；系统保存对话框和剪贴板在此自动化测试中使用替代实现。

### 构建 Mac 桌面版

要求 macOS、Apple Command Line Tools，以及系统提供的 Swift、签名和磁盘镜像工具：

```sh
bash scripts/build-macos.sh --dmg
```

默认构建包含 `arm64` 与 `x86_64` 的通用应用；只构建 Apple Silicon 时使用：

```sh
bash scripts/build-macos.sh --arm64-only
```

本地构建生成 `release/自测本.app`、`release/自测本-macOS.zip`，加 `--dmg` 时还生成 `release/自测本-macOS.dmg`。Release 下载使用前面表格中的英文文件名。构建脚本使用 ad-hoc 签名，不会自动完成 Developer ID 签名或公证。

### 构建 Windows 便携版

要求 Python 3.10 或更新版本，仅使用 Python 标准库：

```sh
python3 scripts/build-windows.py
```

脚本按 `desktop/windows/runtime.json` 固定的版本与 SHA-256 下载 Electron 官方 Windows x64 运行时，并核对官方校验清单，再加入应用代码与资源。首次构建需要网络；缓存完整时可使用：

```sh
python3 scripts/build-windows.py --offline
```

本地构建生成 `release/自测本-Windows-x64.zip`，Release 下载名为 `QuizNotebook-Windows-x64.zip`。跨平台封装不需要启动 Windows 程序，不能替代 Windows 上的运行测试。Windows 包保留 Electron、Chromium 及其依赖的 `LICENSE`、`LICENSES.chromium.html` 等第三方许可说明。

### 构建 Windows 安装程序

此脚本在原生 macOS（Apple Silicon 或 Intel）上运行，需要 Python 3.10 或更新版本。构建工具缓存在项目目录中。先按上一节生成 Windows 便携包，再运行以下命令：

```sh
python3 scripts/build-windows-installer.py
python3 tests/windows-installer.test.py
```

构建脚本固定并校验所需工具，输出 `release/QuizNotebook-Windows-x64-Setup.exe`。依赖缓存完整时可加 `--offline`。安装程序使用当前用户的 `%LOCALAPPDATA%\Programs\QuizNotebook` 目录，创建桌面与开始菜单快捷方式，并提供卸载入口；卸载保留 `%APPDATA%\QuizNotebook` 中的记录。安装、升级和卸载仍需要 Windows 真机验证。

版本变更见 [CHANGELOG](CHANGELOG.md)，平台验证结论与限制见 [验证范围](docs/verification.md)。
