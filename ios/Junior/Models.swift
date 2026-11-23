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
    /// starting | idle | running | error
    let status: String
    /// chat (nil), dm, job-run, brief, goal, task
    let kind: String?
    /// the chat agent it talks as (`junior:reviewer`); nil = Junior
    let agent: String?
    /// the session that started it: a DM, for a thread
    let startedBy: String?
    /// a DM's latest line, plain text
    let lastLine: String?
    let archived: Bool
    let waiting: Bool
    let waitingOn: String?
    let live: Bool
    let updatedAt: Date

    init?(_ j: JSON?) {
        guard let j, let id = j["id"]?.string else { return nil }
        self.id = id
        title = j["title"]?.string ?? "Untitled"
        cwd = j["cwd"]?.string ?? ""
        status = j["status"]?.string ?? "idle"
        kind = j["kind"]?.string
        agent = j["agent"]?.string
        startedBy = j["startedBy"]?.string
        lastLine = j["lastLine"]?.string
        archived = j["archived"]?.bool ?? false
        waiting = j["waiting"]?.bool ?? false
        waitingOn = j["waitingOn"]?.string
        live = j["live"]?.bool ?? false
        updatedAt = Date(timeIntervalSince1970: (j["updatedAt"]?.number ?? 0) / 1000)
    }

    var isDM: Bool { kind == "dm" }
    var running: Bool { status == "running" || status == "starting" }
}

/// One teammate from `GET /api/library/chat-agents` (core/junior/agents.ts ChatAgent).
struct ChatAgent: Identifiable, Equatable {
    /// what a session stores: `junior:reviewer`
    let name: String
    /// "Reviewer"
    let label: String
    let description: String
    /// `#rrggbb`, or nil to wear Junior's
    let colour: String?
    /// a body shape (core/junior/shapes.ts), or nil to wear Junior's
    let shape: String?
    /// its question on a new DM ("What's broken?")
    let ask: String?
    let starters: [String]

    var id: String { name }

    init?(_ j: JSON) {
        guard let name = j["name"]?.string else { return nil }
        self.name = name
        label = j["label"]?.string ?? name
        description = j["description"]?.string ?? ""
        colour = j["colour"]?.string
        shape = j["shape"]?.string
        ask = j["ask"]?.string
        starters = j["starters"]?.array?.compactMap(\.string) ?? []
    }
}

/// Junior as the user named and drew it (`GET /api/persona`).
struct Persona: Equatable {
    var name = "Junior"
    var colour = "#a9cdfc"
    var shape = "key"

    init() {}
    init?(_ j: JSON?) {
        guard let j else { return nil }
        name = j["name"]?.string ?? name
        colour = j["colour"]?.string ?? colour
        shape = j["shape"]?.string ?? shape
    }
}

/// Whose turn a thread is, as core/junior/threads.ts threadState says it.
enum ThreadState {
    case you, working, stopped, ready

    init(_ s: SessionSummary) {
        if s.waiting { self = .you } else if s.running || s.live { self = .working } else if s.status == "error" { self = .stopped } else { self = .ready }
    }

    var words: String {
        switch self {
        case .you: return "Needs you"
        case .working: return "Working"
        case .stopped: return "Stopped"
        case .ready: return "Ready for you"
        }
    }
}

/// An image riding a message inline, as the wire's ImageAttachment.
struct ImageAttachment: Equatable {
    let mediaType: String
    let data: String
    var json: [String: Any] { ["mediaType": mediaType, "data": data] }
}
