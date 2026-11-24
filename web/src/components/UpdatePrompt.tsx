/**
 * Junior.app's update prompt: a new release is downloaded and waiting. Update
 * now restarts the app onto it; Not now (or Escape) puts it off for a day, and
 * Junior → Restart to Update brings it back sooner. The main process decides
 * when it shows (desktop/src/updater.ts); every page in every window shows the
 * same one, and putting it away in one puts it away in all.
 *
 * Outside Junior.app, or in an older one, this draws nothing.
 */
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { desktopUpdate, useDesktopUpdate } from '../desktop.js'
import { usePersona } from '../junior.js'
import { JuniorFace } from './JuniorFace.js'

export function UpdatePrompt() {
  const update = useDesktopUpdate()
  const persona = usePersona()
  const [restarting, setRestarting] = useState(false)

  // A new prompt (another version, or the same one back) starts clean.
  useEffect(() => setRestarting(false), [update])

  if (!update || !desktopUpdate) return null
  const bridge = desktopUpdate

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !restarting && bridge.later()}>
      <Dialog.Portal>
        <Dialog.Overlay className="projOverlay" />
        <Dialog.Content className="uiDialog updPrompt" aria-describedby="upd-sub">
          <div className="upHead">
            <span className="upDot" aria-hidden />
            <span className="upName">junior</span>
            <span className="upTag">update</span>
          </div>
          <div className="upFace">
            <JuniorFace shape={persona.shape} colour={persona.colour} size={84} mood={restarting ? 'working' : 'hello'} motion="follow" decorative />
          </div>
          <Dialog.Title asChild>
            <h3 className="upTitle">Junior v{update.version} is ready</h3>
          </Dialog.Title>
          <p id="upd-sub" className="upSub">
            Junior restarts to update. Sessions and jobs keep running on your Mac.
          </p>
          {update.notes.length > 0 && (
            <div className="upNotes">
              <div className="upNotesH">What’s new</div>
              <ul>
                {update.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="row">
            <span className="upVer">
              v{update.current} → v{update.version}
            </span>
            <Dialog.Close asChild>
              <button type="button" className="cancel" disabled={restarting}>
                Not now
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="go"
              autoFocus
              disabled={restarting}
              onClick={() => {
                setRestarting(true)
                bridge.install()
              }}
            >
              {restarting ? 'Restarting…' : 'Update now'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
