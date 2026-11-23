# Junior for iPhone

A native SwiftUI client for the Junior running on your Mac. It does two things: your team, and the
chat with each of them. It speaks the same WebSocket and HTTP API as the browser
(`shared/protocol/wire.ts`), so a DM is the same DM on the Mac and on the phone. No server changes,
no third-party packages.

- **Pair:** scan the QR code in the Mac's top-bar phone popover, or paste its link. The link
  (`<mac>/api/pair?token=...`) is kept in the Keychain; the token rides every request as
  `Authorization: Bearer`. A 401 sends the app back to the scanner. On the same Wi-Fi the link is a
  LAN address; with "Anywhere" on, it is the Mac's ngrok URL.
- **Your team:** the home screen. Junior on top, then every chat agent (`GET /api/library/chat-agents`),
  each with its face, what its DM last said, and how many open threads it has. An orange count means
  something under that agent waits on you; a sky dot means it is working.
- **A DM:** each agent's one long chat (`kind: 'dm'`). Its open threads sit in a strip on top. Where it
  handed work to a thread (`start_session`, `message_session`) a card shows the thread and whose turn
  it is; a thread's report line opens that thread. An agent with no DM yet shows its question and
  starters; the first message makes the DM.
- **A thread:** a session a DM started (`startedBy`). The DM's hand-off shows as "What X asked"; you can
  reply in the thread too.
- In every chat: live streaming, tool calls as one line each (tap for input and result), permission
  prompts, questions and plans to approve, photos, Stop.
- **Workspaces:** the pill at the top left switches; the socket and every request carry `?workspace=`.
- **Background:** iOS freezes the socket; coming back reconnects and the open chat re-subscribes.

Everything else (inbox, jobs, artifacts, plain chats) stays on the Mac.

| File | What |
|---|---|
| `Client.swift` | the connection: socket, reconnects, workspace switch, HTTP, the team (DMs, threads, agents) |
| `Transcript.swift` | the event log folded into rows (the essentials of `web/src/transcript.ts`) |
| `TeamView` | home: Junior and the agents |
| `DMView` · `ThreadView` | a DM with its threads strip; a thread; thread cards and report lines |
| `ChatView` · `PromptCard` · `Composer` | the transcript and the box, shared by both |
| `Face` · `FaceShapes` | the J key and the body shapes; `FaceShapes.swift` is generated (below) |
| `MarkdownText` | block markdown, inline through Foundation's parser |
| `PairView` · `ScannerView` · `Pairing` | pairing and the Keychain |

## Run it on your iPhone

You need Xcode, signed in with your Apple ID (Settings → Accounts). Free signing lasts 7 days.

```sh
open ios/Junior.xcodeproj    # pick your iPhone, ⌘R
```

On the Mac: the phone icon in Junior's top bar → switch on → scan. Same Wi-Fi works as is; away from
home, switch on "Anywhere" (it runs your own `ngrok`).

## Simulator

No camera there, and no taps from a script. Debug builds take launch arguments. The Simulator reaches
the Mac as `localhost`, so any token pairs:

```sh
xcrun simctl launch booted sh.usejunior.junior.phone -pairLink "http://localhost:5188/api/pair?token=sim"
xcrun simctl launch booted sh.usejunior.junior.phone -route junior            # Junior's DM
xcrun simctl launch booted sh.usejunior.junior.phone -route junior:reviewer   # an agent's DM
xcrun simctl launch booted sh.usejunior.junior.phone -route thread:<session-id>
xcrun simctl launch booted sh.usejunior.junior.phone "-workspace:http://localhost:5188" <workspace-id>
```

Build signed (`CODE_SIGN_IDENTITY=-`) so the Keychain works.

## Regenerate

- `ios/project.yml` is the source of the project. After changing it, or adding a Swift file:
  `cd ios && xcodegen generate`.
- Face shapes: after a change to `core/junior/shapes.ts`, run
  `npx tsx ios/scripts/face-shapes.ts > ios/Junior/FaceShapes.swift`.
