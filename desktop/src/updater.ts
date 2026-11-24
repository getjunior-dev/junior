/**
 * Junior.app updates itself from the GitHub releases: electron-updater reads
 * `latest-mac.yml` off the newest published release (CI writes it, see
 * scripts/update-feed.mjs), downloads the zip for this Mac's arch, checks its
 * sha512, and Squirrel.Mac swaps the bundle in when the app quits.
 *
 * Squirrel only accepts an update signed by the same Developer ID as the
 * running app, so only a release build looks: never an unpackaged dev app, and
 * never a snapshot (its version carries a prerelease label like 1.0.4-dev.g1a2b).
 *
 * The daemon runs from inside the bundle and keeps running across the swap.
 * After the relaunch the app finds it on the old version and restarts it when
 * no session is mid-turn (main.ts `connect`).
 */
import { app, dialog, Notification, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import fs from 'node:fs'
import path from 'node:path'

const { autoUpdater } = electronUpdater

/** How often a running app looks for a new release. */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
/** The first look waits for the window and the daemon to settle. */
const FIRST_CHECK_MS = 30 * 1000

export type UpdateState =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string }
  | { kind: 'ready'; version: string }

type Host = {
  /** The window dialogs attach to (shown first if hidden). */
  window: () => BrowserWindow | null
  /** Called on every state change, so menus can show "Restart to Update". */
  changed: (state: UpdateState) => void
  /** Flush and close everything that would hold the quit up. */
  beforeInstall: () => Promise<void>
}

let host: Host | null = null
let state: UpdateState = { kind: 'off' }
// A check started from the menu answers with a dialog, even "up to date".
let asked = false
let notified = ''

export function updateState(): UpdateState {
  return state
}

export function updatesEnabled(): boolean {
  return app.isPackaged && !app.getVersion().includes('-') && process.env.JUNIOR_NO_UPDATES !== '1'
}

export function startUpdater(h: Host): void {
  host = h
  if (!updatesEnabled()) return
  autoUpdater.logger = fileLogger()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.setFeedURL({ provider: 'github', owner: 'getjunior-dev', repo: 'junior' })

  autoUpdater.on('checking-for-update', () => set({ kind: 'checking' }))
  autoUpdater.on('update-available', (info) => set({ kind: 'downloading', version: info.version }))
  autoUpdater.on('update-not-available', () => {
    set({ kind: 'idle' })
    if (asked) {
      asked = false
      void tell('Junior is up to date.', `You have v${app.getVersion()}, the newest release.`)
    }
  })
  autoUpdater.on('update-downloaded', (info) => {
    set({ kind: 'ready', version: info.version })
    if (asked) {
      asked = false
      void promptInstall()
    } else if (notified !== info.version) {
      notified = info.version
      notify(info.version)
    }
  })
  autoUpdater.on('error', (err) => {
    // A download already done stays ready; anything else goes back to idle.
    if (state.kind !== 'ready') set({ kind: 'idle' })
    if (asked) {
      asked = false
      void tell("Couldn't check for updates.", err?.message ?? String(err), 'warning')
    }
  })

  set({ kind: 'idle' })
  setTimeout(() => void check(), FIRST_CHECK_MS)
  setInterval(() => void check(), CHECK_EVERY_MS)
}

/** Junior → Check for Updates…: always answers. */
export function checkFromMenu(): void {
  if (!updatesEnabled()) {
    void tell(
      'This build of Junior does not update itself.',
      app.isPackaged
        ? `v${app.getVersion()} is a preview build. Install a release from getjunior.dev to get updates.`
        : 'It runs from a checkout. Pull and rebuild instead.',
    )
    return
  }
  if (state.kind === 'ready') return void promptInstall()
  if (state.kind === 'downloading') {
    return void tell(`Junior v${state.version} is downloading.`, 'It will ask to restart when it is ready.')
  }
  asked = true
  void check()
}

/** Ask, then quit and relaunch on the new version. */
export async function promptInstall(): Promise<void> {
  if (state.kind !== 'ready') return
  const { version } = state
  const win = host?.window() ?? undefined
  const opts = {
    type: 'info' as const,
    message: `Junior v${version} is ready.`,
    detail: 'Junior restarts to update. Sessions and jobs keep running on the server.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (response === 0) await install()
}

async function install(): Promise<void> {
  await host?.beforeInstall().catch(() => {})
  // isSilent false, isForceRunAfter true: relaunch on the new version.
  autoUpdater.quitAndInstall(false, true)
}

async function check(): Promise<void> {
  if (state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'ready') return
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // The 'error' event already handled it.
  }
}

function set(next: UpdateState) {
  state = next
  host?.changed(state)
}

function notify(version: string) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: `Junior v${version} is ready`, body: 'Restart Junior to update.' })
  n.on('click', () => void promptInstall())
  n.show()
}

async function tell(message: string, detail: string, type: 'info' | 'warning' = 'info') {
  const win = host?.window() ?? undefined
  const opts = { type, message, detail, buttons: ['OK'] }
  if (win) await dialog.showMessageBox(win, opts)
  else await dialog.showMessageBox(opts)
}

/** ~/Library/Logs/Junior/updates.log: what the updater saw, for "why didn't it update". */
function fileLogger() {
  const file = path.join(app.getPath('logs'), 'updates.log')
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Keep it small: start over past 1 MB.
    if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 1024 * 1024) fs.rmSync(file)
  } catch {
    // logging is best effort
  }
  const write = (level: string) => (msg: unknown) => {
    try {
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${msg instanceof Error ? msg.stack : String(msg)}\n`)
    } catch {
      // best effort
    }
  }
  return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {} }
}
