import Foundation

struct NativeError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct StateStore {
    let directory: URL
    static func applicationStore() throws -> StateStore {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return StateStore(directory: support.appendingPathComponent("com.local.quiznotebook", isDirectory: true))
    }
    private var stateURL: URL { directory.appendingPathComponent("state.json") }
    func load() throws -> String? {
        guard FileManager.default.fileExists(atPath: stateURL.path) else { return nil }
        let data = try Data(contentsOf: stateURL)
        guard let text = String(data: data, encoding: .utf8) else { throw NativeError(message: "保存的数据不是有效 UTF-8，原文件已保留。") }
        try Self.validate(text)
        return text
    }
    // Called on the main thread: a reply is sent only after the atomic write
    // finishes, so writes cannot overtake each other or be pending at exit.
    func save(_ text: String) throws {
        try Self.validate(text)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data(text.utf8).write(to: stateURL, options: .atomic)
    }
    private static func validate(_ text: String) throws {
        try BridgePolicy.validateText(text)
        guard (try JSONSerialization.jsonObject(with: Data(text.utf8))) is [String: Any] else {
            throw NativeError(message: "保存的数据必须是 JSON 对象。")
        }
    }
}

enum BridgePolicy {
    static let maximumBytes = 32 * 1024 * 1024
    static func validateText(_ text: String) throws {
        guard text.utf8.count <= maximumBytes else { throw NativeError(message: "内容超过 32 MB，请拆分题库后重试。") }
    }
    static func isTrusted(isMainFrame: Bool, url: URL?, scheme: String, host: String, port: Int, index: URL) -> Bool {
        guard isMainFrame, scheme == "file", host.isEmpty, port == 0, let url, url.isFileURL,
              url.host == nil || url.host == "", url.query == nil else { return false }
        return url.standardizedFileURL.path == index.standardizedFileURL.path
    }
    static func exportFilename(_ name: String) -> String {
        let leaf = (name as NSString).lastPathComponent
        let clean = leaf.components(separatedBy: .controlCharacters).joined().replacingOccurrences(of: ":", with: "-")
        let limited = String(clean.prefix(120)).trimmingCharacters(in: .whitespacesAndNewlines)
        return limited.isEmpty || limited == "." || limited == ".." ? "自测本-题库.md" : limited
    }
}

enum BridgeRequest {
    case persist(String), export(String, String), copy(String)
    init(body: Any) throws {
        guard let payload = body as? [String: Any], let action = payload["action"] as? String else {
            throw NativeError(message: "无法识别桌面请求。")
        }
        switch action {
        case "persist":
            guard let data = payload["data"] as? String else { throw NativeError(message: "保存数据格式不正确。") }
            try BridgePolicy.validateText(data)
            self = .persist(data)
        case "export":
            guard let text = payload["text"] as? String, let filename = payload["filename"] as? String else { throw NativeError(message: "导出内容格式不正确。") }
            try BridgePolicy.validateText(text)
            guard filename.utf8.count <= 4096 else { throw NativeError(message: "导出文件名过长。") }
            self = .export(text, BridgePolicy.exportFilename(filename))
        case "copy":
            guard let text = payload["text"] as? String else { throw NativeError(message: "复制内容格式不正确。") }
            try BridgePolicy.validateText(text)
            self = .copy(text)
        default: throw NativeError(message: "不支持的桌面请求。")
        }
    }
}
