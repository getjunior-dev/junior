/**
 * Add a teammate: the one small modal before the chat. It makes the face
 * (name, body shape, colour) and takes one line on what the teammate helps
 * with; everything else (scope, tools, what it sends) Junior asks in chat,
 * where it reads the teammate back and writes the agent file. Nothing is
 * written here: "Continue in chat" starts a thread of its own with the draft
 * as its first message, so the setup talk never lands in Junior's chat.
 *
 * The key is Junior's own shape, so a teammate picks from the others. Orange
 * is never offered: it means "needs you".
 */
import * as Dialog from '@radix-ui/react-dialog'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { useEffect, useState } from 'react'
import { AGENT_FACE, CHAT_COLORS } from '../../../core/junior/agents.js'
import { SHAPES, type Shape } from '../../../core/junior/shapes.js'
import { useChatAgents } from '../chatAgents.js'
import { usePersona } from '../junior.js'
import { useReturnFocus } from '../ui/returnFocus.js'
import { JuniorFace } from './JuniorFace.js'

type Colour = (typeof CHAT_COLORS)[number]

const MATE_SHAPES = SHAPES.filter(([s]) => s !== 'key')

/** Starts that fill the line, for people who'd rather pick than write. */
const ROLES: ReadonlyArray<readonly [label: string, line: string]> = [
  ['Reviewer', 'Reviews my changes and PRs, real bugs only'],
  ['Tester', 'Writes and runs tests for what I change'],
  ['Debugger', 'Reproduces a bug, finds the cause and fixes it'],
]

/** The message Junior gets: the face as picked, the line, and what to do next. */
export function teammateBrief(d: { name: string; shape: Shape; colour: Colour; line: string }): string {
  const name = d.name.trim()
  const line = d.line.trim()
  return [
    'Add a teammate.',
    `- Name: ${name || 'suggest one'}`,
    `- Face: ${d.shape}, ${d.colour} (\`face: ${d.shape}\`, \`color: ${d.colour}\`)`,
    `- Helps with: ${line || 'ask me'}`,
    'Read it back, ask what you still need in one message with a suggested answer each, then write its agent file. End with one line: "<name> is on the team."',
  ].join('\n')
}

export function AddTeammate({ open, onClose, onContinue }: { open: boolean; onClose: () => void; onContinue: (brief: { text: string; title: string }) => void }) {
  const persona = usePersona()
  const agents = useChatAgents()
  const [name, setName] = useState('')
  const [shape, setShape] = useState<Shape>('pebble')
  const [colour, setColour] = useState<Colour>('blue')
  const [line, setLine] = useState('')
  const returnFocus = useReturnFocus(open)

  // Each time it opens: a clean draft, in a shape and colour no teammate wears yet.
  useEffect(() => {
    if (!open) return
    const shapes = new Set(agents.map((a) => a.shape))
    const colours = new Set(agents.map((a) => a.colour))
    setName('')
    setLine('')
    setShape(MATE_SHAPES.find(([s]) => !shapes.has(s))?.[0] ?? 'pebble')
    setColour(CHAT_COLORS.find((c) => !colours.has(AGENT_FACE[c])) ?? 'blue')
    // agents only seed the draft; a list that changes while it's open shouldn't reset it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const face = AGENT_FACE[colour] ?? undefined
  const go = () => {
    onContinue({ text: teammateBrief({ name, shape, colour, line }), title: name.trim() ? `Add ${name.trim()} to the team` : 'Add a teammate' })
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="projOverlay" />
        <Dialog.Content className="uiDialog addMate" aria-describedby={undefined} onCloseAutoFocus={returnFocus}>
          <Dialog.Title asChild>
            <h3>Add a teammate</h3>
          </Dialog.Title>
          <div className="amFace">
            <JuniorFace shape={shape} colour={face} size={96} mood="hello" motion="follow" decorative />
          </div>
          <input
            className="amName"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder={`Name, or let ${persona.name} suggest one`}
            aria-label="Name"
            autoFocus
          />
          <RadioGroup.Root className="jrShapes amShapes" aria-label="Shape" value={shape} onValueChange={(s) => setShape(s as Shape)} orientation="horizontal">
            {MATE_SHAPES.map(([s, label]) => (
              <RadioGroup.Item key={s} value={s} className="shp" title={label} aria-label={label}>
                <JuniorFace shape={s} colour={face} size={34} mood={s === shape ? 'done' : 'hello'} motion="still" decorative />
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <RadioGroup.Root className="amColours" aria-label="Colour" value={colour} onValueChange={(c) => setColour(c as Colour)} orientation="horizontal">
            {CHAT_COLORS.map((c) => (
              <RadioGroup.Item key={c} value={c} className="amSwatch" title={c} aria-label={c} style={{ background: AGENT_FACE[c] ?? undefined }} />
            ))}
          </RadioGroup.Root>
          <textarea
            className="amLine"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go()
            }}
            placeholder="What should it help with?"
            aria-label="What should it help with?"
            rows={2}
          />
          <div className="amRoles">
            <span>Or start from</span>
            {ROLES.map(([label, text]) => (
              <button
                key={label}
                type="button"
                className="amRole"
                onClick={() => {
                  setLine(text)
                  if (!name.trim()) setName(label)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="row">
            <Dialog.Close asChild>
              <button type="button" className="cancel">
                Cancel
              </button>
            </Dialog.Close>
            <button type="button" className="go" onClick={go}>
              Continue in chat
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
