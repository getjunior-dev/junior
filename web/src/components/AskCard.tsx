import { memo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PermissionBehavior, QuestionAnswers } from '../../../shared/protocol.js'
import { OTHER, SKIPPED, isRecommended, preselected, shownAnswer, shownLabel, type AskQuestion } from '../askQuestions.js'
import { useScopedAgent } from '../chatAgents.js'
import type { TranscriptItem } from '../transcript.js'
import { JuniorLabel } from './JuniorLabel.js'

type Permission = Extract<TranscriptItem, { kind: 'permission' }>

type Props = {
  item: Permission
  questions: AskQuestion[]
  onRespond: (requestId: string, behavior: PermissionBehavior, answers?: QuestionAnswers) => void
  /** Junior is the one asking (false: a subagent, named by the wrapper around the card) */
  junior?: boolean
}

/**
 * An `AskUserQuestion` prompt, one question at a time: the question, its
 * options as radio rows with the recommended one already picked, a pager in
 * the header, then a Review page before the answers go back as the tool's
 * answer. A single question skips the pager and the Review page.
 */
export const AskCard = memo(function AskCard({ item, questions, onRespond, junior = true }: Props) {
  const { name } = useScopedAgent()
  const n = questions.length
  const single = n === 1
  // Keyed by question index: the tool allows two questions with the same text.
  const [step, setStep] = useState(0) // n is the Review page
  const [picked, setPicked] = useState<Record<number, string[]>>(() => Object.fromEntries(questions.map((q, qi) => [qi, preselected(q)])))
  const [mine, setMine] = useState<Record<number, boolean>>({})
  const [skipped, setSkipped] = useState<Record<number, boolean>>({})
  const [other, setOther] = useState<Record<number, string>>({})
  const [cursor, setCursor] = useState(-1)
  const card = useRef<HTMLDivElement>(null)
  const pickTag = junior ? `${name}'s pick` : 'Recommended'

  const answerFor = (qi: number): string => {
    if (skipped[qi]) return SKIPPED
    const labels = (picked[qi] ?? []).map((l) => (l === OTHER ? other[qi]?.trim() || '' : l))
    return labels.filter(Boolean).join(', ')
  }
  const complete = questions.every((_, qi) => answerFor(qi) !== '')
  const review = !single && step === n

  const go = (to: number) => {
    setStep(Math.max(0, Math.min(to, single ? 0 : n)))
    setCursor(-1)
    card.current?.focus()
  }

  const submit = () => {
    if (!complete) return
    const answers: QuestionAnswers = {}
    questions.forEach((q, qi) => {
      answers[q.question] = answerFor(qi)
    })
    onRespond(item.id, 'allow', answers)
  }

  const next = () => {
    if (single || review) return submit()
    if (answerFor(step) !== '') go(step + 1)
  }

  const skip = () => {
    setSkipped((p) => ({ ...p, [step]: true }))
    go(step + 1)
  }

  const pick = (k: number) => {
    const q = questions[step]
    const label = q && [...q.options.map((o) => o.label), OTHER][k]
    if (!q || !label) return
    const at = step
    setSkipped((p) => ({ ...p, [at]: false }))
    setMine((p) => ({ ...p, [at]: true }))
    setCursor(k)
    setPicked((prev) => {
      const cur = prev[at] ?? []
      if (!q.multiSelect) return { ...prev, [at]: [label] }
      return { ...prev, [at]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] }
    })
    // A single choice moves on by itself; Other waits for its text, a multi-select for Enter.
    if (label !== OTHER && !q.multiSelect && !single) setTimeout(() => go(at + 1), 140)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      return submit()
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target instanceof HTMLInputElement) {
      if (e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        card.current?.focus()
      }
      return
    }
    const onCard = e.target === card.current
    const count = review ? 0 : questions[step].options.length + 1
    if (count && /^[1-9]$/.test(e.key) && Number(e.key) <= count) {
      e.preventDefault()
      pick(Number(e.key) - 1)
    } else if (count && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const down = e.key === 'ArrowDown'
      setCursor((c) => (c < 0 ? (down ? 0 : count - 1) : (c + (down ? 1 : count - 1)) % count))
    } else if (onCard && count && e.key === ' ' && cursor >= 0) {
      e.preventDefault()
      pick(cursor)
    } else if (onCard && e.key === 'Enter') {
      e.preventDefault()
      next()
    } else if (!single && e.key === 'ArrowLeft') {
      e.preventDefault()
      go(step - 1)
    } else if (!single && e.key === 'ArrowRight' && !review && answerFor(step) !== '') {
      e.preventDefault()
      go(step + 1)
    }
  }

  if (item.resolved) return <ResolvedAsk item={item} questions={questions} junior={junior} />

  const q = review ? null : questions[step]
  const sel = picked[step] ?? []
  const ready = review || single ? complete : answerFor(step) !== ''
  const primary = single ? 'Send answer' : review ? 'Send answers' : step === n - 1 ? 'Review' : 'Next'

  return (
    <div className="perm ask open" data-reload-guard="card" ref={card} tabIndex={0} onKeyDown={onKey}>
      <div className="askHead">
        <div className="q">{junior ? <JuniorLabel mood="needs" say="I’ll wait for your answer"> has a question</JuniorLabel> : 'Asking'}</div>
        {!single && (
          <div className="askPager">
            <button className="btn ghost xs" aria-label="Previous question" disabled={step === 0} onClick={() => go(step - 1)}>
              <ChevronLeft size={15} />
            </button>
            <span>{review ? 'Review' : `${step + 1} of ${n}`}</span>
            <button className="btn ghost xs" aria-label="Next question" disabled={review || answerFor(step) === ''} onClick={next}>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="askBody">
        {q ? (
          <>
            {q.header && <div className="askHeader">{q.header}</div>}
            <div className="askText">{q.question}</div>
            {q.multiSelect && <div className="askNote">Pick any that apply</div>}
            <div className="askOptions" role={q.multiSelect ? 'group' : 'radiogroup'}>
              {[...q.options, { label: OTHER, description: undefined }].map((o, k) => {
                const on = !skipped[step] && sel.includes(o.label)
                const isOther = o.label === OTHER
                return (
                  <div className="askRow" key={o.label}>
                    <button
                      className={`askOption${on ? ' on' : ''}${cursor === k ? ' cursor' : ''}`}
                      role={q.multiSelect ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      onClick={() => pick(k)}
                    >
                      <span className={`askMark${q.multiSelect ? ' box' : ''}`} />
                      <span className="askLabel">{shownLabel(o.label)}</span>
                      {isRecommended(o) ? <span className="askTag">{pickTag}</span> : <kbd className="hint">{k + 1}</kbd>}
                      {o.description && <span className="askDesc">{o.description}</span>}
                    </button>
                    {isOther && on && (
                      <input
                        className="askOther"
                        autoFocus
                        placeholder="Your answer…"
                        value={other[step] ?? ''}
                        onChange={(e) => setOther((p) => ({ ...p, [step]: e.target.value }))}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="askText">{junior ? `Send these to ${name}?` : 'Send these answers?'}</div>
            <div className="askOptions askReview">
              {questions.map((rq, qi) => (
                <div className="askRev" key={qi}>
                  <span className="askRevQ">{rq.header ?? rq.question}</span>
                  <span className="askRevA">
                    {shownAnswer(answerFor(qi))}
                    {!skipped[qi] && <span className={`askTag${mine[qi] ? ' mine' : ''}`}>{mine[qi] ? 'You' : pickTag}</span>}
                  </span>
                  <button className="btn sm" onClick={() => go(qi)}>
                    Change
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="askFoot">
        {/* Denying is still on the table: the reader may want none of the above. */}
        <button className="btn ghost" onClick={() => onRespond(item.id, 'deny')}>
          Don't answer
        </button>
        <span className="grow" />
        {!single && !review && (
          <button className="btn" onClick={skip}>
            Skip
          </button>
        )}
        <button className="btn primary" disabled={!ready} onClick={next}>
          {primary} <kbd className="hint">↵</kbd>
        </button>
      </div>
    </div>
  )
})

function ResolvedAsk({ item, questions, junior }: { item: Permission; questions: AskQuestion[]; junior: boolean }) {
  return (
    <div className="perm ask">
      <div className="askHead">
        <div className="q">{junior ? <JuniorLabel mood="done" say={item.resolved === 'deny' ? 'You left this unanswered' : item.resolved === 'expired' ? 'This expired before you answered' : 'You answered this'}> asked</JuniorLabel> : 'Asked'}</div>
        <span className={`verdict ${item.resolved}`}>
          {item.resolved === 'deny'
            ? '✕ left unanswered'
            : item.resolved === 'expired'
              ? '— expired (session ended before it was answered)'
              : item.answers
                ? '✓ answered'
                : '✓ allowed'}
        </span>
      </div>
      <div className="askBody">
        {questions.map((q, qi) => (
          <div className="askQ" key={qi}>
            <div className="askAsked">{q.question}</div>
            {item.answers?.[q.question] ? <div className="askAnswer">↳ {shownAnswer(item.answers[q.question])}</div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
