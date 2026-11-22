/**
 * Usage, as a page of its own (`#/usage`): what Claude Code has cost on this
 * machine. It used to be a Settings tab; `#/settings/usage` still lands here.
 */
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { UsageTab } from './UsageTab.js'

export function UsagePage() {
  const [nonce, setNonce] = useState(0)
  return (
    <div className="page usagePage">
      <div className="inner">
        <header className="usagePageHead">
          <div>
            <h1 className="prH1">Usage</h1>
            <p className="prSub">What Claude Code has cost on this machine — tokens, spend, and where they went.</p>
          </div>
          <button type="button" className="iconBtn" title="Refresh" aria-label="Refresh" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={13} aria-hidden="true" />
          </button>
        </header>
        <UsageTab refreshNonce={nonce} />
      </div>
    </div>
  )
}
