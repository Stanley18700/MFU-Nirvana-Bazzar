import { useState } from 'react'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { useCollection } from '../../lib/data'
import { Crest, Notice } from '../../components/ui'

type DrawDoc = { names: Array<{ uid: string; displayName: string; passportNo: string }>; poolSize: number; createdAt: unknown }

/** §6.7 — the closing stage draw, suitable for projection. */
export default function Draw() {
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [winners, setWinners] = useState<DrawDoc['names'] | null>(null)
  const [pool, setPool] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const history = useCollection<DrawDoc>(query(collection(db, 'draws'), orderBy('createdAt', 'desc'), limit(20)), []).data

  async function run() {
    setBusy(true); setErr(null); setWinners(null); setRolling(true)
    try {
      const [r] = await Promise.all([api.runDraw({ count }), new Promise((res) => setTimeout(res, 2200))])
      setWinners(r.winners); setPool(r.poolSize)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false); setRolling(false) }
  }

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Stage draw</h1>
      <p className="mt-1 text-sm text-navy-soft">Picks at random from visitors holding a tier that grants a draw entry. Previous winners are excluded automatically. Every draw is logged.</p>
      <section className="mt-4 rounded-3xl bg-navy p-8 text-center text-paper">
        <Crest className={`mx-auto h-24 w-24 text-gold ${rolling ? 'animate-spin' : ''}`} />
        {winners ? (
          <div className="mt-6 page-in">
            <div className="stamp-text text-gold">Winner{winners.length > 1 ? 's' : ''} · drawn from {pool} entries</div>
            <ul className="mt-3 flex flex-col gap-2">{winners.map((w) => <li key={w.uid}><div className="fig text-4xl">{w.displayName}</div><div className="font-mono text-gold">{w.passportNo}</div></li>)}</ul>
            {winners.length === 0 && <p className="mt-3 text-paper/70">Nobody eligible yet.</p>}
          </div>
        ) : <p className="mt-6 text-paper/70">{rolling ? 'Drawing…' : 'Ready'}</p>}
        <div className="mt-8 flex items-center justify-center gap-3">
          <label className="text-sm text-paper/70">Winners <input type="number" min={1} max={20} className="field ml-2 w-20 text-navy" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
          <button className="btn-gold px-8 py-3 text-lg" onClick={run} disabled={busy}>Draw</button>
        </div>
        {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}
      </section>
      {history.length > 0 && (
        <section className="card mt-4 text-sm">
          <h2 className="stamp-text text-navy-soft">Previous draws</h2>
          <ul className="mt-2 flex flex-col gap-1">{history.map((d) => <li key={d.id}>{d.names.map((n) => `${n.displayName} (${n.passportNo})`).join(', ')} <span className="text-xs text-navy-soft">· pool {d.poolSize}</span></li>)}</ul>
        </section>
      )}
    </div>
  )
}
