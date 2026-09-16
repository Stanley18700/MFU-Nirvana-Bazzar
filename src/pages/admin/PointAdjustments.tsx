import { useEffect, useRef, useState } from 'react'
import type { BoothDoc } from '../../../shared/model'
import { nextCheck, type BoostReason, type PointPreview, MAX_BOOSTS_PER_GROUP, MIN_GROUP_MEDIAN, MIN_GROUP_SIZE } from '../../../shared/points'
import { api, errorMessage } from '../../lib/api'
import { pointTime, usePointsClock } from '../../lib/points'
import { Notice } from '../../components/ui'

/*
 * The balancer's admin card. It checks on its own at every quarter hour while the page is open
 * and says in one line whether anything wants attention, so nobody has to remember a button.
 * Approving is still a person's decision.
 *
 * Boost-only: a quiet booth is offered EXTRA points for 30 minutes; nothing is ever cut. Booths
 * are compared only with others worth the same right now (27s with 28s, 15s with 16s, 12s with
 * 12s), against that group's median, and a booth with no scan in the last hour is treated as
 * not open rather than quiet.
 */

const reasons: Record<BoostReason, string> = {
  quiet: 'Quiet · boost offered',
  typical: 'Near the group median',
  'no-scans': 'No scans in the last hour · not open?',
  boosted: 'Boost already running',
  capped: `Quiet, but the group already has ${MAX_BOOSTS_PER_GROUP} boosts`,
  'small-group': 'Too few comparable booths to judge',
}

