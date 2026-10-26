# 自测本 · Windows 版

作者：[Chi-cha-zly](https://github.com/Chi-cha-zly)。适用 Windows 10 / 11 x64（Intel / AMD 64 位）。当前没有 Windows ARM64 或 32 位安装包。

## 下载与版本选择

从 [最新 Release](https://github.com/Chi-cha-zly/quiz-notebook/releases/latest) 下载：

| 文件 | 使用方式 |
| --- | --- |
| `QuizNotebook-Windows-x64-Setup.exe` | 安装向导，创建快捷方式并提供卸载入口 |
| `QuizNotebook-Windows-x64.zip` | 便携版，全部解压后直接运行 |

两种形式包含同一套应用功能。不需要另外安装 Python、Node.js 或浏览器，日常使用不需要联网。当前包未进行发布者代码签名，Windows 可能显示未知发布者或 SmartScreen 提示，请确认下载来源为本仓库 Release。

**验证范围：** 便携版的保存、判分、重启恢复、错题导出和复制已有用户确认；新增安装程序尚未在 Windows 真机执行安装、升级和卸载验证。详见 [验证范围](docs/verification.md)。

## 使用安装程序

1. 下载并运行 `QuizNotebook-Windows-x64-Setup.exe`。
2. 按安装向导操作。应用安装在当前用户目录下，不要求管理员权限。
3. 完成后通过桌面或开始菜单的“自测本”快捷方式启动。
4. 打开内置示例，或导入自己的 Markdown 试卷。

固定程序目录为：

```text
%LOCALAPPDATA%\Programs\QuizNotebook
```

安装程序不提供自选目录。程序目录与作答数据目录分开；下面的备份步骤适用于安装版与便携版。

## 使用便携版

1. 下载 `QuizNotebook-Windows-x64.zip`。
2. 右键选择“全部解压”，放到自己的固定文件夹。
3. 进入解压后的文件夹，双击“自测本.exe”。

请保留整个文件夹，不要只复制 EXE，不要在压缩包内运行。DLL、语言和资源文件都是运行所需内容。

“便携”表示不需要安装向导，记录仍保存在当前 Windows 用户的数据目录中，并不跟着程序文件夹或 U 盘移动。需要换电脑时请单独备份与迁移记录。

## 作答、判分与复盘

- 支持单选与多选，左侧可以切换试卷并定位题目。
- 多选采用完全匹配规则，少选、多选、错选都不得分；未答题计入错题。
- 每题权重相同，交卷后显示百分制成绩与解析，并保存历史。
- “只练错题”生成新的练习；“重新作答”清空本次选择但保留历史。
- “导出错题 Markdown”选择保存位置；“复制给 AI”只复制内容，由你自行粘贴到其他工具，不会自动发送。

题目格式、示例与导入错误处理见 [README](README.md)。

## 数据保存与备份恢复

题库、当前作答和历史保存在：

```text
%APPDATA%\QuizNotebook\state.json
```

在资源管理器地址栏输入 `%APPDATA%\QuizNotebook` 可以打开文件夹。数据属于当前 Windows 系统用户；同一用户的安装版与便携版使用这一份记录，建议不要同时运行两种形式。

**备份：** 等待保存完成，完全退出软件，再复制 `state.json` 到自己的备份位置。同时保留原始 `.md` 题库，重要错题可另行导出。

**恢复：** 退出软件，先备份现有记录，再用自己的备份替换上述目录里的同名文件，重新启动检查。恢复会完整覆盖，不合并两份题库或历史；建议使用相同平台和版本。首次运行但尚未保存时，目录或文件可能尚未创建。

网页、Mac 与 Windows 记录各自独立，不提供自动同步。错题 Markdown 是复盘材料，不能替代包含全部试卷和历史的 `state.json` 备份。不要在运行中手动修改或替换记录文件。

## 更新和卸载

**安装版更新：** 先备份并退出应用，再运行新版本安装程序。更新使用同一个固定程序目录，用户记录保存在独立位置。

**安装版卸载：** 退出应用后，从 Windows 的应用管理页面卸载“自测本”，或运行安装目录里的卸载程序。卸载只处理安装程序登记的应用文件和快捷方式，保留 `%APPDATA%\QuizNotebook` 中的题库与记录；程序目录内额外添加的未知文件可能使文件夹继续保留。

**便携版更新：** 退出应用，把新 ZIP 完整解压到新文件夹后启动，不要只替换 EXE。检查记录正常后再处理旧文件夹。

**便携版移除：** 退出程序后删除解压的程序文件夹。它不会自动清理 `%APPDATA%\QuizNotebook`。只有确定不再需要并已做好备份时，才手动删除这一数据目录。

安装版与便携版共用记录，删除数据目录会影响两者。

## 常见问题

- **缺少 DLL / 启动失败：** 重新完整解压便携包，确认资源文件没有被遗漏，并检查系统为 x64 Windows 10 / 11。
- **安装包提示未知发布者：** 当前没有发布者签名，请核对 Release 下载来源和系统提示。
- **换电脑后没有记录：** 程序文件夹不携带题库；按上述步骤单独迁移备份，或重新导入原始 Markdown。
- **保存失败：** 检查磁盘空间与数据目录权限；保留当前窗口，及时导出重要内容。
- **题目导入失败：** 检查编号标题、至少两个选项、必填答案和闭合的代码块。

## 从源码构建

便携包构建需要 Python 3.10 或更新版本，仅使用标准库。在仓库根目录运行：

```sh
python3 scripts/build-windows.py
```

运行时版本与 SHA-256 固定在 `desktop/windows/runtime.json`。脚本下载 Electron 官方发行文件并核对校验清单，然后封装应用。首次构建需要网络；缓存完整时可加 `--offline`。

安装程序使用独立构建脚本，需要原生 macOS（Apple Silicon 或 Intel）与 Python 3.10 或更新版本：

```sh
python3 scripts/build-windows-installer.py
```

该脚本所需的构建工具及来源由脚本固定与校验，生成 `release/QuizNotebook-Windows-x64-Setup.exe`。依赖缓存完整时可使用 `python3 scripts/build-windows-installer.py --offline`。跨平台封装不会执行 Windows 安装程序，不替代真机验证。

开发测试：

```sh
node --test tests/*.test.cjs
python3 tests/windows-installer.test.py
```

可选 Electron 集成测试为 `tests/electron-smoke.cjs`，需要 Playwright，并通过 `ELECTRON_EXECUTABLE` 指定本机平台的 Electron，通过 `QUIZ_ELECTRON_APP` 指定封装后的 `resources/app` 目录。

Windows 包内保留 Electron / Chromium 等第三方许可文件，以及运行时来源和文件校验信息。重新分发构建结果时请保留这些文件。
