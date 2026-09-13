import { useCallback, useState, type FormEvent } from 'react'
import { Scanner } from '../../components/Scanner'
import { api, errorMessage } from '../../lib/api'
import { useLocale } from '../../lib/locale'
import { normaliseManualCode } from '../../../shared/token'
import type { ScanResult } from '../../../shared/model'
import { ScanResultView } from './ScanResult'
import { BackLink, Notice, Spinner } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'
import { useOnline } from '../../lib/useOnline'
import { setServerTime } from '../../lib/serverClock'

export default function Scan() {
  const { t } = useLocale()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const online = useOnline()
  const [manual, setManual] = useState('')

  const submit = useCallback(async (payload: string) => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const r = await api.scan({ payload })
      // A stamp is the first thing most visitors do, so this is usually where the passport
      // learns what the server thinks the time is.
      if (r.status === 'success') setServerTime(r.serverTime)
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
    <><FestivalBackdrop hills={false} /><main className="relative mx-auto flex min-h-full max-w-md flex-col text-ink">
      <header className="flex items-center justify-between gap-2 px-5 py-4">
        <BackLink to="/passport">{t('pp.passport')}</BackLink>
        <div className="stamp-text text-ink">{t('scan.title')}</div>
        <span className="w-16" />
      </header>

      {result ? (
        <div className="m-4 rounded-3xl bg-white text-ink"><ScanResultView result={result} onRetry={() => { setResult(null); setManual('') }} /></div>
      ) : (
        <>
          {/* The one place the dark ground still earns its keep: a lens reads against it. */}
          <div className="mx-4 overflow-hidden rounded-[28px] bg-chrome p-2 shadow-float">
            <Scanner onResult={(t) => void submit(t)} paused={busy} className="aspect-square max-h-[50dvh] w-full" />
          </div>
          {busy && <Spinner label={t('scan.checking')} />}
          {/*
            * Ahead of the error, because it explains it. A stamp is recorded by the server, so
            * scanning offline cannot work — and without this the visitor reads a network
            * failure as a broken QR code and tries the booth's sign again and again.
            */}
          {!online && <div className="mx-4 mt-3"><Notice tone="amber">{t('scan.offline')}</Notice></div>}
          {err && <div className="mx-4 mt-3"><Notice tone="red">{err}</Notice></div>}
          <form onSubmit={onManual} className="card card-static mx-4 mt-4 mb-8">
            <label className="stamp-text text-ink-soft" htmlFor="manual">{t('scan.manualLabel')}</label>
            <div className="mt-2 flex gap-2">
              <input id="manual" className="field flex-1 text-center font-mono text-xl tracking-[0.35em] uppercase" maxLength={7} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                value={manual} onChange={(e) => setManual(normaliseManualCode(e.target.value))} placeholder={t('scan.manualPlaceholder')} />
              <button className="btn-primary shrink-0" disabled={normaliseManualCode(manual).length !== 6 || busy}>{t('scan.submit')}</button>
            </div>
          </form>
        </>
      )}
    </main></>
  )
}
