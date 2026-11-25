/**
 * The setup screen on first run (firstRun.ts): a card over the dotted canvas,
 * one step a page. Header: junior · setup, and Skip setup. Footer: Back, the
 * step dots with "n / N", and Not now. Step 1 is your Junior account
 * (AccountStep). On a Mac that never ran Junior, the tour follows: what
 * Junior is (MeetStep), its team and how a hand-off goes (TeamStep), and
 * what it can see here, handed to Junior's first message to set up in chat
 * (SetupStep). No form fields past the account: setup is a conversation.
 */
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowRight, ChevronLeft, Plus } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { AccountField, JuniorDayResponse, JuniorSeen, ProjectSuggestionsResponse } from '../../../shared/protocol.js'
import { type AccountError, logIn, signUp, skipAccount, useAccount } from '../account.js'
import { useChatAgents } from '../chatAgents.js'
import { type FirstRunStep, markToured, pendingSteps, tourPending, useToured } from '../firstRun.js'
import { useOnboarded, useWorkspaces } from '../hooks.js'
import { usePersona } from '../junior.js'
import { Dots, wash } from '../ui/Dots.js'
import { JuniorFace } from './JuniorFace.js'

export const FIRST_RUN_STEPS: readonly FirstRunStep[] = [
  {
    id: 'account',
    pending: ({ account }) => account.status === 'none',
    render: ({ next }) => <AccountStep onDone={next} />,
    skip: skipAccount,
  },
  { id: 'meet', pending: tourPending, render: () => <MeetStep />, skip: markToured, advance: 'Continue' },
  { id: 'team', pending: tourPending, render: () => <TeamStep />, skip: markToured, advance: 'Continue' },
  {
    id: 'setup',
    pending: tourPending,
    render: ({ next, navigate }) => (
      <SetupStep
        onChat={() => {
          void markToured()
          navigate('/junior/needs')
          next()
        }}
      />
    ),
    skip: markToured,
  },
]

const WASH = wash(4)
const DOT_INKS = ['--dot-wash-top', '--dot-wash-bottom']

