import React from 'react'
import { Button } from '../core/Button.jsx'

/** Copy to clipboard with feedback. Falls back to "Select and copy" when the API refuses. */
export function CopyButton({ text, tone = 'ghost', size = 'md' }) {
  const [state, setState] = React.useState('idle')
  React.useEffect(() => {
    if (state === 'idle') return
    const id = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(id)
  }, [state])
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('copied') }
    catch { setState('failed') }
  }
  return (
    <Button tone={state === 'copied' ? 'secondary' : tone} size={size} onClick={copy} aria-live="polite">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : 'Copy'}
    </Button>
  )
}
