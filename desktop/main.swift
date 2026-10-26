import AppKit
import WebKit
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var store: StateStore!
    private var indexURL: URL!
    private var terminating = false
    private var pageReady = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            store = try StateStore.applicationStore()
            let initialState = try store.load()
            guard let resources = Bundle.main.resourceURL else { throw NativeError(message: "应用资源缺失，请重新下载应用。") }
            indexURL = resources.appendingPathComponent("web/index.html")
            guard FileManager.default.fileExists(atPath: indexURL.path) else { throw NativeError(message: "应用页面缺失，请重新下载应用。") }
            let encoded = try JSONSerialization.data(withJSONObject: [initialState as Any? ?? NSNull()])
            let arrayLiteral = String(decoding: encoded, as: UTF8.self)
            let script = """
            window.QuizDesktop = {
              initialState: \(arrayLiteral)[0],
              request: function(message) { return window.webkit.messageHandlers.quizDesktop.postMessage(message); }
            };
            """
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
            configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "quizDesktop")
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            webView = WKWebView(frame: .zero, configuration: configuration)
            webView.navigationDelegate = self
            webView.uiDelegate = self
            webView.allowsBackForwardNavigationGestures = false
            window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "自测本"
            window.minSize = NSSize(width: 820, height: 600)
            window.contentView = webView
            window.delegate = self
            window.isReleasedWhenClosed = false
            window.setFrameAutosaveName("QuizNotebookMainWindow")
            window.center()
            buildMenu()
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        } catch {
            let alert = NSAlert()
            alert.messageText = "自测本无法启动"
            alert.informativeText = "\(error.localizedDescription)\n已有数据不会被覆盖。数据位置：~/Library/Application Support/com.local.quiznotebook/state.json"
            alert.runModal()
            NSApp.terminate(nil)
        }
    }

    private func buildMenu() {
        let menu = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let child = NSMenu(title: title)
            item.submenu = child
            menu.addItem(item)
            return child
        }
        let app = submenu("自测本")
        app.addItem(withTitle: "关于自测本", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "隐藏自测本", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(.separator())
        app.addItem(withTitle: "退出自测本", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = submenu("编辑")
        for (title, action, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let view = submenu("显示")
        for (title, selector, key) in [("放大", #selector(zoomIn), "+"), ("缩小", #selector(zoomOut), "-"), ("实际大小", #selector(resetZoom), "0")] {
            let item = view.addItem(withTitle: title, action: selector, keyEquivalent: key)
            item.target = self
        }
        let win = submenu("窗口")
        win.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        NSApp.windowsMenu = win
        NSApp.mainMenu = menu
    }
    @objc private func zoomIn() { webView.pageZoom = min(2, webView.pageZoom + 0.1) }
    @objc private func zoomOut() { webView.pageZoom = max(0.65, webView.pageZoom - 0.1) }
    @objc private func resetZoom() { webView.pageZoom = 1 }

    private func trusted(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        return BridgePolicy.isTrusted(isMainFrame: frame.isMainFrame, url: frame.request.url, scheme: origin.protocol, host: origin.host, port: origin.port, index: indexURL)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard trusted(message.frameInfo) else { replyHandler(nil, "仅允许自测本主页面调用桌面功能。"); return }
        do {
            switch try BridgeRequest(body: message.body) {
            case .persist(let data):
                try store.save(data)
                replyHandler(["saved": true], nil)
            case .copy(let text):
                NSPasteboard.general.clearContents()
                guard NSPasteboard.general.setString(text, forType: .string) else { throw NativeError(message: "剪贴板写入失败，请重试。") }
                replyHandler(["copied": true], nil)
            case .export(let text, let filename):
                guard window.attachedSheet == nil else { throw NativeError(message: "请先完成当前文件对话框。") }
                let panel = NSSavePanel()
                panel.title = "导出 Markdown 题库"
                panel.nameFieldStringValue = filename
                panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]
                panel.canCreateDirectories = true
                panel.beginSheetModal(for: window) { response in
                    guard response == .OK else { replyHandler(["saved": false], nil); return }
                    guard let destination = panel.url else { replyHandler(nil, "未能获取导出位置。"); return }
                    do {
                        try text.write(to: destination, atomically: true, encoding: .utf8)
                        replyHandler(["saved": true], nil)
                    } catch { replyHandler(nil, "导出失败：\(error.localizedDescription)") }
                }
            }
        } catch { replyHandler(nil, error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        guard BridgePolicy.isTrusted(isMainFrame: navigationAction.targetFrame?.isMainFrame == true,
                                     url: url, scheme: url?.scheme ?? "", host: url?.host ?? "",
                                     port: url?.port ?? 0, index: indexURL) else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { pageReady = true }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard trusted(frame), window.attachedSheet == nil else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.title = "选择 Markdown 题库"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText, .plainText]
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard trusted(frame), window.attachedSheet == nil else { completionHandler(); return }
        let alert = NSAlert()
        alert.messageText = "自测本"
        alert.informativeText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard trusted(frame), window.attachedSheet == nil else { completionHandler(false); return }
        let alert = NSAlert()
        alert.messageText = "自测本"
        alert.informativeText = message
        alert.addButton(withTitle: "确认")
        alert.addButton(withTitle: "取消")
        alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let webView, pageReady else { return .terminateNow }
        guard !terminating else { return .terminateCancel }
        guard window.attachedSheet == nil else { NSSound.beep(); return .terminateCancel }
        terminating = true
        webView.callAsyncJavaScript("if (window.QuizDesktop && window.QuizDesktop.flush) { await window.QuizDesktop.flush(); } return true;", arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self else { NSApp.reply(toApplicationShouldTerminate: true); return }
            switch result {
            case .success: NSApp.reply(toApplicationShouldTerminate: true)
            case .failure(let error):
                let alert = NSAlert()
                alert.messageText = "仍有更改未保存"
                alert.informativeText = "\(error.localizedDescription)\n可取消退出后重试保存，或明确放弃未保存的更改。"
                alert.addButton(withTitle: "取消退出")
                alert.addButton(withTitle: "放弃更改并退出")
                alert.beginSheetModal(for: self.window) { response in
                    self.terminating = false
                    NSApp.reply(toApplicationShouldTerminate: response == .alertSecondButtonReturn)
                }
            }
        }
        return .terminateLater
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        return true
    }
}

@main struct QuizNotebook {
    @MainActor static func main() {
        let application = NSApplication.shared
        let appDelegate = AppDelegate()
        application.setActivationPolicy(.regular)
        application.delegate = appDelegate
        application.run()
        withExtendedLifetime(appDelegate) {}
    }
}
