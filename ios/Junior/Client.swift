import Foundation
import Observation

enum ClientError: LocalizedError {
    case unpaired
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .unpaired: return "This phone is no longer paired."
        case .http(let code, let body): return "Your Mac answered \(code). \(body.prefix(200))"
        }
    }
}

/// One paired Mac: the same WebSocket and HTTP API the browser uses (shared/protocol/wire.ts),
/// signed in with the pairing token as a Bearer header. Chats live on the Mac, so a chat
/// started here shows in the browser and the other way round.
@MainActor @Observable
final class JuniorClient {
    enum Conn { case connecting, connected, disconnected }

    struct Paging { var hasEarlier: Bool; var firstSeq: Int?; var loading = false }

    let base: URL
    private let token: String

    private(set) var conn: Conn = .connecting
    private(set) var workspaceId: String?
    private(set) var workspaces: [Workspace] = []
    private(set) var sessions: [SessionSummary] = []
    private(set) var events: [String: [JSON]] = [:]
    private(set) var paging: [String: Paging] = [:]
    private(set) var live: [String: String] = [:]
    /// The teammates and Junior itself, refetched on connect and on a workspace switch.
    private(set) var agents: [ChatAgent] = []
    private(set) var persona = Persona()
    /// A DM this phone just asked for, by agent (nil key = Junior): its screen moves onto it once it exists.
    private var pendingDM: Set<String> = []
    var lastError: String?
    /// The Mac refused the token: the app goes back to the scanner.
    private(set) var unpaired = false
    private var task: URLSessionWebSocketTask?
    private var subscribed: String?
    private var retry: Task<Void, Never>?
    private var attempt = 0
    private var generation = 0
    private let http = URLSession(configuration: .default)

    init?(link: URL) {
        guard var c = URLComponents(url: link, resolvingAgainstBaseURL: false),
              let token = c.queryItems?.first(where: { $0.name == "token" })?.value
        else { return nil }
        c.path = ""
        c.query = nil
        guard let base = c.url else { return nil }
        self.base = base
        self.token = token
        workspaceId = UserDefaults.standard.string(forKey: workspaceKey)
    }

    private var workspaceKey: String { "workspace:\(base.absoluteString)" }
    var workspace: Workspace? { workspaces.first { $0.id == workspaceId } }
    func session(_ id: String) -> SessionSummary? { sessions.first { $0.id == id } }

    // MARK: the team

    /// An agent's DM, its one long chat. nil agent = Junior's.
    func dm(for agent: String?) -> SessionSummary? {
        sessions.filter { $0.isDM && $0.agent == agent }.max { $0.updatedAt < $1.updatedAt }
    }

    /// The threads a DM started, still open: yours first, then working, then the rest; newest first.
    func threads(of dmId: String) -> [SessionSummary] {
        let order: (ThreadState) -> Int = { s in
            switch s { case .you: return 0; case .stopped: return 1; case .working: return 2; case .ready: return 3 }
        }
        return sessions
            .filter { $0.startedBy == dmId && !$0.isDM && !$0.archived }
            .sorted { a, b in
                let (x, y) = (order(ThreadState(a)), order(ThreadState(b)))
                return x != y ? x < y : a.updatedAt > b.updatedAt
            }
    }

    /// How many things under an agent wait on you: its DM and its threads.
    func needsYou(for agent: String?) -> Int {
        guard let dm = dm(for: agent) else { return 0 }
        return (dm.waiting ? 1 : 0) + threads(of: dm.id).filter(\.waiting).count
    }

    /// Something under an agent is running now.
    func working(for agent: String?) -> Bool {
        guard let dm = dm(for: agent) else { return false }
        return dm.running || threads(of: dm.id).contains { ThreadState($0) == .working }
    }

    func chatAgent(_ name: String?) -> ChatAgent? { name.flatMap { n in agents.first { $0.name == n } } }

    /// Who a session talks as, in words: the agent's label, else Junior's name.
    func label(of agent: String?) -> String { chatAgent(agent)?.label ?? persona.name }

    func loadTeam() async {
        if let j = try? await getJSON("/api/library/chat-agents"), j["ok"]?.bool == true {
            agents = j["agents"]?.array?.compactMap(ChatAgent.init) ?? []
        }
        if let j = try? await getJSON("/api/persona"), let p = Persona(j["persona"]) { persona = p }
    }

