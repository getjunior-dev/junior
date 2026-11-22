/**
 * A thread's title in its chat header, with its options behind ⋯ on hover:
 * Rename (the title turns into a field in place), Pin, Open in new tab and
 * Delete, the same menu its row has in the Sessions panel.
 */
import { ExternalLink, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../../shared/protocol.js'
import { renamedTo, threadRename, useRenaming } from '../threadRename.js'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu.js'
import { DeleteSessionDialog } from './ContextPanel.js'
import { setThreadPinned } from './PinThread.js'

type Props = {
  session: SessionSummary
  onRename: (sessionId: string, title: string) => void
  onDelete: (sessionId: string) => void
  /** the title's own class: `chName` on a desktop, `chatTitle` on a phone */
  className: string
}

export function ThreadTitle({ session: s, onRename, onDelete, className }: Props) {
  const renaming = useRenaming(s.id)
  const [deleting, setDeleting] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // A rename started elsewhere (the tab's menu) ends when you leave the thread.
  useEffect(() => () => {
    if (threadRename.current() === s.id) threadRename.end()
  }, [s.id])
  useEffect(() => {
    if (!renaming) return
    input.current?.focus()
    input.current?.select()
  }, [renaming])

  const finish = (typed?: string) => {
    threadRename.end()
    const next = typed === undefined ? undefined : renamedTo(typed, s.title)
    if (next) onRename(s.id, next)
  }

  return (
    <>
      {renaming ? (
        <input
          ref={input}
          className="renameInput chRename"
          aria-label="Thread title"
          defaultValue={s.title}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(e.currentTarget.value)
            else if (e.key === 'Escape') {
              e.stopPropagation()
              finish()
            }
          }}
          onBlur={(e) => finish(e.currentTarget.value)}
        />
      ) : (
        <span className={className} title={s.title} onDoubleClick={() => threadRename.start(s.id)}>
          <b>{s.title}</b>
        </span>
      )}
      {!renaming && (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="iconBtn chMenu" aria-label={`Options for ${s.title}`} title="Thread options">
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
          </MenuTrigger>
          {/* Rename puts focus in the field; closing the menu must not take it back to ⋯. */}
          <MenuContent align="start" onCloseAutoFocus={(e) => threadRename.current() === s.id && e.preventDefault()}>
            <MenuItem onSelect={() => threadRename.start(s.id)}>
              <Pencil size={14} aria-hidden="true" />
              Rename
            </MenuItem>
            <MenuItem onSelect={() => setThreadPinned(s.id, !s.pinned)}>
              {s.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
              {s.pinned ? 'Unpin' : 'Pin to top'}
            </MenuItem>
            <MenuItem asChild>
              <a href={`#${s.id}`} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Open in new tab
              </a>
            </MenuItem>
            <MenuSeparator />
            <MenuItem className="danger" onSelect={() => setDeleting(true)}>
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      <DeleteSessionDialog
        session={deleting ? s : null}
        focusAfterDelete={() => document.querySelector<HTMLElement>('#composer textarea, textarea')?.focus()}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          onDelete(s.id)
        }}
      />
    </>
  )
}
