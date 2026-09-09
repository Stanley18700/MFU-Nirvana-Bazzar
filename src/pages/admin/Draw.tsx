import { useState } from 'react'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { useCollection } from '../../lib/data'
import { Crest, Notice } from '../../components/ui'

type DrawDoc = { names: Array<{ uid: string; displayName: string; passportNo: string }>; poolSize: number; createdAt: unknown }

/** §6.7 — the closing stage draw, suitable for projection. */
export default function Draw() {
  const [count, setCount] = useState<number>(1)
  const countOk = Number.isInteger(count) && count >= 1 && count <= 20
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [winners, setWinners] = useState<DrawDoc['names'] | null>(null)
  const [pool, setPool] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const history = useCollection<DrawDoc>(query(collection(db, 'draws'), orderBy('createdAt', 'desc'), limit(20)), []).data

  async function run() {
    if (!countOk) return
    // Winners are excluded from later draws, so a second draw is not a do-over.
    if (history.length > 0 && !window.confirm(`Draw ${count} more winner${count === 1 ? '' : 's'}? Previous winners stay excluded and every draw is logged.`)) return
    setBusy(true); setErr(null); setWinners(null); setRolling(true)
    try {
      const [r] = await Promise.all([api.runDraw({ count }), new Promise((res) => setTimeout(res, 2200))])
      setWinners(r.winners); setPool(r.poolSize)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false); setRolling(false) }
  }

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Stage draw</h1>
      <p className="mt-1 text-sm text-ink-soft">Picks at random from visitors holding a tier that grants a draw entry. Previous winners are excluded automatically. Every draw is logged.</p>
      <section className="mt-4 rounded-3xl bg-chrome p-8 text-center text-white">
        <Crest className={`mx-auto h-24 w-24 text-foil ${rolling ? 'animate-spin' : ''}`} />
        {winners ? (
          <div className="mt-6 page-in">
            <div className="stamp-text text-foil">Winner{winners.length > 1 ? 's' : ''} · drawn from {pool} entries</div>
            <ul className="mt-3 flex flex-col gap-2">{winners.map((w) => <li key={w.uid}><div className="fig text-4xl">{w.displayName}</div><div className="font-mono text-foil">{w.passportNo}</div></li>)}</ul>
            {winners.length === 0 && <p className="mt-3 text-on-chrome-soft">Nobody eligible yet.</p>}
          </div>
        ) : <p className="mt-6 text-on-chrome-soft">{rolling ? 'Drawing…' : 'Ready'}</p>}
        <div className="mt-8 flex items-center justify-center gap-3">
          <label className="text-sm text-on-chrome-soft">Winners <input type="number" min={1} max={20} className={`field ml-2 w-20 text-ink ${countOk ? '' : 'border-danger'}`} value={Number.isFinite(count) ? count : ''} onChange={(e) => setCount(e.target.value === '' ? NaN : Number(e.target.value))} /></label>
          <button className="btn-gold px-8 py-3 text-lg" onClick={run} disabled={busy || !countOk}>Draw</button>
        </div>
        {!countOk && <p className="mt-2 text-xs text-warn-text">Choose between 1 and 20 winners.</p>}
        {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}
      </section>
      {history.length > 0 && (
        <section className="card mt-4 text-sm">
          <h2 className="stamp-text text-ink-soft">Previous draws</h2>
          <ul className="mt-2 flex flex-col gap-1">{history.map((d) => <li key={d.id}>{d.names.map((n) => `${n.displayName} (${n.passportNo})`).join(', ')} <span className="text-xs text-ink-soft">· pool {d.poolSize}</span></li>)}</ul>
        </section>
      )}
    </div>
  )
}
