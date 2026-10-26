# 验证范围

更新日期：2026-10-27。此页用于说明已知的验证范围，不代表覆盖所有系统版本、硬件或安装环境。

## 网页与共用逻辑

已验证 Markdown 解析、单选与多选判分、未答题处理、错题导出、导入去重、历史记录和本地保存。核心与桥接测试使用 Node.js 内置测试运行器；浏览器回归覆盖导入、作答、交卷、重练、导出和页面重载恢复。

题目文本在显示前进行转义，相关测试覆盖 HTML 不被执行的行为。

## Mac 桌面版

- 已在 Apple Silicon Mac 验证应用启动、试卷导入、作答、交卷、退出后恢复、错题导出和复制。
- 通用二进制包含 `arm64` 与 `x86_64`，最低部署目标为 macOS 13；Intel 架构已完成编译，尚未在 Intel 硬件运行验证。
- 原生服务测试覆盖存储、Unicode 内容、写入失败、请求校验、来源隔离与导出文件名校验。
- 应用使用 ad-hoc 签名，未经过 Apple Developer ID 签名和公证。编译或签名结构检查通过，不代表下载到其他电脑后不会触发系统安全提示。

## Windows 便携版

- 已检查官方 Electron 运行文件的 SHA-256、Windows x64 可执行文件结构、ZIP 完整性及所需资源。
- 共用桌面外壳已使用 macOS 对应的 Electron 执行集成测试，覆盖桥接、保存、退出后恢复、判分、导出与复制请求。自动化测试替代了系统保存对话框和剪贴板端点。
- 用户已反馈 Windows 便携版的保存、判分、重启恢复、错题导出和复制功能正常。
- 用户反馈没有记录具体 Windows 版本、硬件与实际测试包哈希，因此只作为该测试电脑上基本功能正常的证据，不代表所有 Windows 环境或每次重新构建的包都已实测。

## Windows 安装程序

安装程序是便携版之外的新交付形式。当前尚未在 Windows 真机执行安装、升级、卸载及快捷方式验证；便携版的人工反馈不能直接覆盖这些步骤。Windows 安装程序与应用未进行发布者代码签名，可能出现 SmartScreen 或未知发布者提示。

后续 Windows 安装验证需要确认：正常安装与启动、快捷方式、已有记录恢复、升级后数据保留、卸载后用户记录保留。只有对应流程在 Windows 实际执行后，才能将其记为已验证。

## 复现测试

在仓库根目录运行：

```sh
node --test tests/*.test.cjs
node --check core.js
node --check app.js
python3 tests/windows-installer.test.py
```

Mac 原生服务测试：

```sh
bash desktop/tests/run.sh
```

可选浏览器回归：`node tests/browser-smoke.cjs`，需要 Playwright 与 Google Chrome。

可选 Electron 集成测试：`node tests/electron-smoke.cjs`，需要 Playwright，并设置 `ELECTRON_EXECUTABLE` 和 `QUIZ_ELECTRON_APP`。运行所使用的平台决定了该测试的运行环境；在 macOS 执行不能替代 Windows 实测。

完整构建与安装说明见 [README](../README.md)、[Mac 使用说明](../desktop-使用说明.md) 与 [Windows 使用说明](../Windows-使用说明.md)。
