import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage, type TierInput } from '../../lib/api'
import { useBooths, useCollection, useTiers } from '../../lib/data'
import { Notice, Toast, fmt, type Msg } from '../../components/ui'
import { ts } from '../../lib/eventText'
import { useUnsavedGuard } from '../../lib/useUnsavedGuard'

/** A small label above a field; the placeholder used to be the only label and vanished once typed over. */
function L({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="stamp-text block text-[10px] text-navy-soft">{children}</label>
}

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
  const [msg, setMsg] = useState<Msg | null>(null)
  const [adjust, setAdjust] = useState<{ tierId: string; delta: string; reason: string; kind: 'restock' | 'correction' }>({ tierId: '', delta: '', reason: '', kind: 'restock' })
  const adjustments = useCollection<{ tierId: string; delta: number; reason: string; kind: string; createdAt: unknown }>(query(collection(db, 'stockAdjustments'), orderBy('createdAt', 'desc'), limit(30)), []).data
  const [voidForm, setVoidForm] = useState({ visitorId: '', tierId: '', reason: '' })
  const [busy, setBusy] = useState<'preview' | 'save' | 'adjust' | 'void' | null>(null)
  useUnsavedGuard(dirty)

  useEffect(() => {
    if (!tiers.length) return
    const fresh = tiers.map((t) => ({ id: t.id, name: t.name, thresholdPoints: t.thresholdPoints, reward: t.reward, grantsDrawEntry: t.grantsDrawEntry, active: t.active, outOfStockNoteEn: t.outOfStockNoteEn ?? '' }))
    const key = JSON.stringify(fresh)
    if (!dirty) { setRows(fresh); seeded.current = key; setRemoteChanged(false) }
    else if (seeded.current && key !== seeded.current) setRemoteChanged(true)
  }, [tiers, dirty])

  const set = (i: number, patch: Partial<TierInput>) => { setDirty(true); setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))) }
  const removed = tiers.filter((t) => t.active && !rows.some((r) => r.id === t.id))
  // An emptied number field used to save as 0. Every row must have a name and a threshold of at least 1.
  const rowProblems = rows.map((r) => !r.name.trim() ? 'needs a name' : !(r.thresholdPoints >= 1) ? 'needs a threshold of at least 1' : r.thresholdPoints > available ? `needs ${r.thresholdPoints} points but only ${available} are on the floor` : null)
  const valid = rows.length > 0 && rowProblems.every((p) => !p)

  async function save(dryRun: boolean) {
    setMsg(null); setBusy(dryRun ? 'preview' : 'save')
    try {
      const r = await api.savePrizePolicy({ tiers: rows, dryRun })
      setPreview(r.preview)
      if (!dryRun) { setDirty(false); setMsg({ tone: 'green', text: 'Policy saved. Lowered thresholds unlocked immediately; raised ones revoked nothing.' }) }
      else setMsg({ tone: 'amber', text: 'Preview only — nothing saved. The effect is shown under each tier.' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  const deltaNum = Number(adjust.delta)
  const adjustOk = !!adjust.tierId && adjust.delta.trim() !== '' && Number.isFinite(deltaNum) && Number.isInteger(deltaNum) && deltaNum !== 0 && !!adjust.reason.trim()

  async function doAdjust() {
    if (!adjustOk) return
    setMsg(null); setBusy('adjust')
    try {
      await api.adjustStock({ tierId: adjust.tierId, delta: deltaNum, reason: adjust.reason.trim(), kind: adjust.kind })
      setAdjust({ tierId: '', delta: '', reason: '', kind: 'restock' })
      setMsg({ tone: 'green', text: `Stock adjusted by ${deltaNum > 0 ? '+' : ''}${deltaNum} and logged.` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  async function doVoid() {
    const tier = tiers.find((t) => t.id === voidForm.tierId)
    if (!window.confirm(`Void ${tier?.name ?? 'this tier'} for visitor ${voidForm.visitorId.trim()}? The item returns to stock and the visitor can collect again.`)) return
    setMsg(null); setBusy('void')
    try { await api.voidRedemption({ ...voidForm, visitorId: voidForm.visitorId.trim(), reason: voidForm.reason.trim() }); setVoidForm({ visitorId: '', tierId: '', reason: '' }); setMsg({ tone: 'green', text: 'Redemption voided; item returned to stock.' }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  return (
    <div className="page-in">
      <Toast msg={msg} onClose={() => setMsg(null)} />
      <h1 className="text-2xl font-bold">Prizes & stock</h1>
      <p className="mt-1 text-sm text-navy-soft">{available} points available on the floor across {booths.length} active booths. The top threshold must stay reachable — the editor blocks anything above {available} and warns within 10 of it.</p>
      {remoteChanged && (
        <div className="mt-3">
          <Notice tone="amber">
            Another admin changed the prize policy while you were editing.{' '}
            <button className="btn-quiet btn-sm mx-1" onClick={() => setDirty(false)}>Discard my edits</button> to load theirs, or save to overwrite.
          </Notice>
        </div>
      )}

      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="stamp-text text-navy-soft">Tiers</h2>
          {dirty && <span className="text-xs text-amber">Unsaved changes</span>}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {rows.map((r, i) => {
            const t = tiers.find((x) => x.id === r.id)
            const warn = r.thresholdPoints > available - 10
            const problem = rowProblems[i]
            const id = `tier-${r.id ?? i}`
            return (
              <div key={r.id ?? i} className="grid gap-2 rounded-xl bg-white/50 p-3 md:grid-cols-6">
                <div><L htmlFor={`${id}-name`}>Tier name</L><input id={`${id}-name`} className="field" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Explorer" /></div>
                <div><L htmlFor={`${id}-pts`}>Unlocks at (points)</L><input id={`${id}-pts`} className={`field ${warn || problem ? 'border-amber' : ''}`} type="number" min={1} value={Number.isFinite(r.thresholdPoints) ? r.thresholdPoints : ''} onChange={(e) => set(i, { thresholdPoints: e.target.value === '' ? NaN : Number(e.target.value) })} /></div>
                <div className="md:col-span-2"><L htmlFor={`${id}-reward`}>Reward</L><input id={`${id}-reward`} className="field" value={r.reward} onChange={(e) => set(i, { reward: e.target.value })} placeholder="Tote bag" /></div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!r.grantsDrawEntry} onChange={(e) => set(i, { grantsDrawEntry: e.target.checked })} />Stage draw entry</label>
                <div className="text-right text-sm">
                  <L>{t ? 'Stock left / total' : 'Initial stock'}</L>
                  {t ? <><span className="fig text-lg">{fmt(t.stockRemaining)}</span> <span className="text-navy-soft">/ {fmt(t.stockTotal)}</span></> : <input className="field" type="number" min={0} aria-label="Initial stock" value={r.stockTotal ?? ''} onChange={(e) => set(i, { stockTotal: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />}
                  {preview && r.id && preview[r.id] > 0 && <div className="text-xs text-amber">unlocks for {preview[r.id]} visitors</div>}
                </div>
                <div className="md:col-span-5"><L htmlFor={`${id}-note`}>Shown to visitors if it runs out (optional)</L><input id={`${id}-note`} className="field text-xs" value={r.outOfStockNoteEn ?? ''} onChange={(e) => set(i, { outOfStockNoteEn: e.target.value })} placeholder="e.g. Collect from the information desk after 15:00" /></div>
                <div className="flex items-end justify-end">
                  {/* Dropping a row deactivates the tier on save (§6.7) — unlock history is never deleted. */}
                  <button type="button" className="btn-danger-soft btn-sm" onClick={() => { setDirty(true); setRows(rows.filter((_, j) => j !== i)) }}>
                    Remove{t ? ' on save' : ''}
                  </button>
                </div>
                {problem && <div className="text-xs text-vermilion md:col-span-6">{r.name || 'This tier'} {problem}.</div>}
              </div>
            )
          })}
          {removed.length > 0 && (
            <Notice tone="amber">
              {removed.map((t) => t.name).join(', ')} will be deactivated when you save. Visitors who already unlocked {removed.length === 1 ? 'it' : 'them'} keep the unlock.{' '}
              <button className="btn-quiet btn-sm ml-1" onClick={() => setDirty(false)}>Discard changes</button>
            </Notice>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => { setDirty(true); setRows([...rows, { name: '', thresholdPoints: available, reward: '', stockTotal: 0 }]) }}>Add tier</button>
          <button className="btn-ghost" disabled={!valid || busy !== null} onClick={() => save(true)}>{busy === 'preview' ? 'Checking…' : 'Preview effect'}</button>
          <button className="btn-primary" disabled={!valid || busy !== null || !dirty} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          {dirty && <button className="btn-ghost" disabled={busy !== null} onClick={() => setDirty(false)}>Discard changes</button>}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="stamp-text text-navy-soft">Adjust stock</h2>
          <p className="mt-1 text-xs text-navy-soft">Counts are never typed over: every change is an adjustment with a reason so the end-of-event figures reconcile with what was loaded in.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><L htmlFor="adj-tier">Tier</L><select id="adj-tier" className="field" value={adjust.tierId} onChange={(e) => setAdjust({ ...adjust, tierId: e.target.value })}><option value="">— tier —</option>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><L htmlFor="adj-kind">Kind</L><select id="adj-kind" className="field" value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value as 'restock' | 'correction' })}><option value="restock">Restock (+)</option><option value="correction">Correction (±)</option></select></div>
            <div><L htmlFor="adj-delta">Change (whole number, e.g. 50 or -3)</L><input id="adj-delta" className="field" type="number" step={1} value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} /></div>
            <div><L htmlFor="adj-reason">Reason (kept in the ledger)</L><input id="adj-reason" className="field" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} /></div>
          </div>
          <button className="btn-primary mt-3" disabled={!adjustOk || busy !== null} onClick={doAdjust}>{busy === 'adjust' ? 'Applying…' : 'Apply adjustment'}</button>
          <ul className="mt-4 flex flex-col gap-1 text-xs">
            {adjustments.map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{tiers.find((t) => t.id === a.tierId)?.name ?? a.tierId} · {a.kind} · {a.reason}</span><span className={`fig ${a.delta < 0 ? 'text-vermilion' : 'text-jade'}`}>{a.delta > 0 ? '+' : ''}{a.delta}</span><span className="text-navy-soft">{ts(a.createdAt)}</span></li>)}
          </ul>
        </section>

        <section className="card">
          <h2 className="stamp-text text-navy-soft">Void a redemption</h2>
          <p className="mt-1 text-xs text-navy-soft">
            Wrong person, handed over twice, prize damaged. Returns the item to stock and reopens the tier for that visitor.
            The easier route is <Link to="/admin/users" className="link">Users</Link>: open the visitor and press <b>Void</b> next to the prize. This form takes the user ID shown in that drawer.
          </p>
          <div className="mt-3 grid gap-2">
            <div><L htmlFor="void-uid">User ID</L><input id="void-uid" className="field font-mono text-xs" value={voidForm.visitorId} onChange={(e) => setVoidForm({ ...voidForm, visitorId: e.target.value })} /></div>
            <div><L htmlFor="void-tier">Tier</L><select id="void-tier" className="field" value={voidForm.tierId} onChange={(e) => setVoidForm({ ...voidForm, tierId: e.target.value })}><option value="">— tier —</option>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><L htmlFor="void-reason">Reason (kept in the audit log)</L><input id="void-reason" className="field" value={voidForm.reason} onChange={(e) => setVoidForm({ ...voidForm, reason: e.target.value })} /></div>
          </div>
          <button className="btn-danger mt-3" disabled={!voidForm.visitorId.trim() || !voidForm.tierId || !voidForm.reason.trim() || busy !== null} onClick={doVoid}>{busy === 'void' ? 'Voiding…' : 'Void redemption…'}</button>
        </section>
      </div>
    </div>
  )
}
