import SwiftUI

/// One thread: a DM handed it work, it reports back there. You can reply here too.
struct ThreadView: View {
    let client: JuniorClient
    let sessionId: String

    var body: some View {
        let t = client.session(sessionId)
        let from = t?.startedBy.flatMap { client.session($0) }
        VStack(spacing: 0) {
            // Who handed it over, under the bar: a scroll view right under the bar lets iOS fold it away.
            HStack(spacing: 6) {
                if from?.isDM == true {
                    AgentFace(client: client, agent: from?.agent, size: 16)
                    Text("Thread · from \(client.label(of: from?.agent))")
                } else {
                    Text("Thread")
                }
                Spacer(minLength: 0)
                if let t { ThreadMark(state: ThreadState(t)); Text(ThreadState(t).words) }
            }
            .font(Theme.sans(12))
            .foregroundStyle(Theme.ash)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .overlay(alignment: .bottom) { Divider().overlay(Theme.hair) }
            ChatView(client: client, sessionId: sessionId, placeholder: "Reply")
        }
        .background(Theme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(t?.title ?? "Thread").font(Theme.sans(16, .medium)).foregroundStyle(Theme.ink).lineLimit(1)
            }
        }
    }
}

/// Where a DM handed work to a thread (start_session) or added to one (message_session):
/// one card per thread, kept current from the session list.
struct ThreadCards: View {
    let client: JuniorClient
    let call: ToolCall
    let running: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if call.name.hasSuffix("__message_session") {
                let name = call.input["name"]?.string ?? ""
                if call.result != nil, !call.isError, let s = client.sessions.first(where: { $0.name == name }) {
                    ThreadCard(client: client, session: s, note: "Added to")
                } else if call.result == nil && running {
                    PendingCard(title: name, words: "Sending…")
                }
            } else if call.result == nil {
                let specs = call.input["sessions"]?.array ?? []
                ForEach(Array(specs.enumerated()), id: \.offset) { _, s in
                    PendingCard(title: s["title"]?.string ?? s["name"]?.string ?? "A thread", words: running ? "Starting…" : "Did not start")
                }
            } else if !call.isError {
                ForEach(Array(Transcript.started(call).enumerated()), id: \.offset) { _, s in
                    if let id = s.id, let t = client.session(id) {
                        ThreadCard(client: client, session: t, note: nil)
                    } else {
                        PendingCard(title: s.title, words: s.error.map { "Did not start: \($0)" } ?? "Not on this Mac any more")
                    }
                }
            }
        }
    }
}

struct ThreadCard: View {
    let client: JuniorClient
    let session: SessionSummary
    let note: String?

    var body: some View {
        let state = ThreadState(session)
        NavigationLink(value: Route.thread(session.id)) {
            HStack(spacing: 10) {
                AgentFace(client: client, agent: session.agent, mood: state == .you ? .needs : state == .working ? .working : .hello, size: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title).font(Theme.sans(14, .medium)).foregroundStyle(Theme.ink).lineLimit(2)
                    HStack(spacing: 6) {
                        ThreadMark(state: state)
                        Text([note, state.words].compactMap { $0 }.joined(separator: " · "))
                            .font(Theme.sans(12))
                            .foregroundStyle(state == .you ? Theme.orange : Theme.ash)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.stone)
            }
            .padding(12)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairStrong, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct PendingCard: View {
    let title: String
    let words: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Theme.sans(14, .medium)).foregroundStyle(Theme.mute).lineLimit(2)
            Text(words).font(Theme.sans(12)).foregroundStyle(Theme.ash)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hair, lineWidth: 1))
    }
}

/// A thread's report in its DM: a quiet line that opens the thread.
struct ReportLine: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(text).font(Theme.sans(13)).foregroundStyle(Theme.mute).multilineTextAlignment(.leading)
            Spacer(minLength: 4)
            Text("Open").font(Theme.sans(12, .medium)).foregroundStyle(Theme.blue)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

/// What another chat sent this one: in a thread, the DM's hand-off. Folded to three lines.
struct RelayedCard: View {
    let text: String
    let from: String
    @State private var open = false

    var body: some View {
        Button { open.toggle() } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text("What \(from) asked").font(Theme.sans(12, .medium)).foregroundStyle(Theme.ash)
                Text(text)
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.body)
                    .lineLimit(open ? nil : 3)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