export function PointAdjustments({ booths }: { booths: Array<BoothDoc & { id: string }> }) {
  const now = usePointsClock()
  const [preview, setPreview] = useState<PointPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [nextApplyAt, setNextApplyAt] = useState(0)
  const [open, setOpen] = useState(false)
  const expired = preview ? now >= preview.validUntil : false
  const cooldown = Math.max(nextApplyAt, preview?.nextApplyAt ?? 0)
  const live = booths.filter((b) => (b.boostUntil ?? 0) > now && (b.boostPoints ?? 0) > 0)

  async function act(work: () => Promise<void>) {
    setBusy(true); setError(null); setMessage(null)
    try { await work() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const check = () => act(async () => {
    const p = await api.previewPointAdjustments({})
    setPreview(p); setNextApplyAt(p.nextApplyAt)
    // A round with something to approve opens itself; a quiet one stays folded.
    if (p.offered > 0) setOpen(true)
  })

  // Check once on arrival, then on every quarter hour. A ref keeps the timer on the latest
  // closure without restarting it each second when `now` ticks.
  const checkRef = useRef(check)
  checkRef.current = check
  useEffect(() => {
    void checkRef.current()
    let timer = 0
    const arm = () => {
      // Ten seconds after the boundary, so the window the server compares has actually closed.
      timer = window.setTimeout(() => { void checkRef.current(); arm() }, nextCheck(Date.now()) + 10_000 - Date.now())
    }
    arm()
    return () => window.clearTimeout(timer)
  }, [])

  const candidates = booths.filter((b) => b.active && !b.isPrizeDesk)
  const tooEarly = preview ? preview.createdAt < preview.notBefore : false
  const offered = preview?.rows.filter((r) => r.boostPoints > 0) ?? []
  // Defensive against a preview from a function deployed before groups existed.
  const groups = preview?.groups ?? []

  return <section className="card mt-5" aria-labelledby="point-adjustments-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="point-adjustments-title" className="text-lg font-bold">Balance booth visits</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every quarter hour, booths worth the same right now are compared over the last 30 completed minutes. A booth well below its group's
          median can be given extra points for 30 minutes — nothing is ever cut. Approve here; stamps already collected are unchanged.
        </p>
      </div>
      <button className="btn-ghost shrink-0" disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check now'}</button>
    </div>

    {/* The one line that matters, in the reader's language of "do I need to do anything". */}
    <div className="mt-3" aria-live="polite">
      {error && <Notice tone="red">{error}</Notice>}
      {message && <Notice tone="green">{message}</Notice>}
      {!error && preview && (
        offered.length > 0
          ? <Notice tone="amber">
              <b>{offered.length} quiet {offered.length === 1 ? 'booth' : 'booths'}</b> could use a boost —
              {' '}{offered.map((r) => `${r.name} (${r.currentPoints + r.activeBoost} → ${r.suggestedPoints})`).join(', ')}.
              {' '}Review below and approve before {pointTime(preview.validUntil)}.
            </Notice>
          : tooEarly
            ? <Notice tone="info">Too early — suggestions start at {pointTime(preview.notBefore)} (Bangkok), half an hour after opening. Next check {pointTime(preview.nextCheckAt)}.</Notice>
            : <Notice tone="green">Checked at {pointTime(preview.createdAt)}: nothing to do. {live.length ? `${live.length} boost${live.length === 1 ? '' : 's'} running. ` : ''}Next check {pointTime(preview.nextCheckAt)} (Bangkok).</Notice>
      )}
    </div>

    {live.length > 0 && <div className="mt-3 text-sm">
      <span className="font-semibold">Running now:</span>{' '}
      {live.map((b) => `${b.nameEn} +${b.boostPoints} until ${pointTime(b.boostUntil!)}`).join(' · ')}
    </div>}

    <details className="mt-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold">
        {preview ? `Details · ${preview.totalScans} scans ${pointTime(preview.windowStart)}–${pointTime(preview.windowEnd)} across ${groups.length} group${groups.length === 1 ? '' : 's'}` : 'Details'}
      </summary>
      {preview && <div className="mt-3">
        {groups.map((g) => {
          const rows = preview.rows.filter((r) => r.groupKey === g.key)
          return <div key={g.key} className="mt-4 first:mt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{g.label}</h3>
              <p className="text-xs text-ink-soft">
                {g.comparable} of {g.size} booths open · median {g.median} scans
                {g.live ? ` · ${g.live} boost${g.live === 1 ? '' : 's'} running` : ''}
                {!g.sufficient && !tooEarly ? ` · needs ${MIN_GROUP_SIZE}+ open booths and a median of ${MIN_GROUP_MEDIAN}+` : ''}
              </p>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Booths worth {g.label}</caption>
                <thead><tr className="border-b rule">{['Booth', 'Scans', 'Worth now', 'Boost', 'If approved', 'Why'].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
                <tbody>{rows.map((r) => <tr key={r.boothId} className={`border-b rule ${r.boostPoints > 0 ? 'bg-warn-bg/60' : ''}`}>
                  <th scope="row" className="p-2 font-medium">{r.name}</th>
                  <td className="p-2 tabular-nums">{r.scans}</td>
                  <td className="p-2 tabular-nums">{r.currentPoints + r.activeBoost}</td>
                  <td className="p-2 tabular-nums font-bold">{r.boostPoints > 0 ? `+${r.boostPoints}` : '—'}</td>
                  <td className="p-2 tabular-nums font-bold">{r.suggestedPoints}</td>
                  <td className="p-2 text-ink-soft">{reasons[r.reason]}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        })}
        <p className="mt-3 text-sm">Total on offer across today's booths if approved: <b>{preview.availablePoints} points</b>.</p>
        {preview.unreachableTiers.length > 0 && <div className="mt-2"><Notice tone="amber">Above this total: {preview.unreachableTiers.map((t) => `${t.name} (${t.thresholdPoints} points)`).join(', ')}. Prize thresholds and existing unlocks stay unchanged.</Notice></div>}
        <p className="mt-2 text-xs text-ink-soft">Whole points, never above 100. Preview valid until {pointTime(preview.validUntil)}; boosts last 30 minutes from approval, then the booth returns to its scheduled value.</p>
        {expired && <p className="mt-2 text-sm text-warn-text">This preview expired. Check again.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={busy || offered.length === 0 || expired || now < cooldown} onClick={() => void act(async () => {
            const result = await api.applyPointAdjustments({ previewId: preview.id })
            setNextApplyAt(result.nextApplyAt); setPreview(null)
            setMessage(`${result.boosted} boost${result.boosted === 1 ? '' : 's'} running until ${pointTime(result.expiresAt)} (Bangkok).`)
          })}>Approve {offered.length ? `${offered.length} boost${offered.length === 1 ? '' : 's'}` : 'boosts'}</button>
          {now < cooldown && <span className="text-sm text-ink-soft">Next approval possible at {pointTime(cooldown)} (Bangkok).</span>}
        </div>
      </div>}
    </details>

    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">Exclude closed or special booths</summary>
      <p className="mt-2 text-xs text-ink-soft">Excluded booths keep their scheduled value and do not affect the comparison. Prize desks and booths not scheduled today are omitted automatically.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {candidates.map((b) => <label key={b.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.adjustmentExcluded ?? false} disabled={busy} onChange={(e) => {
            const excluded = e.target.checked
            void act(async () => { await api.updateBooth({ id: b.id, adjustmentExcluded: excluded }); setPreview(null) })
          }} /> Exclude {b.nameEn}
        </label>)}
      </div>
    </details>

    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button className="btn-ghost" disabled={busy || live.length === 0} onClick={() => void act(async () => {
        const r = await api.resetPointAdjustments({}); setPreview(null)
        setMessage(`${r.cleared} boost${r.cleared === 1 ? '' : 's'} cleared. Scheduled values and earned points are unchanged.`)
      })}>Clear running boosts</button>
      <span className="text-xs text-ink-soft">Only boosts. The morning/afternoon values set by the scoring script are never touched here.</span>
    </div>
  </section>
}
