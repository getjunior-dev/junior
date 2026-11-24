# Junior.app

A native macOS window over the local junior daemon. The daemon is still the
product: the app finds it, starts it if it isn't running, and shows its UI in a
window of its own. Nothing in `server/` or `core/` is ported. The design and the
`daemon.ts` contract are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Install

```sh
curl -fsSL https://getjunior.dev/install.sh | sh
```

[`install.sh`](../install.sh) downloads `Junior-<version>-mac-<arch>.zip` from
the latest GitHub release, checks the bundle id and the signature, installs to
`/Applications` (or `~/Applications` when that isn't writable), and opens it. A
Junior.app that's already there is quit and replaced, including the Chrome-shim
app the old `junior app install` wrote.

| env | does |
| --- | --- |
| `JUNIOR_VERSION=1.0.4` | install that version instead of the latest |
| `JUNIOR_APP_ZIP=path.zip` | install a local zip, e.g. from `npm run app:build` |
| `JUNIOR_INSTALL_DIR=dir` | install somewhere else |
| `JUNIOR_NO_OPEN=1` | don't open the app afterwards |

Needs macOS 12 or newer, and [Claude Code](https://claude.com/claude-code)
installed and logged in, same as the npm package.

## How it works

- **Attach, else start.** On launch the app asks `GET /api/health` on
  `localhost:5178`. If junior answers (an `npm i -g usejunior` daemon, a
  LaunchAgent, an earlier app launch), the window loads it. If nothing answers,
  it starts the daemon it bundles, detached, with `cli.js start`, the same path
  `junior start` takes, so an installed LaunchAgent is used when there is one.
  If something other than junior holds the port, the app says so and stops.
- **Quitting the app leaves junior running.** Live Claude sessions, terminals
  and jobs belong to the daemon, not the window. Restart it from
  *Junior › Restart junior server…* (or the menu bar icon). That ends live
  sessions, so the app asks first.
- **Bundled runtime.** `Contents/Resources/node` is an official Node 22 binary
  for the app's arch (`node:sqlite`, and the Agent SDK spawns `node` for Claude
  Code). `Contents/Resources/junior` is the `usejunior` package with its
  production `node_modules`. The app version is the root `package.json` version.
- **PATH.** An app opened from Finder gets `/usr/bin:/bin:/usr/sbin:/sbin`, where
  `claude`, `gh` and `git` don't resolve. The app reads `PATH` from your login
  shell once (`$SHELL -ilc`, 5 s timeout, then Homebrew and `~/.local/bin`
  defaults) and puts the bundled `node/bin` first.
- **Port and data.** `JUNIOR_APP_PORT` picks the port (default `5178`), and
  `JUNIOR_HOME` passes through unchanged (default `~/.junior`). Together they
  let you point the app at an isolated daemon without touching prod:

  ```sh
  JUNIOR_APP_PORT=5199 JUNIOR_HOME=/tmp/junior-app /Applications/Junior.app/Contents/MacOS/Junior
  ```

- **Local, no pairing.** The window loads `http://localhost:<port>/`. A loopback
  socket with a loopback `Host` counts as local in `server/remote.ts`.

## Develop

```sh
npm run build                 # at the repo root, once: the app runs ../dist/server/cli.js
cd desktop && npm install && npm start
```

Unpackaged, the app uses the system `node` and the repo's `dist/`. If a dev or
prod daemon is already on the port, it attaches to that one. To exercise the
start path, use a free port and a throwaway home:

```sh
JUNIOR_APP_PORT=5199 JUNIOR_HOME=/tmp/junior-app npm start
```

## Build

```sh
npm run app:build                   # at the repo root, for this Mac's arch
npm run app:build -- --arch x64     # or arm64
```

[`scripts/build.mjs`](scripts/build.mjs) runs the root build, stages the package
with production deps, fetches Node into `.cache/`, packs with electron-builder,
signs (Developer ID when the keychain has one, else ad-hoc), and zips with `ditto`:
`desktop/release/Junior-<version>-mac-<arch>.zip`. Try it with the installer
before a release exists:

```sh
JUNIOR_APP_ZIP=desktop/release/Junior-1.0.4-mac-arm64.zip sh install.sh
```

Releases build both arches in CI ([`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml)):
pushing a `v*` tag builds on macos-15 (arm64) and macos-15-intel (x64), signed
and notarized, waits for `/release` to create the GitHub release, and uploads
the zips and the dmgs (`Junior-mac-<arch>.dmg`, a stable name) to it. The publish
job writes `latest-mac.yml` for the updater. For a tag that already has a
release, run the workflow by hand with that tag.

## Signing, notarizing, updates

Releases are signed with the **Developer ID Application** certificate, with the
hardened runtime (`build/entitlements.mac.plist`), and notarized. CI holds the
certificate and an App Store Connect API key as secrets (the list is at the top
of `desktop.yml`). Locally, `build.mjs` signs with a Developer ID found in the
keychain and notarizes when `APPLE_API_KEY` + `APPLE_API_KEY_ID` +
`APPLE_API_ISSUER` (or `APPLE_KEYCHAIN_PROFILE`) are set. Without a Developer
ID it signs ad-hoc, as before; `JUNIOR_SIGN=adhoc` forces that.

- **Browser download**: `Junior-mac-<arch>.dmg` on the latest release opens
  with no Gatekeeper prompt. Drag Junior to Applications; on first launch the
  app writes the LaunchAgent itself. The `junior` CLI shims still come from
  `install.sh` only.
- **`curl | sh`** works as before.
- **Updates**: a release build checks the latest GitHub release 30s after launch
  and every 4 hours (`src/updater.ts`, electron-updater). It downloads in the
  background, then every page shows the update prompt
  (`web/src/components/UpdatePrompt.tsx`): Update now restarts onto it, Not now
  puts it off for a day (`src/update-prompt.ts`; a newer release asks at once).
  Restart to Update in the menu and the menu-bar icon bring it back, and a
  notification goes up when the app isn't in front. It also installs on the
  next quit. `JUNIOR_UPDATE_PREVIEW=1.2.3` fakes a downloaded release on any
  build, to see the prompt. After the relaunch the app
  restarts the old server when no session is mid-turn. Snapshots
  (`1.0.4-dev.g…`) and the dev app never update. `JUNIOR_NO_UPDATES=1` turns it
  off. Log: `~/Library/Logs/Junior/updates.log`.
- An app that was ad-hoc signed can't auto-update to a Developer ID one
  (Squirrel checks the signature matches). Those installs move over once by
  running the installer or the dmg.

## Uninstall

If the app started the daemon, stop it first: `junior stop`, or without the npm
package:

```sh
/Applications/Junior.app/Contents/Resources/node/bin/node \
  /Applications/Junior.app/Contents/Resources/junior/dist/server/cli.js stop
```

Then quit the app and remove it and its window state:

```sh
osascript -e 'quit app id "sh.usejunior.app"'
rm -rf /Applications/Junior.app ~/Library/Application\ Support/Junior
```

Your inbox, sessions and workspaces live in `~/.junior` and stay.