    /// The first message of an agent's DM: the server makes the DM in the default project.
    func startDM(agent: String?, text: String, images: [ImageAttachment]) {
        pendingDM.insert(agent ?? "")
        var msg: [String: Any] = ["type": "create_session", "title": label(of: agent), "firstMessage": text, "dm": true]
        if let agent { msg["agent"] = agent }
        if !images.isEmpty { msg["images"] = images.map(\.json) }
        send(msg)
    }

    func startingDM(_ agent: String?) -> Bool { pendingDM.contains(agent ?? "") }

    // MARK: socket

    func connect() {
        retry?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        generation += 1
        let gen = generation
        conn = .connecting
        guard var c = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        c.scheme = base.scheme == "https" ? "wss" : "ws"
        c.path = "/ws"
        if let workspaceId { c.queryItems = [URLQueryItem(name: "workspace", value: workspaceId)] }
        guard let url = c.url else { return }
        var req = URLRequest(url: url)
        sign(&req)
        let t = http.webSocketTask(with: req)
        t.maximumMessageSize = 64 * 1024 * 1024
        task = t
        t.resume()
        receive(t, gen)
    }

    /// Back from the background: iOS froze the socket, so start a fresh one unless it is clearly alive.
    func resume() {
        if conn != .connected { connect(); return }
        task?.sendPing { [weak self] error in
            guard error != nil else { return }
            Task { @MainActor in self?.connect() }
        }
    }

    func disconnect() {
        retry?.cancel()
        generation += 1
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func receive(_ t: URLSessionWebSocketTask, _ gen: Int) {
        t.receive { [weak self] result in
            Task { @MainActor in
                guard let self, gen == self.generation else { return }
                switch result {
                case .success(let message):
                    if self.conn != .connected {
                        self.conn = .connected
                        self.attempt = 0
                    }
                    switch message {
                    case .string(let s): self.handle(Data(s.utf8))
                    case .data(let d): self.handle(d)
                    @unknown default: break
                    }
                    self.receive(t, gen)
                case .failure:
                    self.dropped(t, gen)
                }
            }
        }
    }

    private func dropped(_ t: URLSessionWebSocketTask, _ gen: Int) {
        if let r = t.response as? HTTPURLResponse, r.statusCode == 401 { unpaired = true; return }
        if t.closeCode.rawValue == 4401 { unpaired = true; return }
        conn = .disconnected
        attempt += 1
        let delay = min(1.5 * pow(1.6, Double(attempt - 1)), 10)
        retry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, let self, gen == self.generation else { return }
            self.connect()
        }
    }

