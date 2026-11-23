import SwiftUI

/// An agent's DM (nil = Junior's): its open threads on top, then the chat.
/// Before the first message, the agent's question and starters; the first send makes the DM.
struct DMView: View {
    let client: JuniorClient
    let agent: String?

    var body: some View {
        let name = client.label(of: agent)
        Group {
            if let dm = client.dm(for: agent) {
                VStack(spacing: 0) {
                    ThreadStrip(client: client, dmId: dm.id)
                    ChatView(client: client, sessionId: dm.id, placeholder: "Message \(name)")
                }
            } else {
                DMStart(client: client, agent: agent)
            }
        }
        .background(Theme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    AgentFace(client: client, agent: agent, mood: client.needsYou(for: agent) > 0 ? .needs : .hello, size: 24)
                    Text(name).font(Theme.sans(16, .medium)).foregroundStyle(Theme.ink)
                }
            }
        }
    }
}

/// The DM's open threads as chips: whose turn each is, newest first. Hidden when there are none.
struct ThreadStrip: View {
    let client: JuniorClient
    let dmId: String

    var body: some View {
        let threads = client.threads(of: dmId)
        if !threads.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(threads) { t in
                        NavigationLink(value: Route.thread(t.id)) {
                            HStack(spacing: 6) {
                                ThreadMark(state: ThreadState(t))
                                Text(t.title).font(Theme.sans(13)).foregroundStyle(Theme.body).lineLimit(1)
                            }
                            .frame(maxWidth: 220)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Theme.elev)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Theme.hairStrong, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .overlay(alignment: .bottom) { Divider().overlay(Theme.hair) }
        }
    }
}

/// Orange only when it needs you; sky while it works; red when it stopped.
struct ThreadMark: View {
    let state: ThreadState

    var body: some View {
        Circle()
            .fill(state == .you ? Theme.orange : state == .working ? Theme.blue : state == .stopped ? Theme.red : Theme.stone)
            .frame(width: 7, height: 7)
            .accessibilityLabel(state.words)
    }
}

/// A DM before its first message: the face, the agent's question, its starters, the box.
struct DMStart: View {
    let client: JuniorClient
    let agent: String?
    @State private var prefill: String?

    var body: some View {
        let a = client.chatAgent(agent)
        let name = client.label(of: agent)
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
                    AgentFace(client: client, agent: agent, size: 88).padding(.top, 48)
                    Text(a?.ask ?? "Hi, I’m \(name).")
                        .font(Theme.display(26))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.center)
                    if let d = a?.description, !d.isEmpty {
                        Text(d).font(Theme.sans(14)).foregroundStyle(Theme.mute).multilineTextAlignment(.center)
                    }
                    if let starters = a?.starters, !starters.isEmpty {
                        VStack(spacing: 8) {
                            ForEach(starters, id: \.self) { s in
                                Button { prefill = s } label: {
                                    Text(s)
                                        .font(Theme.sans(14))
                                        .foregroundStyle(Theme.body)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 10)
                                        .background(Theme.card)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairStrong, lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 24)
            }
            if client.startingDM(agent) {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small).tint(Theme.ash)
                    Text("Starting…").font(Theme.sans(13)).foregroundStyle(Theme.ash)
                }
                .padding(.bottom, 12)
            }
            Composer(running: false, enabled: client.conn == .connected && !client.startingDM(agent), placeholder: "Message \(name)", onSend: { text, images in
                client.startDM(agent: agent, text: text, images: images)
            }, prefill: prefill)
        }
    }
}
