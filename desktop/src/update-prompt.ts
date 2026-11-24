/**
 * The in-app update prompt as data (desktop/src/updater.ts draws on it, the
 * page draws web/src/components/UpdatePrompt.tsx). Pure, so the snooze rule
 * and the release-notes cut are tested without Electron; time is an argument.
 */

/** What a page shows: the version waiting, the one running, a few lines of what's new. */
export type UpdatePrompt = { version: string; current: string; notes: string[] }

/** "Not now" on a version: when, so it can come back. */
export type Dismissed = { version: string; at: number }

/** "Not now" holds this long; then the same version asks again. A newer one asks at once. */
export const SNOOZE_MS = 24 * 60 * 60 * 1000

/** How many lines of what's new the card shows. */
export const MAX_NOTES = 5

export function shouldPrompt(version: string, dismissed: Dismissed | null, now: number): boolean {
  if (!dismissed || dismissed.version !== version) return true
  return now - dismissed.at >= SNOOZE_MS
}

/** A saved dismissal, or null for anything that isn't one. */
export function parseDismissed(raw: unknown): Dismissed | null {
  if (!raw || typeof raw !== 'object') return null
  const { version, at } = raw as Record<string, unknown>
  return typeof version === 'string' && version && typeof at === 'number' && Number.isFinite(at) ? { version, at } : null
}

/**
 * electron-updater's releaseNotes: the GitHub release body as HTML, an array
 * of { note } per version, or nothing. Bullets win; without any, the first
 * plain lines. Headings and links' markup go, entities are decoded.
 */
export function releaseNoteLines(notes: unknown, max = MAX_NOTES): string[] {
  const html = Array.isArray(notes)
    ? notes.map((n) => (n && typeof n === 'object' && typeof (n as { note?: unknown }).note === 'string' ? (n as { note: string }).note : '')).join('\n')
    : typeof notes === 'string'
      ? notes
      : ''
  if (!html.trim()) return []
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1]))
  let lines = items.filter(Boolean)
  if (!lines.length) {
    const plain = text(html.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '\n').replace(/<(br|\/p|\/div)\s*\/?>/gi, '\n'), true)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^#+\s/.test(l))
    const bullets = plain.filter((l) => /^[-*•]\s+/.test(l)).map((l) => l.replace(/^[-*•]\s+/, ''))
    lines = bullets.length ? bullets : plain
  }
  return lines.slice(0, max).map((l) => (l.length > 140 ? `${l.slice(0, 139).trimEnd()}…` : l))
}

function text(html: string, keepLines = false): string {
  const s = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
  return keepLines ? s.replace(/[ \t]+/g, ' ') : s.replace(/\s+/g, ' ').trim()
}
