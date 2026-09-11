import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage, type TierInput } from '../../lib/api'
import { useBoothsState, useCollection, useTiers } from '../../lib/data'
import { Notice, Toast, fmt, type Msg } from '../../components/ui'
import { ts } from '../../lib/eventText'
import { Select } from '../../components/Select'
import { useUnsavedGuard } from '../../lib/useUnsavedGuard'

/**
 * A field's label. Sentence case, not the uppercase eyebrow it used to be: `stamp-text` is 10px at
 * 0.14em tracking, and fifteen of them — three tiers of five — were the texture of the whole page.
 * An eyebrow earns its place once per section, naming the section. On every field it is just
 * shouting, and uppercase is slower to read besides. The section headings keep theirs.
 */
function L({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-soft">{children}</label>
}

/** §6.5 / §6.7 — policy is data; stock is only ever adjusted with a reason. */
export default function Prizes() {
  const tiers = useTiers()
  /*
   * The listener's own state, not just its rows. An empty booth list means "still arriving" on the
   * first render and "genuinely none" a moment later, and the two must not be judged the same way:
   * treating the first as the second put every tier above a floor of zero, which flagged all three
   * as unsatisfiable and — because a flagged tier is forced open — unfolded the whole editor on load.
   */
  const { data: booths, loading: floorLoading } = useBoothsState()
  const available = booths.reduce((s, b) => s + b.points, 0)
  const [rows, setRows] = useState<TierInput[]>([])
  // The editor is seeded from the live tiers until the admin touches it; after that another
  // admin's save is announced rather than silently overwriting the draft.
  const [dirty, setDirty] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const seeded = useRef('')
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  // The sold-out note is optional and rarely filled in, but it was rendered five columns wide on
  // every tier with the same long placeholder three times over. It appears when it has something
  // to say, or when asked for.
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({})
  /*
   * Which tiers are open for editing. Setting the policy is a before-the-event job; during the
   * festival this page is opened to read stock and adjust it, and fifteen inputs were in the way of
   * that. Collapsed, the three rows say what they are worth and what is left.
   */
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
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
  const rowProblems = rows.map((r) => !r.name.trim() ? 'needs a name' : !(r.thresholdPoints >= 1) ? 'needs a threshold of at least 1' : (!floorLoading && r.thresholdPoints > available) ? `needs ${r.thresholdPoints} points but only ${available} are on the floor` : null)
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
      <p className="mt-1 text-sm text-ink-soft">{floorLoading ? 'Counting base points…' : <>{available} base points across {booths.length} active booths. A threshold above that is refused, and one within 10 of it is flagged. Temporary booth adjustments do not change this policy limit.</>}</p>
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
          <h2 className="stamp-text text-ink-soft">Tiers</h2>
          {dirty && <span className="text-xs text-warn-text">Unsaved changes</span>}
        </div>
        <div className="mt-4">
          {rows.map((r, i) => {
            const t = tiers.find((x) => x.id === r.id)
            const warn = !floorLoading && r.thresholdPoints > available - 10
            const problem = rowProblems[i]
            const key = String(r.id ?? i)
            const id = `tier-${key}`
            const showNote = !!r.outOfStockNoteEn || !!noteOpen[key]
            /*
             * A tier that cannot be saved must not be able to hide: with the row shut, Save sits
             * disabled and the reason is off screen. A tier that has just been added opens too,
             * because an untouched blank row is not something anyone added on purpose.
             */
            const open = !!problem || (openRows[key] ?? !r.id)
            return (
              /*
               * A rule between tiers, not a panel around each. They were `bg-white/50` boxes inside a
               * white card — a card in a card, which reads as a smudge rather than a group and costs a
               * container to say nothing.
               */
              <details
                key={key} open={open}
                // Only a press is remembered. `toggle` fires for a programmatic open too, so without
                // this guard the force-open above writes itself in and outlives its cause.
                onToggle={(e) => { if (!problem) setOpenRows({ ...openRows, [key]: e.currentTarget.open }) }}
                className="reveal-host mt-4 border-t rule pt-4 first:mt-0 first:border-0 first:pt-0"
              >
                {/* The whole summary is the target, so the row reads as one thing you can press. No
                    button inside it: Remove lives in the body, where a destructive action belongs
                    rather than one slip away from a row you only meant to open. */}
                <summary className="press-row -mx-2 flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl px-2 py-1.5 hover:bg-ink/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40">
                  <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{r.name.trim() || <span className="text-ink-soft">New tier</span>}</h3>
                  {Number.isFinite(r.thresholdPoints) && <span className="text-sm tabular-nums text-ink-soft">{r.thresholdPoints} points</span>}
                  {r.grantsDrawEntry && <span className="rounded-full bg-foil/25 px-2 py-0.5 text-[11px] font-medium">Draw entry</span>}
                  {t && <span className="text-sm"><span className="fig text-lg">{fmt(t.stockRemaining)}</span> <span className="text-ink-soft">of {fmt(t.stockTotal)} left</span></span>}
                  <span aria-hidden className="w-4 shrink-0 text-right text-[10px] text-ink-soft transition-transform duration-150 [[open]_&]:rotate-180">▾</span>
                </summary>

                <div className="pt-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.6fr)]">
                    <div><L htmlFor={`${id}-name`}>Name</L><input id={`${id}-name`} className="field" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Explorer" /></div>
                    <div>
                      <L htmlFor={`${id}-pts`}>Unlocks at</L>
                      <div className="flex items-center gap-2">
                        <input id={`${id}-pts`} className={`field w-24 ${warn || problem ? 'border-warn' : ''}`} type="number" min={1} value={Number.isFinite(r.thresholdPoints) ? r.thresholdPoints : ''} onChange={(e) => set(i, { thresholdPoints: e.target.value === '' ? NaN : Number(e.target.value) })} />
                        <span className="text-sm text-ink-soft">points</span>
                      </div>
                      {/* A warn-coloured border and nothing else leaves the reason to colour alone. */}
                      {warn && !problem && <div className="mt-1 text-xs text-warn-text">Within 10 of the {available} on the floor.</div>}
                      {preview && r.id && preview[r.id] > 0 && <div className="mt-1 text-xs text-warn-text">Unlocks for {preview[r.id]} visitors.</div>}
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1"><L htmlFor={`${id}-reward`}>Reward</L><input id={`${id}-reward`} className="field" value={r.reward} onChange={(e) => set(i, { reward: e.target.value })} placeholder="Tote bag" /></div>
                  </div>

                  {!t && (
                    <div className="mt-3"><L htmlFor={`${id}-stock`}>Initial stock</L>
                      <input id={`${id}-stock`} className="field w-32" type="number" min={0} value={r.stockTotal ?? ''} onChange={(e) => set(i, { stockTotal: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.grantsDrawEntry} onChange={(e) => set(i, { grantsDrawEntry: e.target.checked })} />Stage draw entry</label>
                    {!showNote && <button type="button" className="btn-quiet btn-sm" onClick={() => setNoteOpen({ ...noteOpen, [key]: true })}>Add a sold-out message</button>}
                  </div>

                  {showNote && (
                    <div className="mt-3">
                      <L htmlFor={`${id}-note`}>Shown to visitors once it runs out</L>
                      <input id={`${id}-note`} className="field" value={r.outOfStockNoteEn ?? ''} onChange={(e) => set(i, { outOfStockNoteEn: e.target.value })} placeholder="e.g. Collect from the information desk after 15:00" />
                    </div>
                  )}

                  {problem && <div className="mt-2 text-xs text-danger-text">{r.name || 'This tier'} {problem}.</div>}

                  <div className="mt-4 flex justify-end">
                    {/* Dropping a row deactivates the tier on save (§6.7) — unlock history is never deleted. */}
                    <button type="button" className="btn-danger-soft btn-sm" onClick={() => { setDirty(true); setRows(rows.filter((_, j) => j !== i)) }}>
                      Remove{t ? ' on save' : ''}
                    </button>
                  </div>
                </div>
              </details>
            )
          })}
          {/* The rows no longer sit in a flex gap, so this needs its own clearance. */}
          {removed.length > 0 && (
            <div className="mt-5"><Notice tone="amber">
              {removed.map((t) => t.name).join(', ')} will be deactivated when you save. Visitors who already unlocked {removed.length === 1 ? 'it' : 'them'} keep the unlock.{' '}
              <button className="btn-quiet btn-sm ml-1" onClick={() => setDirty(false)}>Discard changes</button>
            </Notice></div>
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
          <h2 className="stamp-text text-ink-soft">Adjust stock</h2>
          <p className="mt-1 text-sm text-ink-soft">Counts are never typed over. Every change is a signed adjustment with a reason, so the closing figures reconcile with what was loaded in.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><L htmlFor="adj-tier">Tier</L><Select id="adj-tier" ariaLabel="Tier" value={adjust.tierId} onChange={(v) => setAdjust({ ...adjust, tierId: v })} placeholder="— tier —" options={tiers.map((t) => ({ value: t.id, label: t.name }))} /></div>
            <div><L htmlFor="adj-kind">Kind</L><Select id="adj-kind" ariaLabel="Kind" value={adjust.kind} onChange={(v) => setAdjust({ ...adjust, kind: v as 'restock' | 'correction' })} options={[{ value: 'restock', label: 'Restock (+)' }, { value: 'correction', label: 'Correction (±)' }]} /></div>
            <div><L htmlFor="adj-delta">Change (whole number, e.g. 50 or -3)</L><input id="adj-delta" className="field" type="number" step={1} value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} /></div>
            <div><L htmlFor="adj-reason">Reason (kept in the ledger)</L><input id="adj-reason" className="field" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} /></div>
          </div>
          <button className="btn-primary mt-3" disabled={!adjustOk || busy !== null} onClick={doAdjust}>{busy === 'adjust' ? 'Applying…' : 'Apply adjustment'}</button>
          {/* Columns, not `justify-between`: three free-width spans collided, so a long reason ate
              the amount and every row's figures landed somewhere different. */}
          <h3 className="mt-6 text-xs font-medium text-ink-soft">Recent adjustments</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            {adjustments.map((a) => (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 border-t rule pt-1.5 first:border-0 first:pt-0">
                <span className="truncate">
                  <span className="font-medium">{tiers.find((t) => t.id === a.tierId)?.name ?? a.tierId}</span>
                  <span className="text-ink-soft"> · {a.reason}</span>
                </span>
                <span className={`fig tabular-nums ${a.delta < 0 ? 'text-danger-text' : 'text-success-text'}`} title={a.kind}>{a.delta > 0 ? '+' : ''}{a.delta}</span>
                <span className="whitespace-nowrap tabular-nums text-ink-soft">{ts(a.createdAt)}</span>
              </li>
            ))}
            {adjustments.length === 0 && <li className="text-ink-soft">No adjustments yet. Stock stands at what the seed loaded in.</li>}
          </ul>
        </section>

        <section className="card">
          <h2 className="stamp-text text-ink-soft">Void a redemption</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Returns the item to stock and lets that visitor collect again. Easier from <Link to="/admin/users" className="link">Users</Link>: open the visitor and press <b>Void</b> beside the prize. This form needs the user ID shown there.
          </p>
          <div className="mt-3 grid gap-2">
            <div><L htmlFor="void-uid">User ID</L><input id="void-uid" className="field font-mono text-xs" value={voidForm.visitorId} onChange={(e) => setVoidForm({ ...voidForm, visitorId: e.target.value })} /></div>
            <div><L htmlFor="void-tier">Tier</L><Select id="void-tier" ariaLabel="Tier" value={voidForm.tierId} onChange={(v) => setVoidForm({ ...voidForm, tierId: v })} placeholder="— tier —" options={tiers.map((t) => ({ value: t.id, label: t.name }))} /></div>
            <div><L htmlFor="void-reason">Reason (kept in the audit log)</L><input id="void-reason" className="field" value={voidForm.reason} onChange={(e) => setVoidForm({ ...voidForm, reason: e.target.value })} /></div>
          </div>
          <button className="btn-danger mt-3" disabled={!voidForm.visitorId.trim() || !voidForm.tierId || !voidForm.reason.trim() || busy !== null} onClick={doVoid}>{busy === 'void' ? 'Voiding…' : 'Void redemption…'}</button>
        </section>
      </div>
    </div>
  )
}
