import { useState } from 'react'
import { logOut, useAccount } from '../../account.js'
import { type AccountMode, AccountForm } from '../FirstRun.js'
import { Loading, Row, Section } from './shared.js'

/** Settings → Account: who Junior.app is signed in as, Log out, or the sign-in form. */
export function AccountTab() {
  const account = useAccount()
  const [mode, setMode] = useState<AccountMode>('login')
  const [busy, setBusy] = useState(false)
  if (!account) return <Loading />
  const host = (() => {
    try {
      return new URL(account.server).host
    } catch {
      return account.server
    }
  })()

  if (account.status === 'signed-in') {
    const { name, email } = account.account
    return (
      <Section title="Signed in">
        <Row label={name || email} hint={name ? email : undefined}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await logOut()
              setBusy(false)
            }}
          >
            {busy ? 'Logging out…' : 'Log out'}
          </button>
        </Row>
        <p className="hint">
          Your account lives on <span className="mono">{host}</span>. This Mac keeps the session in Junior’s data folder, never in the page.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Not signed in" hint="The account is for Junior itself. Your code, repos and logins stay on this Mac.">
      <div className="setAccountForm">
        <AccountForm mode={mode} onMode={setMode} />
      </div>
    </Section>
  )
}
