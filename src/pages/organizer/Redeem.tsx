import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Scanner } from '../../components/Scanner'
import { api, errorMessage, type LookupResult } from '../../lib/api'
import { useTiers } from '../../lib/data'
import { Notice, Spinner, fmt } from '../../components/ui'
import { useAuth } from '../../lib/auth'

/** §4.4 — prize desk: scan the visitor's rotating code, confirm, hand over. */
export default function Redeem() {
  const { role } = useAuth()
  const tiers = useTiers().filter((t) => t.active)
  const [payload, setPayload] = useState<string | null>(null)
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null)
  const [manual, setManual] = useState('')

  // §4.4 — arriving from /r/<payload> (native camera scan): look it up straight away.
  const [params, setParams] = useSearchParams()
  const deepLink = params.get('code')
  const fired = useRef(false)

  async function onCode(text: string) {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.lookupRedemption({ payload: text })
      if (r.status === 'invalid') setMsg({ tone: 'amber', text: 'Code expired or not recognised — ask the visitor to show a fresh code.' })
      else { setLookup(r); setPayload(text) }
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  async function confirm(tierId: string) {
    if (!payload) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.confirmRedemption({ payload, tierId })
      if (r.status === 'redeemed') { setMsg({ tone: 'green', text: 'Prize handed over — recorded.' }); const l = await api.lookupRedemption({ payload }); if (l.status === 'ok') setLookup(l) }
      else if (r.status === 'already') setMsg({ tone: 'amber', text: `Already redeemed at ${new Date(r.redeemedAt).toLocaleTimeString()}.` })
      else setMsg({ tone: 'red', text: `Out of stock. ${r.note}` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!deepLink || fired.current) return
    fired.current = true
    void onCode(deepLink)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink])

  function reset() { setLookup(null); setPayload(null); setMsg(null); setManual('') }

  return (
    <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="mx-auto min-h-full max-w-lg bg-navy-deep px-4 pb-8 text-paper">
      <header className="flex items-center justify-between py-4">
        <Link to={role === 'admin' ? '/admin' : '/booth'} className="text-sm text-paper/70">← Back</Link>
        <div className="stamp-text text-gold">Prize desk</div>
        <span className="w-12" />
      </header>

      {/* §4.4 — live stock strip */}
      <div className="grid grid-cols-2 gap-2 xs:grid-cols-3">
        {tiers.map((t) => {
          const pct = t.stockTotal ? t.stockRemaining / t.stockTotal : 0
          const tone = t.stockRemaining <= 5 ? 'text-vermilion' : pct < 0.2 ? 'text-amber' : 'text-jade'
          return (
            <div key={t.id} className="rounded-xl bg-white/5 p-3">
              <div className="stamp-text text-paper/60">{t.name}</div>
              <div className={`fig text-xl xs:text-2xl ${tone}`}>{fmt(t.stockRemaining)}<span className="text-sm text-paper/40"> / {fmt(t.stockTotal)}</span></div>
            </div>
          )
        })}
      </div>

      {!lookup ? (
        <>
          <Scanner onResult={(t) => void onCode(t)} paused={busy} className="mt-4 aspect-[4/3]" />
          {busy && <Spinner label="Looking up…" />}
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (manual.trim()) void onCode(manual.trim()) }} className="mt-4 rounded-2xl bg-white/5 p-4">
            <label className="stamp-text text-paper/60" htmlFor="rc">Or type the visitor's code</label>
            <div className="mt-2 flex gap-2">
              <input id="rc" className="field flex-1 bg-white/90 font-mono uppercase" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="uid.counter.CODE or paste link" />
              <button className="btn-gold shrink-0" disabled={busy || !manual.trim()}>Look up</button>
            </div>
          </form>
        </>
      ) : lookup.status === 'ok' && (
        <section className="mt-4 rounded-3xl bg-paper p-5 text-navy page-in">
          <div className="stamp-text text-navy-soft">Visitor</div>
          <div className="text-2xl font-bold">{lookup.visitor.displayName}</div>
          <div className="text-sm text-navy-soft">{lookup.visitor.passportNo} · {lookup.visitor.points} points · {lookup.visitor.stampCount} stamps</div>
          <ul className="mt-4 flex flex-col gap-2">
            {lookup.tiers.map((t) => (
              <li key={t.id} className={`flex items-center gap-3 rounded-2xl p-3 ${t.unlocked ? 'bg-white' : 'bg-navy/5 opacity-70'}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.name} <span className="text-xs font-normal text-navy-soft">{t.thresholdPoints} pts</span></div>
                  <div className="text-xs text-navy-soft">{t.reward}</div>
                  {t.redeemedAt && <div className="text-xs text-jade">Redeemed {new Date(t.redeemedAt).toLocaleTimeString()}</div>}
                </div>
                {t.redeemedAt ? <span className="shrink-0 rounded-full bg-jade/15 px-3 py-1 text-xs font-semibold text-jade">Done</span>
                  : t.unlocked ? <button className="btn-primary shrink-0" disabled={busy || t.stockRemaining <= 0} onClick={() => confirm(t.id)}>{t.stockRemaining <= 0 ? 'Out of stock' : 'Hand over'}</button>
                  : <span className="shrink-0 text-xs text-navy-soft">{t.thresholdPoints - lookup.visitor.points} pts short</span>}
              </li>
            ))}
          </ul>
          {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
          <button className="btn-ghost mt-4 w-full" onClick={reset}>Next visitor</button>
        </section>
      )}
      {msg && !lookup && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </main></>
  )
}
