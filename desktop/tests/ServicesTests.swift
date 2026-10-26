import Foundation

@main struct ServicesTests {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("quiz-native-tests-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = StateStore(directory: root)
        let first = "{\"banks\":[{\"title\":\"中文题库🍊\"}],\"n\":1}"
        check(try store.load() == nil, "missing state must remain absent")
        try store.save(first)
        check(try StateStore(directory: root).load() == first, "Chinese state must survive restart")
        for n in 2...20 { try store.save("{\"n\":\(n)}") }
        check(try store.load() == "{\"n\":20}", "last completed write must win")
        mustThrow("malformed JSON cannot replace state") { try store.save("{broken") }
        check(try store.load() == "{\"n\":20}")
        mustThrow("oversized state must be rejected") { try store.save(String(repeating: "a", count: BridgePolicy.maximumBytes + 1)) }
        let blocked = root.appendingPathComponent("not-a-directory")
        try Data("file".utf8).write(to: blocked)
        mustThrow("IO failures must not report success") { try StateStore(directory: blocked).save(first) }
        let index = URL(fileURLWithPath: "/Apps/自测本.app/Contents/Resources/web/index.html")
        precondition(BridgePolicy.isTrusted(isMainFrame: true, url: index, scheme: "file", host: "", port: 0, index: index))
        precondition(!BridgePolicy.isTrusted(isMainFrame: false, url: index, scheme: "file", host: "", port: 0, index: index))
        precondition(!BridgePolicy.isTrusted(isMainFrame: true, url: URL(string: "https://example.com/index.html"), scheme: "https", host: "example.com", port: 443, index: index))
        precondition(!BridgePolicy.isTrusted(isMainFrame: true, url: index.deletingLastPathComponent().appendingPathComponent("other.html"), scheme: "file", host: "", port: 0, index: index))
        precondition(!BridgePolicy.isTrusted(isMainFrame: true, url: index, scheme: "https", host: "", port: 0, index: index))
        precondition(!BridgePolicy.isTrusted(isMainFrame: true, url: index, scheme: "file", host: "remote.example", port: 0, index: index))
        precondition(!BridgePolicy.isTrusted(isMainFrame: true, url: URL(string: index.absoluteString + "?source=other"), scheme: "file", host: "", port: 0, index: index))
        precondition(BridgePolicy.exportFilename("../../题库.md") == "题库.md")
        precondition(BridgePolicy.exportFilename("/tmp/x\n.md").contains("\n") == false)
        mustThrow("unknown actions denied") { _ = try BridgeRequest(body: ["action": "read", "path": "/etc/passwd"]) }
        mustThrow("non-string data denied") { _ = try BridgeRequest(body: ["action": "persist", "data": 12]) }
        let request = try BridgeRequest(body: ["action": "export", "text": "中文\n🍊", "filename": "../../题库.md"])
        if case .export(let text, let name) = request { precondition(text == "中文\n🍊" && name == "题库.md") } else { preconditionFailure("wrong action") }
        try Data("corrupt".utf8).write(to: root.appendingPathComponent("state.json"))
        mustThrow("corrupt state must not silently reset") { _ = try store.load() }
        print("PASS: native persistence, Unicode, write failures, request validation, origin isolation, export filenames")
    }
    static func check(_ condition: Bool, _ message: String = "assertion failed") { precondition(condition, message) }
    static func mustThrow(_ message: String, _ operation: () throws -> Void) {
        do { try operation(); fatalError(message) } catch { }
    }
}
