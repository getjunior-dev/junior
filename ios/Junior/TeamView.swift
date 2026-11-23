import SwiftUI

/// Where the stack goes: an agent's DM (nil = Junior's), or one thread.
enum Route: Hashable {
    case dm(String?)
    case thread(String)
}

/// The app's home: Junior on top, then every teammate. Each opens its DM.
struct TeamView: View {
    let client: JuniorClient
    var onForget: () -> Void
    @State private var path: [Route] = TeamView.launchRoute()

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                ConnBanner(client: client)
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Your team")
                            .font(Theme.display(30))
                            .foregroundStyle(Theme.ink)
                            .padding(.top, 8)
                            .padding(.bottom, 20)
                        NavigationLink(value: Route.dm(nil)) {
                            MemberRow(client: client, agent: nil, big: true)
                                .padding(16)
                                .background(Theme.card)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairStrong, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        if !client.agents.isEmpty {
                            Text("Agents")
                                .font(Theme.sans(12, .medium))
                                .foregroundStyle(Theme.ash)
                                .padding(.top, 28)
                                .padding(.bottom, 4)
                            ForEach(client.agents) { a in
                                NavigationLink(value: Route.dm(a.name)) {
                                    MemberRow(client: client, agent: a.name, big: false).padding(.vertical, 12)
                                }
                                .buttonStyle(.plain)
                                Divider().overlay(Theme.hair)
                            }
                        } else if client.conn == .connected {
                            Text("No teammates yet. Add one in Junior on your Mac.")
                                .font(Theme.sans(13))
                                .foregroundStyle(Theme.ash)
                                .padding(.top, 24)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
                .refreshable { await client.loadTeam() }
            }
            .background(Theme.canvas)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { WorkspaceMenu(client: client, onForget: onForget) } }
            .navigationDestination(for: Route.self) { r in
                switch r {
                case .dm(let agent): DMView(client: client, agent: agent)
                case .thread(let id): ThreadView(client: client, sessionId: id)
                }
            }
            .onChange(of: client.workspaceId) { _, _ in path = [] }
        }
    }

    /// Debug builds: `-route junior`, `-route <agent>` or `-route thread:<id>` opens there at launch,
    /// for checking the Simulator without taps.
    private static func launchRoute() -> [Route] {
        #if DEBUG
        guard let r = UserDefaults.standard.string(forKey: "route"), !r.isEmpty else { return [] }
        if r.hasPrefix("thread:") { return [.thread(String(r.dropFirst(7)))] }
        return [.dm(r == "junior" ? nil : r)]
        #else
        return []
        #endif
    }
}

/// One member: face, name, what it last said, and whether anything under it waits on you.
struct MemberRow: View {
    let client: JuniorClient
    let agent: String?
    let big: Bool

    var body: some View {
        let a = client.chatAgent(agent)
        let dm = client.dm(for: agent)
        let needs = client.needsYou(for: agent)
        let working = client.working(for: agent)
        let open = dm.map { client.threads(of: $0.id).count } ?? 0
        HStack(alignment: .center, spacing: 12) {
            AgentFace(client: client, agent: agent, mood: needs > 0 ? .needs : working ? .working : .hello, size: big ? 48 : 36)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(client.label(of: agent)).font(Theme.sans(big ? 17 : 15, .medium)).foregroundStyle(Theme.ink)
                    if open > 0 {
                        Text(open == 1 ? "1 thread" : "\(open) threads").font(Theme.mono(11)).foregroundStyle(Theme.ash)
                    }
                }
                Text(dm?.lastLine ?? a?.ask ?? a?.description ?? "Message me any time.")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.mute)
                    .lineLimit(big ? 2 : 1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 6) {
                if let dm { Text(dm.updatedAt.ago).font(Theme.mono(11)).foregroundStyle(Theme.ash) }
                if needs > 0 {
                    Text("\(needs)")
                        .font(Theme.mono(11))
                        .foregroundStyle(Theme.canvas)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Theme.orange)
                        .clipShape(Capsule())
                        .accessibilityLabel("\(needs) waiting on you")
                } else if working {
                    Circle().fill(Theme.blue).frame(width: 7, height: 7).accessibilityLabel("Working")
                }
            }
        }
        .contentShape(Rectangle())
    }
}

/// A member's face: its own colour and shape, else Junior's.
struct AgentFace: View {
    let client: JuniorClient
    let agent: String?
    var mood: Mood = .hello
    var size: CGFloat = 36

    var body: some View {
        let a = client.chatAgent(agent)
        FaceView(colour: a?.colour ?? client.persona.colour, shape: a?.shape ?? client.persona.shape, mood: mood, size: size)
    }
}
