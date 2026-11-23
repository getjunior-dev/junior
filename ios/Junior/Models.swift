import Foundation

struct Workspace: Identifiable, Equatable {
    let id: String
    let name: String
    let color: String
    let isDefault: Bool

    init?(_ j: JSON) {
        guard let id = j["id"]?.string else { return nil }
        self.id = id
        name = j["name"]?.string ?? id
        color = j["color"]?.string ?? "#80b2f6"
        isDefault = j["isDefault"]?.bool ?? false
    }
}

struct SessionSummary: Identifiable, Equatable {
    let id: String
    let title: String
    let cwd: String
    let projectId: String?
    /// starting | idle | running | error
    let status: String
    let kind: String?
    let pinned: Bool
    let waiting: Bool
    let waitingOn: String?
    let updatedAt: Date
    let model: String?

    init?(_ j: JSON?) {
        guard let j, let id = j["id"]?.string else { return nil }
        self.id = id
        title = j["title"]?.string ?? "Untitled"
        cwd = j["cwd"]?.string ?? ""
        projectId = j["projectId"]?.string
        status = j["status"]?.string ?? "idle"
        kind = j["kind"]?.string
        pinned = j["pinned"]?.bool ?? false
        waiting = j["waiting"]?.bool ?? false
        waitingOn = j["waitingOn"]?.string
        updatedAt = Date(timeIntervalSince1970: (j["updatedAt"]?.number ?? 0) / 1000)
        model = j["model"]?.string
    }

    /// Chats only: job runs and brief runs stay on the Mac.
    var isChat: Bool { kind == nil || kind == "chat" }
    var running: Bool { status == "running" || status == "starting" }
    var folder: String { (cwd as NSString).lastPathComponent }
}

/// An image riding a message inline, as the wire's ImageAttachment.
struct ImageAttachment: Equatable {
    let mediaType: String
    let data: String
    var json: [String: Any] { ["mediaType": mediaType, "data": data] }
}
