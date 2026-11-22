/**
 * Renaming a thread from where you look at it: the chat header's title, or
 * Rename on its tab's right-click menu, which opens the thread and puts its
 * header title into edit mode. One thread is being renamed at a time.
 */
import { useSyncExternalStore } from 'react'

/** What a rename saves: the trimmed text, or nothing when it is empty or unchanged. */
export function renamedTo(typed: string, current: string): string | undefined {
  const t = typed.trim()
  return t && t !== current ? t : undefined
}

let renaming: string | null = null
const listeners = new Set<() => void>()

function set(id: string | null) {
  if (id === renaming) return
  renaming = id
  for (const fn of listeners) fn()
}

export const threadRename = {
  start: (sessionId: string) => set(sessionId),
  end: () => set(null),
  current: () => renaming,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

/** True while this thread's title is being edited. */
export function useRenaming(sessionId: string): boolean {
  return useSyncExternalStore(threadRename.subscribe, () => renaming === sessionId)
}