    private func send(_ msg: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: msg), let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { [weak self] error in
            guard let error else { return }
            Task { @MainActor in self?.lastError = error.localizedDescription }
        }
    }

    private func handle(_ data: Data) {
        guard let frame = try? JSONDecoder().decode(JSON.self, from: data), let type = frame["type"]?.string else { return }
        switch type {
        case "hello":
            if let id = frame["workspaceId"]?.string {
                workspaceId = id
                UserDefaults.standard.set(id, forKey: workspaceKey)
            }
            workspaces = frame["workspaces"]?.array?.compactMap(Workspace.init) ?? []
            sessions = frame["sessions"]?.array?.compactMap(SessionSummary.init) ?? []
            // A reconnect leaves the open chat stale: ask for it again.
            if let s = subscribed { sendSubscribe(s) }
            Task { await loadTeam() }
        case "sessions":
            sessions = frame["sessions"]?.array?.compactMap(SessionSummary.init) ?? []
        case "session_created":
            guard let s = SessionSummary(frame["session"]) else { return }
            if !sessions.contains(where: { $0.id == s.id }) { sessions.append(s) }
            if s.isDM { pendingDM.remove(s.agent ?? "") }
        case "session_deleted":
            guard let id = frame["sessionId"]?.string else { return }
            sessions.removeAll { $0.id == id }
            events[id] = nil
        case "history":
            guard let id = frame["sessionId"]?.string else { return }
            events[id] = frame["events"]?.array ?? []
            if let more = frame["hasEarlier"]?.bool {
                paging[id] = Paging(hasEarlier: more, firstSeq: frame["firstSeq"]?.number.map { Int($0) })
            } else {
                paging[id] = nil
            }
            live[id] = nil
        case "session_events_page":
            guard let id = frame["sessionId"]?.string, var p = paging[id] else { return }
            let older = frame["events"]?.array ?? []
            events[id] = older + (events[id] ?? [])
            p.hasEarlier = frame["hasEarlier"]?.bool ?? false
            p.firstSeq = frame["firstSeq"]?.number.map { Int($0) }
            p.loading = false
            paging[id] = p
        case "session_event":
            guard let id = frame["sessionId"]?.string, let ev = frame["event"] else { return }
            apply(id, ev)
        case "create_failed", "error":
            lastError = frame["message"]?.string
            if type == "create_failed" { pendingDM = [] }
        default:
            break
        }
    }

    private func apply(_ id: String, _ ev: JSON) {
        let msg = ev["message"]
        let sub = (msg?["parent_tool_use_id"]?.string ?? "").isEmpty == false
        if ev["kind"]?.string == "sdk", msg?["type"]?.string == "stream_event" {
            let e = msg?["event"]
            if !sub, e?["type"]?.string == "content_block_delta", e?["delta"]?["type"]?.string == "text_delta",
               let text = e?["delta"]?["text"]?.string {
                live[id, default: ""] += text
            }
            return
        }
        // The committed assistant message supersedes what was streaming.
        if ev["kind"]?.string == "sdk", msg?["type"]?.string == "assistant", !sub { live[id] = nil }
        if events[id] != nil { events[id]?.append(ev) }
    }

    // MARK: chats

    func open(_ id: String) {
        subscribed = id
        sendSubscribe(id)
    }

    func close(_ id: String) {
        if subscribed == id { subscribed = nil }
    }

    private func sendSubscribe(_ id: String) {
        send(["type": "subscribe", "sessionId": id, "paged": true, "limit": 300])
    }

    func loadEarlier(_ id: String) {
        guard var p = paging[id], p.hasEarlier, !p.loading, let first = p.firstSeq else { return }
        p.loading = true
        paging[id] = p
        send(["type": "session_events_before", "sessionId": id, "beforeSeq": first, "limit": 300])
    }

    func say(_ text: String, images: [ImageAttachment], in id: String) {
        var msg: [String: Any] = ["type": "user_message", "sessionId": id, "text": text]
        if !images.isEmpty { msg["images"] = images.map(\.json) }
        send(msg)
    }

    func interrupt(_ id: String) { send(["type": "interrupt", "sessionId": id]) }

    func respond(_ id: String, request: String, behavior: String, answers: [String: String]? = nil) {
        var msg: [String: Any] = ["type": "permission_response", "sessionId": id, "requestId": request, "behavior": behavior]
        if let answers { msg["answers"] = answers }
        send(msg)
    }

    // MARK: workspaces

    func switchWorkspace(_ id: String) {
        guard id != workspaceId else { return }
        workspaceId = id
        UserDefaults.standard.set(id, forKey: workspaceKey)
        sessions = []
        events = [:]
        paging = [:]
        live = [:]
        agents = []
        pendingDM = []
        subscribed = nil
        connect()
    }

    // MARK: http

    private func sign(_ req: inout URLRequest) {
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        // ngrok's free plan puts a warning page in front of browsers; this skips it.
        req.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")
    }

    func get(_ path: String, _ query: [String: String] = [:]) async throws -> Data {
        guard var c = URLComponents(url: base, resolvingAgainstBaseURL: false) else { throw URLError(.badURL) }
        c.path = path
        var items = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        if let workspaceId { items.append(URLQueryItem(name: "workspace", value: workspaceId)) }
        c.queryItems = items.isEmpty ? nil : items
        guard let url = c.url else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        sign(&req)
        let (data, response) = try await http.data(for: req)
        if let h = response as? HTTPURLResponse {
            if h.statusCode == 401 { unpaired = true; throw ClientError.unpaired }
            if h.statusCode >= 400 { throw ClientError.http(h.statusCode, String(data: data, encoding: .utf8) ?? "") }
        }
        return data
    }

    func getJSON(_ path: String, _ query: [String: String] = [:]) async throws -> JSON {
        try JSONDecoder().decode(JSON.self, from: try await get(path, query))
    }
}
