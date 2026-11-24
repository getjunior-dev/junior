/**
 * The setup screen on first run (firstRun.ts): a card over the dotted canvas,
 * one step a page. Header: junior · setup, and Skip setup. Footer: Back, the
 * step dots with "n / N", and Not now. Step 1 is your Junior account
 * (AccountStep); later steps append to FIRST_RUN_STEPS.
 */
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { ChevronLeft } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { AccountField } from '../../../shared/protocol.js'
import { type AccountError, logIn, signUp, skipAccount, useAccount } from '../account.js'
import { type FirstRunStep, pendingSteps } from '../firstRun.js'
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
]

const WASH = wash(4)
const DOT_INKS = ['--dot-wash-top', '--dot-wash-bottom']

/** Open while a step is pending; `onDone` once the last one is answered. */
export function FirstRun({ onDone }: { onDone?: () => void }) {
  const account = useAccount()
  // The steps this run opened with: answering one doesn't renumber the rest.
  const [steps, setSteps] = useState<FirstRunStep[] | null>(null)
  const [at, setAt] = useState(0)
  const [skipping, setSkipping] = useState(false)

  useEffect(() => {
    if (account && steps === null) setSteps(pendingSteps(FIRST_RUN_STEPS, account))
  }, [account, steps])

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
          <div className="frBody">{step.render({ account, next })}</div>
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
            <button type="button" className="frNotNow" disabled={skipping} onClick={() => void skipOne()}>
              Not now
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
