import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Scanner } from '../../components/Scanner'
import { api, friendlyError, type LookupResult, type RedemptionCred } from '../../lib/api'
import { useBooth, useBooths, useEvent, useTiersState } from '../../lib/data'
import { OrganizerBar } from '../../components/OrganizerBar'
import { DarkNotice, DataErrors, fmt, LiveDot, type Msg, Notice, Spinner } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { clock } from '../../lib/eventText'

type Okay = Extract<LookupResult, { status: 'ok' }>
type Done = { tier: string; reward: string; name: string; passportNo?: string; at: number }

const PAYLOAD_RE = /(?:^|\/r\/)[A-Za-z0-9]+\.\d+\.[A-Z2-7]{8}/i
const ARM_MS = 6000

/** §4.4 — prize desk: scan the visitor's rotating code (or type passport number + code), confirm twice, hand over. */
export default function Redeem() {
  const { role, boothId: claimBooth } = useAuth()
  const event = useEvent()
  const tiersState = useTiersState()
  const tiers = tiersState.data.filter((t) => t.active)
  const desks = useBooths().filter((b) => b.isPrizeDesk)
  // An organizer's own booth decides whether this screen is theirs at all; the server checks too.
  const mine = useBooth(role === 'organizer' ? claimBooth : null)

  const [cred, setCred] = useState<RedemptionCred | null>(null)
  const [lookup, setLookup] = useState<Okay | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [passport, setPassport] = useState('')
  const [code, setCode] = useState('')
  const [armed, setArmed] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [recent, setRecent] = useState<Done[]>([])
  // After "code expired" mid-confirmation the card stays and only a fresh code is asked for.
  const [stale, setStale] = useState(false)
  const [freshCode, setFreshCode] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // A "Hand over" press arms the button; it disarms itself if the second press does not follow.
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(null), ARM_MS)
    return () => clearTimeout(id)
  }, [armed])

  // §4.4 — arriving from /r/<payload> (native camera scan): look it up straight away.
  const [params, setParams] = useSearchParams()
  const deepLink = params.get('code')
  const fired = useRef(false)

  async function onCred(c: RedemptionCred) {
    if (busy || lookup || done) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.lookupRedemption(c)
      if (r.status === 'invalid') setMsg({ tone: 'amber', text: 'Code expired or not recognised — ask the visitor to show a fresh code, and check the passport number.' })
      else { setLookup(r); setCred(c); setStale(false); setFreshCode('') }
    } catch (e) { setMsg({ tone: 'red', text: friendlyError(e) }) } finally { setBusy(false) }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault()
    const c = code.trim()
    // A whole /r/ link pasted into the code field still works.
    if (PAYLOAD_RE.test(c)) { void onCred({ payload: c }); return }
    if (!passport.trim() || c.replace(/\s+/g, '').length !== 8) return
    void onCred({ passportNo: passport.trim(), code: c })
  }

  async function confirm(tierId: string) {
    if (!cred || !lookup) return
    if (armed !== tierId) { setArmed(tierId); return }
    setArmed(null); setBusy(true); setMsg(null)
    const tier = lookup.tiers.find((t) => t.id === tierId)
    try {
      const r = await api.confirmRedemption({ ...cred, tierId })
      if (r.status === 'redeemed') {
        const d: Done = { tier: tier?.name ?? tierId, reward: tier?.reward ?? '', name: lookup.visitor.displayName, passportNo: lookup.visitor.passportNo, at: Date.now() }
        setDone(d); setRecent((l) => [d, ...l].slice(0, 10))
        navigator.vibrate?.(30)
        const l = await api.lookupRedemption(cred).catch(() => null)
        if (l && l.status === 'ok') setLookup(l)
      } else if (r.status === 'already') {
        setMsg({ tone: 'amber', text: `Already handed over at ${clock(r.redeemedAt)}${r.redeemedByName ? ` by ${r.redeemedByName}` : ''}.` })
      } else setMsg({ tone: 'red', text: `Out of stock. ${r.note}` })
    } catch (e) {
      const text = friendlyError(e)
      if (/expired/i.test(text)) { setStale(true); setMsg({ tone: 'amber', text: 'That code has expired. Ask the visitor for the new 8-character code and enter it below.' }) }
      else setMsg({ tone: 'red', text })
    } finally { setBusy(false) }
  }

  function useFreshCode(e: FormEvent) {
    e.preventDefault()
    const c = freshCode.replace(/\s+/g, '')
    if (c.length !== 8 || !lookup) return
    if (PAYLOAD_RE.test(freshCode)) { setCred({ payload: freshCode.trim() }) }
    else if (lookup.visitor.passportNo) setCred({ passportNo: lookup.visitor.passportNo, code: c })
    else return
    setStale(false); setFreshCode(''); setMsg({ tone: 'green', text: 'New code noted — press Hand over again.' })
  }

  useEffect(() => {
    if (!deepLink || fired.current) return
    fired.current = true
    void onCred({ payload: deepLink })
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink])

  function reset() { setLookup(null); setCred(null); setMsg(null); setDone(null); setArmed(null); setStale(false); setPassport(''); setCode('') }

  const shell = (children: React.ReactNode) => (
    <><div className="fixed inset-0 -z-10 bg-chrome" aria-hidden /><main className="mx-auto min-h-full max-w-lg bg-chrome px-5 pb-8 text-white">
      <header className="py-4">
        {/* The bar above the title, as on /booth and /booth/stats. */}
        <OrganizerBar boothId={role === 'admin' ? null : claimBooth} dark compact className="mb-3" />
        <div className="stamp-text text-foil">Prize desk</div>
      </header>
      {children}
    </main></>
  )

  // Gate: only a prize-desk booth (or an admin) may run this screen. Before, anyone with the role
  // saw the camera and learned otherwise from the server after scanning a visitor.
  if (role === 'organizer') {
    if (mine.loading) return shell(<Spinner label="Checking your booth…" />)
    if (!mine.data?.isPrizeDesk) {
      return shell(
        <div className="flex flex-col gap-4 pt-4">
          <DarkNotice tone="amber">
            <b>{mine.data?.nameEn ?? 'Your booth'}</b> is not a prize desk, so this screen is not yours to run.
            {desks.length > 0 && <> The prize desk is <b>{desks.map((d) => d.nameEn).join(', ')}</b>.</>}
          </DarkNotice>
          <Link to="/booth" className="btn-gold">Open my booth screen</Link>
        </div>,
      )
    }
  }

  const stockStale = offline || tiersState.fromCache
  const prefix = event.passportPrefix

  return shell(
    <>
      {/* §4.4 — live stock strip, with a stale flag when the figures come from the cache */}
      <div className="flex items-center justify-between text-xs text-on-chrome-soft">
        <span>Stock</span>
        <LiveDot state={offline ? 'offline' : stockStale ? 'stale' : 'live'} dark size="sm">
          {offline ? 'Offline — figures may be old' : tiersState.fromCache ? 'Reconnecting' : 'Live'}
        </LiveDot>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 xs:grid-cols-3">
        {tiers.map((t) => {
          const pct = t.stockTotal ? t.stockRemaining / t.stockTotal : 0
          // On-chrome values, not the `-text` ones: this strip sits on the dark ground, and the
          // page frames a white visitor card below it so it cannot take `.on-chrome` wholesale.
          const tone = t.stockRemaining <= 5 ? 'text-danger-on-chrome' : pct < 0.2 ? 'text-warn-on-chrome' : 'text-success-on-chrome'
          return (
            <div key={t.id} className="rounded-xl bg-white/5 p-3">
              <div className="stamp-text text-on-chrome-soft">{t.name}</div>
              <div className={`fig text-xl xs:text-2xl ${tone}`}>{fmt(t.stockRemaining)}<span className="text-sm text-on-chrome-soft"> / {fmt(t.stockTotal)}</span></div>
            </div>
          )
        })}
      </div>
      <DataErrors dark className="mt-3 text-sm" />

      {done ? (
        <section className="mt-4 rounded-3xl bg-success p-6 text-center text-white page-in" role="status" aria-live="polite">
          <div className="stamp-text text-white/70">Handed over</div>
          <div className="fig mt-2 text-4xl">{done.tier}</div>
          {done.reward && <div className="mt-1 text-white/85">{done.reward}</div>}
          <div className="mt-4 text-lg font-semibold">{done.name}</div>
          <div className="text-sm text-white/75">{[done.passportNo, clock(done.at)].filter(Boolean).join(' · ')}</div>
          <button className="btn-gold mt-6 w-full py-3.5 text-lg" onClick={reset} autoFocus>Next visitor</button>
          <button className="btn-dark btn-sm mt-3" onClick={() => setDone(null)}>Hand over another tier to {done.name.split(' ')[0]}</button>
        </section>
      ) : lookup ? (
        <section className="mt-4 rounded-3xl bg-white p-5 text-ink page-in">
          <div className="stamp-text text-ink-soft">Visitor</div>
          <div className="text-2xl font-bold">{lookup.visitor.displayName}</div>
          <div className="text-sm text-ink-soft">{[lookup.visitor.passportNo, `${lookup.visitor.points} points`, `${lookup.visitor.stampCount} stamps`].filter(Boolean).join(' · ')}</div>
          <ul className="mt-4 flex flex-col gap-2">
            {lookup.tiers.map((t) => (
              <li key={t.id} className={`flex items-center gap-3 rounded-2xl p-3 ${t.unlocked ? 'bg-white' : 'bg-ink/5 opacity-70'}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.name} <span className="text-xs font-normal text-ink-soft">{t.thresholdPoints} pts</span></div>
                  <div className="text-xs text-ink-soft">{t.reward}</div>
                  {t.redeemedAt && <div className="text-xs text-success-text">Handed over {clock(t.redeemedAt)}{t.redeemedByName ? ` by ${t.redeemedByName}` : ''}</div>}
                </div>
                {t.redeemedAt ? <span className="shrink-0 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success-text">Done</span>
                  : t.unlocked ? (
                    <button
                      className={`${armed === t.id ? 'btn-gold' : 'btn-primary'} shrink-0`}
                      disabled={busy || stale || t.stockRemaining <= 0}
                      onClick={() => confirm(t.id)}
                      aria-live="polite"
                    >
                      {t.stockRemaining <= 0 ? 'Out of stock' : armed === t.id ? `Confirm ${t.name}` : 'Hand over'}
                    </button>
                  )
                  : <span className="shrink-0 text-xs text-ink-soft">{t.thresholdPoints - lookup.visitor.points} pts short</span>}
              </li>
            ))}
          </ul>
          {armed && <p className="mt-2 text-xs text-ink-soft">Press the gold button again to confirm — a hand-over cannot be undone at the desk.</p>}
          {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
          {stale && (
            <form onSubmit={useFreshCode} className="mt-3 flex gap-2">
              <input className="field flex-1 font-mono uppercase" value={freshCode} onChange={(e) => setFreshCode(e.target.value)} placeholder="New 8-character code" autoFocus aria-label="New 8-character code" />
              <button className="btn-primary shrink-0" disabled={freshCode.replace(/\s+/g, '').length !== 8}>Use it</button>
            </form>
          )}
          <button className="btn-ghost mt-4 w-full" onClick={reset}>Next visitor</button>
        </section>
      ) : null}

      {/* The camera stays mounted behind the card so "Next visitor" never re-asks for permission. */}
      <div hidden={!!lookup || !!done}>
        <Scanner onResult={(t) => void onCred({ payload: t })} paused={busy || !!lookup || !!done} className="mt-4 aspect-[4/3]" />
        {busy && <Spinner label="Looking up…" />}
        <form onSubmit={submitManual} className="mt-4 rounded-2xl bg-white/5 p-4">
          <div className="stamp-text text-on-chrome-soft">Or type what the visitor reads out</div>
          <div className="mt-2 grid gap-2 [&>*]:min-w-0 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block text-xs text-on-chrome-soft">Passport number
              <input className="field mt-1 bg-white/90 font-mono uppercase" value={passport} onChange={(e) => setPassport(e.target.value.toUpperCase())}
                placeholder={`${prefix}-0042`} autoCapitalize="characters" autoComplete="off" inputMode="text" />
            </label>
            <label className="block text-xs text-on-chrome-soft">8-character code
              <input className="field mt-1 bg-white/90 font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD EFGH" autoCapitalize="characters" autoComplete="off" />
            </label>
            <button className="btn-gold self-end" disabled={busy || !(PAYLOAD_RE.test(code) || (passport.trim() && code.replace(/\s+/g, '').length === 8))}>Look up</button>
          </div>
          <p className="mt-2 text-xs text-on-chrome-soft">Both are on the visitor's Prize page. Just the digits work for the passport number ("42" means {prefix}-0042).</p>
        </form>
        {msg && <div className="mt-3"><DarkNotice tone={msg.tone}>{msg.text}</DarkNotice></div>}
        {recent.length > 0 && (
          <section className="mt-5">
            <h2 className="stamp-text text-on-chrome-soft">Handed over on this device</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {recent.map((r) => (
                <li key={r.at} className="flex justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <span className="truncate"><b>{r.tier}</b> · {r.name}{r.passportNo ? <span className="text-on-chrome-soft"> · {r.passportNo}</span> : null}</span>
                  <span className="shrink-0 tabular-nums text-on-chrome-soft">{clock(r.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>,
  )
}