/** Open while a step is pending; `onDone` once the last one is answered. */
export function FirstRun({ onDone, navigate }: { onDone?: () => void; navigate: (to: string) => void }) {
  const account = useAccount()
  const onboarded = useOnboarded()
  const toured = useToured()
  // the daemon's hello carries onboarded: until it lands the tour can't tell
  const hello = useWorkspaces().length > 0
  // The steps this run opened with: answering one doesn't renumber the rest.
  const [steps, setSteps] = useState<FirstRunStep[] | null>(null)
  const [at, setAt] = useState(0)
  const [skipping, setSkipping] = useState(false)

  useEffect(() => {
    if (account && hello && steps === null) setSteps(pendingSteps(FIRST_RUN_STEPS, { account, onboarded, toured }))
  }, [account, hello, onboarded, toured, steps])

  if (!account || !steps || at >= steps.length) return null
  const step = steps[at]
  const next = () => {
    if (at + 1 >= steps.length) onDone?.()
    setAt(at + 1)
  }
  const skipRest = async () => {
    setSkipping(true)
    for (const s of steps.slice(at)) await s.skip()
    setSkipping(false)
    setAt(steps.length)
    onDone?.()
  }
  const skipOne = async () => {
    setSkipping(true)
    await step.skip()
    setSkipping(false)
    next()
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="frOverlay">
          <Dots className="frDots" sampler={WASH} inks={DOT_INKS} />
        </Dialog.Overlay>
        <Dialog.Content
          className="frCard"
          aria-describedby="fr-sub"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <header className="frHead">
            <span className="frDot" aria-hidden />
            <span className="frName">junior</span>
            <span className="frTag">setup</span>
            <button type="button" className="frSkip" disabled={skipping} onClick={() => void skipRest()}>
              Skip setup
            </button>
          </header>
          <div className="frBody" key={step.id}>
            {step.render({ account, next, navigate })}
          </div>
          <footer className="frFoot">
            <span className="frBack">
              {at > 0 && (
                <button type="button" className="frLink" onClick={() => setAt(at - 1)}>
                  <ChevronLeft size={15} aria-hidden /> Back
                </button>
              )}
            </span>
            <span className="frPager" aria-label={`Step ${at + 1} of ${steps.length}`}>
              <span className="frDots2" aria-hidden>
                {steps.map((s, i) => (
                  <i key={s.id} className={i === at ? 'on' : i < at ? 'done' : undefined} />
                ))}
              </span>
              {at + 1} / {steps.length}
            </span>
            {step.advance ? (
              <button type="button" className="frNotNow frAdvance" onClick={next}>
                {step.advance} <ArrowRight size={14} aria-hidden />
              </button>
            ) : (
              <button type="button" className="frNotNow" disabled={skipping} onClick={() => void skipOne()}>
                Not now
              </button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Tour 1: what Junior is, in three lines. */
function MeetStep() {
  const persona = usePersona()
  const name = persona.name
  return (
    <div className="frAccount">
      <div className="frFace">
        <JuniorFace shape={persona.shape} colour={persona.colour} size={84} mood="hello" motion="follow" decorative />
      </div>
      <Dialog.Title asChild>
        <h2 className="frTitle">Meet {name}</h2>
      </Dialog.Title>
      <p id="fr-sub" className="frSub">
        {name} is a chat-first engineering agent that runs on your own machine.
      </p>
      <ul className="frRows">
        <li>
          <b>Talk to it like a colleague</b>
          <span>Hand over work in one line. It asks only what it can’t look up.</span>
        </li>
        <li>
          <b>It works where your code is</b>
          <span>Your repos, your logins and your own Claude Code, on this Mac.</span>
        </li>
        <li>
          <b>It tells you what needs you</b>
          <span>It watches GitHub, Slack and any MCP source. It says whose turn it is.</span>
        </li>
      </ul>
    </div>
  )
}

/** How a hand-off goes, one short line a step. */
const HANDOFF = ['You hand it off in one line', 'It works in a thread', 'It reports back to you'] as const
/** Teammates the list shows before "and n more". */
const TEAM_SHOWN = 5

/** Tour 2: the team (Junior first, then every chat agent) and how a hand-off goes. */
function TeamStep() {
  const persona = usePersona()
  const agents = useChatAgents()
  const shown = agents.slice(0, TEAM_SHOWN)
  const more = agents.length - shown.length
  return (
    <div className="frAccount">
      <Dialog.Title asChild>
        <h2 className="frTitle">{persona.name} has a team</h2>
      </Dialog.Title>
      <p id="fr-sub" className="frSub">
        Real work goes to threads and named agents. You can message any of them.
      </p>
      <ul className="frTeam">
        <li>
          <JuniorFace shape={persona.shape} colour={persona.colour} size={30} mood="hello" motion="still" decorative />
          <b>{persona.name}</b>
          <span>Your main chat. Hand it anything.</span>
        </li>
        {shown.map((a) => (
          <li key={a.name}>
            <JuniorFace shape={a.shape ?? persona.shape} colour={a.colour ?? persona.colour} size={30} mood="hello" motion="still" decorative />
            <b>{a.label}</b>
            <span>{a.description}</span>
          </li>
        ))}
        <li className="frTeamAdd">
          <i aria-hidden>
            <Plus size={14} />
          </i>
          <b>Add a teammate</b>
          <span>{more > 0 ? `${more} more in the sidebar. Add your own any time.` : 'Any time, from the sidebar.'}</span>
        </li>
      </ul>
      <ol className="frFlow" aria-label="How a hand-off goes">
        {HANDOFF.map((line, i) => (
          <li key={line}>
            <i>{i + 1}</i>
            {line}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** What Junior can see on this Mac, for the setup step: null fields until each read lands. */
type Seen = { seen: JuniorSeen | null; suggested: number | null }

function useSetupSeen(): Seen {
  const [seen, setSeen] = useState<Seen>({ seen: null, suggested: null })
  useEffect(() => {
    let live = true
    fetch('/api/junior?since=0&away=0')
      .then((r) => r.json() as Promise<JuniorDayResponse>)
      .then((b) => live && b.ok && setSeen((s) => ({ ...s, seen: b.day.seen ?? null })))
      .catch(() => {})
    fetch('/api/projects/suggestions')
      .then((r) => r.json() as Promise<ProjectSuggestionsResponse>)
      .then((b) => live && b.ok && setSeen((s) => ({ ...s, suggested: b.suggestions.length })))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return seen
}

/** The connectors as one line: "Slack, Sentry and 2 more". */
export function sourcesLine(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

/** Tour 3: what Junior sees here, then Junior's first message sets it up in chat. */
function SetupStep({ onChat }: { onChat: () => void }) {
  const persona = usePersona()
  const { seen, suggested } = useSetupSeen()
  const sources = seen?.sources.filter((s) => s.connected).map((s) => s.name) ?? null
  const rows: { label: string; on: boolean | null; line: string }[] = [
    {
      label: 'GitHub',
      on: seen ? !!seen.github : null,
      line: !seen ? 'Looking…' : seen.github ? `gh is signed in as @${seen.github}.` : 'gh isn’t signed in. Run gh auth login to add your PRs.',
    },
    {
      label: 'Projects',
      on: suggested === null ? null : suggested > 0,
      line:
        suggested === null
          ? 'Looking…'
          : suggested > 0
            ? `${suggested} ${suggested === 1 ? 'folder' : 'folders'} with recent Claude Code work.`
            : `None found yet. Tell ${persona.name} which folder to use.`,
    },
    {
      label: 'Connectors',
      on: sources ? sources.length > 0 : null,
      line: !sources ? 'Looking…' : sources.length ? `${sourcesLine(sources)} connected.` : 'None connected yet. Any MCP server works.',
    },
  ]
  return (
    <div className="frAccount">
      <div className="frFace">
        <JuniorFace shape={persona.shape} colour={persona.colour} size={84} mood={seen ? 'hello' : 'think'} motion="follow" decorative />
      </div>
      <Dialog.Title asChild>
        <h2 className="frTitle">Set up your workspace</h2>
      </Dialog.Title>
      <p id="fr-sub" className="frSub">
        {persona.name} looked at this Mac first. Next, it offers what to set up, in chat.
      </p>
      <ul className="frRows frSeen">
        {rows.map((r) => (
          <li key={r.label}>
            <b>
              <i className={r.on === null ? 'wait' : r.on ? 'on' : undefined} aria-hidden />
              {r.label}
            </b>
            <span>{r.line}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="frGo frChat" onClick={onChat}>
        Continue in chat <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  )
}

export type AccountMode = 'signup' | 'login'

/** Make an account, or log in to one, on getjunior.dev. */
function AccountStep({ onDone }: { onDone: () => void }) {
  const persona = usePersona()
  const [mode, setMode] = useState<AccountMode>('signup')
  const [busy, setBusy] = useState(false)
  return (
    <div className="frAccount">
      <div className="frFace">
        <JuniorFace shape={persona.shape} colour={persona.colour} size={84} mood={busy ? 'working' : 'hello'} motion="follow" decorative />
      </div>
      <Dialog.Title asChild>
        <h2 className="frTitle">{mode === 'signup' ? 'Make your Junior account' : 'Log in to Junior'}</h2>
      </Dialog.Title>
      <p id="fr-sub" className="frSub">
        The account is for Junior itself. Your code, repos and logins stay on this Mac.
      </p>
      <AccountForm mode={mode} onMode={setMode} onBusy={setBusy} onDone={onDone} />
    </div>
  )
}

/** Create account · Log in, on a hairline card. Also Settings → Account's form. */
export function AccountForm({ mode, onMode, onBusy, onDone }: { mode: AccountMode; onMode: (m: AccountMode) => void; onBusy?: (b: boolean) => void; onDone?: () => void }) {
  const account = useAccount()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<AccountError | null>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setErr(null)
    first.current?.focus()
  }, [mode])

  const host = useMemo(() => {
    try {
      return account ? new URL(account.server).host : 'getjunior.dev'
    } catch {
      return 'getjunior.dev'
    }
  }, [account])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    onBusy?.(true)
    setErr(null)
    const r = mode === 'signup' ? await signUp({ name, email, password }) : await logIn({ email, password })
    setBusy(false)
    onBusy?.(false)
    if (r) setErr(r)
    else {
      setPassword('')
      onDone?.()
    }
  }

  const fieldErr = (f: AccountField) => (err?.field === f ? err.error : null)
  const general = err && !err.field ? err.error : null

  return (
    <Tabs.Root value={mode} onValueChange={(v) => onMode(v as AccountMode)} className="frPanel">
      <Tabs.List className="frModes" aria-label="Account">
        <Tabs.Trigger value="signup" className="frMode">
          Create account
        </Tabs.Trigger>
        <Tabs.Trigger value="login" className="frMode">
          Log in
        </Tabs.Trigger>
      </Tabs.List>
      <form className="frForm" onSubmit={(e) => void submit(e)} noValidate>
        {mode === 'signup' && (
          <label className="frField">
            <span>Name</span>
            <input ref={first} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="What Junior calls you" maxLength={80} />
          </label>
        )}
        <label className="frField">
          <span>Email</span>
          <input
            ref={mode === 'login' ? first : undefined}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={!!fieldErr('email')}
            required
          />
          {fieldErr('email') && <small className="frErr">{fieldErr('email')}</small>}
        </label>
        <label className="frField">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? '10 characters or more' : ''}
            aria-invalid={!!fieldErr('password')}
            required
          />
          {fieldErr('password') && <small className="frErr">{fieldErr('password')}</small>}
        </label>
        {general && <div className="frErr frErrLine">{general}</div>}
        <div className="frSubmitRow">
          <span className="frServer">{host}</span>
          <button type="submit" className="frGo" disabled={busy || !email || !password}>
            {busy ? (mode === 'signup' ? 'Creating…' : 'Logging in…') : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </div>
      </form>
    </Tabs.Root>
  )
}
