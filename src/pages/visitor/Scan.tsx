import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Scanner } from '../../components/Scanner'
import { api, errorMessage } from '../../lib/api'
import { normaliseManualCode } from '../../../shared/token'
import type { ScanResult } from '../../../shared/model'
import { ScanResultView } from './ScanResult'
import { Notice, Spinner } from '../../components/ui'

export default function Scan() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  const submit = useCallback(async (payload: string) => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const r = await api.scan({ payload })
      setResult(r)
      if (r.status === 'success' && 'vibrate' in navigator) navigator.vibrate?.(18) // §2.4
    } catch (e) {
      setErr(errorMessage(e))
    } finally { setBusy(false) }
  }, [busy])

  const onManual = (e: FormEvent) => {
    e.preventDefault()
    const code = normaliseManualCode(manual)
    if (code.length === 6) void submit(code)
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col bg-navy-deep text-paper">
      <header className="flex items-center justify-between px-5 py-4">
        <Link to="/passport" className="text-sm text-paper/70">← Passport</Link>
        <div className="stamp-text text-gold">Scan a booth</div>
        <span className="w-16" />
      </header>

      {result ? (
        <div className="m-4 rounded-3xl bg-paper text-navy"><ScanResultView result={result} onRetry={() => { setResult(null); setManual('') }} /></div>
      ) : (
        <>
          <Scanner onResult={(t) => void submit(t)} paused={busy} className="mx-4 aspect-[3/4]" />
          {busy && <div className="text-paper/80"><Spinner label="Checking…" /></div>}
          {err && <div className="mx-4 mt-3"><Notice tone="red">{err}</Notice></div>}
          <form onSubmit={onManual} className="mx-4 mt-4 mb-8 rounded-2xl bg-white/5 p-4">
            <label className="stamp-text text-paper/60" htmlFor="manual">Or type the 6-character code under the QR</label>
            <div className="mt-2 flex gap-2">
              <input id="manual" className="field flex-1 bg-white/90 text-center font-mono text-xl tracking-[0.35em] uppercase" maxLength={7} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                value={manual} onChange={(e) => setManual(normaliseManualCode(e.target.value))} placeholder="ABC234" />
              <button className="btn-gold" disabled={normaliseManualCode(manual).length !== 6 || busy}>Stamp</button>
            </div>
          </form>
        </>
      )}
    </main>
  )
}
