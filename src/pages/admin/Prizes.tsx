import { useEffect, useRef, useState } from 'react'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage, type TierInput } from '../../lib/api'
import { useBooths, useCollection, useTiers } from '../../lib/data'
import { Notice, fmt } from '../../components/ui'

const ts = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? new Date((v as { toMillis(): number }).toMillis()).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '–')

/** §6.5 / §6.7 — policy is data; stock is only ever adjusted with a reason. */
export default function Prizes() {
  const tiers = useTiers()
  const booths = useBooths()
  const available = booths.reduce((s, b) => s + b.points, 0)
  const [rows, setRows] = useState<TierInput[]>([])
  // The editor is seeded from the live tiers until the admin touches it; after that another
  // admin's save is announced rather than silently overwriting the draft.
  const [dirty, setDirty] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const seeded = useRef('')
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null)
  const [adjust, setAdjust] = useState<{ tierId: string; delta: string; reason: string; kind: 'restock' | 'correction' }>({ tierId: '', delta: '', reason: '', kind: 'restock' })
  const adjustments = useCollection<{ tierId: string; delta: number; reason: string; kind: string; createdAt: unknown }>(query(collection(db, 'stockAdjustments'), orderBy('createdAt', 'desc'), limit(30)), []).data
  const [voidForm, setVoidForm] = useState({ visitorId: '', tierId: '', reason: '' })

  useEffect(() => {
    if (!tiers.length) return
    const fresh = tiers.map((t) => ({ id: t.id, name: t.name, thresholdPoints: t.thresholdPoints, reward: t.reward, grantsDrawEntry: t.grantsDrawEntry, active: t.active, outOfStockNoteEn: t.outOfStockNoteEn ?? '' }))
    const key = JSON.stringify(fresh)
    if (!dirty) { setRows(fresh); seeded.current = key; setRemoteChanged(false) }
    else if (seeded.current && key !== seeded.current) setRemoteChanged(true)
  }, [tiers, dirty])

  const set = (i: number, patch: Partial<TierInput>) => { setDirty(true); setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))) }

  async function save(dryRun: boolean) {
    setMsg(null)
    try {
      const r = await api.savePrizePolicy({ tiers: rows, dryRun })
      setPreview(r.preview)
      if (!dryRun) { setDirty(false); setMsg({ tone: 'green', text: 'Policy saved. Lowered thresholds unlocked immediately; raised ones revoked nothing (§6.7).' }) }
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  async function doAdjust() {
    setMsg(null)
    try {
      await api.adjustStock({ tierId: adjust.tierId, delta: Number(adjust.delta), reason: adjust.reason, kind: adjust.kind })
      setAdjust({ tierId: '', delta: '', reason: '', kind: 'restock' })
      setMsg({ tone: 'green', text: 'Stock adjusted and logged.' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  async function doVoid() {
    setMsg(null)
    try { await api.voidRedemption(voidForm); setVoidForm({ visitorId: '', tierId: '', reason: '' }); setMsg({ tone: 'green', text: 'Redemption voided; item returned to stock.' }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Prizes & stock</h1>
      <p className="mt-1 text-sm text-navy-soft">{available} points available on the floor across {booths.length} active booths. The top threshold must stay reachable — the editor blocks anything above {available} and warns within 10 of it.</p>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {remoteChanged && (
        <div className="mt-3">
          <Notice tone="amber">
            Another admin changed the prize policy while you were editing.{' '}
            <button className="underline" onClick={() => setDirty(false)}>Discard my edits</button> to load theirs, or save to overwrite.
          </Notice>
        </div>
      )}

      <section className="card mt-4">
        <h2 className="stamp-text text-navy-soft">Tiers</h2>
        <div className="mt-3 flex flex-col gap-3">
          {rows.map((r, i) => {
            const t = tiers.find((x) => x.id === r.id)
            const warn = r.thresholdPoints > available - 10
            return (
              <div key={r.id ?? i} className="grid gap-2 rounded-xl bg-white/50 p-3 md:grid-cols-6">
                <input className="field" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Tier name" />
                <label className="flex items-center gap-2 text-sm"><span className="text-navy-soft">≥</span><input className={`field ${warn ? 'border-amber' : ''}`} type="number" min={1} value={r.thresholdPoints} onChange={(e) => set(i, { thresholdPoints: Number(e.target.value) })} /><span className="text-navy-soft">pts</span></label>
                <input className="field md:col-span-2" value={r.reward} onChange={(e) => set(i, { reward: e.target.value })} placeholder="Reward" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.grantsDrawEntry} onChange={(e) => set(i, { grantsDrawEntry: e.target.checked })} />Stage draw</label>
                <div className="text-right text-sm">
                  {t ? <><span className="fig text-lg">{fmt(t.stockRemaining)}</span> <span className="text-navy-soft">/ {fmt(t.stockTotal)}</span></> : <input className="field" type="number" min={0} placeholder="Initial stock" value={r.stockTotal ?? ''} onChange={(e) => set(i, { stockTotal: Number(e.target.value) })} />}
                  {preview && r.id && preview[r.id] > 0 && <div className="text-xs text-amber">unlocks for {preview[r.id]} visitors</div>}
                </div>
                <input className="field md:col-span-5 text-xs" value={r.outOfStockNoteEn ?? ''} onChange={(e) => set(i, { outOfStockNoteEn: e.target.value })} placeholder="Shown to visitors if this tier runs out (e.g. collection point or later date)" />
                {/* Dropping a row deactivates the tier on save (§6.7) — unlock history is never deleted. */}
                <button type="button" className="text-xs text-vermilion underline" onClick={() => { setDirty(true); setRows(rows.filter((_, j) => j !== i)) }}>
                  Remove{t ? ' (deactivates)' : ''}
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => { setDirty(true); setRows([...rows, { name: '', thresholdPoints: available, reward: '', stockTotal: 0 }]) }}>Add tier</button>
          <button className="btn-ghost" onClick={() => save(true)}>Preview effect</button>
          <button className="btn-primary" onClick={() => save(false)}>Save policy</button>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="stamp-text text-navy-soft">Adjust stock</h2>
          <p className="mt-1 text-xs text-navy-soft">Counts are never typed over: every change is an adjustment with a reason so the end-of-event figures reconcile with what was loaded in.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select className="field" value={adjust.tierId} onChange={(e) => setAdjust({ ...adjust, tierId: e.target.value })}><option value="">— tier —</option>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <select className="field" value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value as 'restock' | 'correction' })}><option value="restock">Restock (+)</option><option value="correction">Correction (±)</option></select>
            <input className="field" type="number" placeholder="Delta, e.g. 50 or -3" value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} />
            <input className="field" placeholder="Reason (required)" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
          </div>
          <button className="btn-primary mt-3" disabled={!adjust.tierId || !adjust.delta || !adjust.reason} onClick={doAdjust}>Apply adjustment</button>
          <ul className="mt-4 flex flex-col gap-1 text-xs">
            {adjustments.map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{tiers.find((t) => t.id === a.tierId)?.name ?? a.tierId} · {a.kind} · {a.reason}</span><span className={`fig ${a.delta < 0 ? 'text-vermilion' : 'text-jade'}`}>{a.delta > 0 ? '+' : ''}{a.delta}</span><span className="text-navy-soft">{ts(a.createdAt)}</span></li>)}
          </ul>
        </section>

        <section className="card">
          <h2 className="stamp-text text-navy-soft">Void a redemption</h2>
          <p className="mt-1 text-xs text-navy-soft">Wrong person, handed over twice, prize damaged. Returns the item to stock and reopens the tier for that visitor. Find the visitor's ID in Users.</p>
          <div className="mt-3 grid gap-2">
            <input className="field font-mono text-xs" placeholder="Visitor UID" value={voidForm.visitorId} onChange={(e) => setVoidForm({ ...voidForm, visitorId: e.target.value })} />
            <select className="field" value={voidForm.tierId} onChange={(e) => setVoidForm({ ...voidForm, tierId: e.target.value })}><option value="">— tier —</option>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input className="field" placeholder="Reason (required)" value={voidForm.reason} onChange={(e) => setVoidForm({ ...voidForm, reason: e.target.value })} />
          </div>
          <button className="btn-danger mt-3" disabled={!voidForm.visitorId || !voidForm.tierId || !voidForm.reason} onClick={doVoid}>Void redemption</button>
        </section>
      </div>
    </div>
  )
}
