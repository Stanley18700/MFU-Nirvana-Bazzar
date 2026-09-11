import { useState } from 'react'
import type { BoothDoc } from '../../../shared/model'
import type { PointPreview } from '../../../shared/points'
import { api, errorMessage } from '../../lib/api'
import { pointTime, usePointsClock } from '../../lib/points'
import { Notice } from '../../components/ui'

const reasons = { quiet: 'Below 75% of average · +25%', typical: 'Near average · base points', busy: 'Above 125% of average · −25%' }

export function PointAdjustments({ booths }: { booths: Array<BoothDoc & { id: string }> }) {
  const now = usePointsClock()
  const [preview, setPreview] = useState<PointPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [nextApplyAt, setNextApplyAt] = useState(0)
  const expires = preview ? now >= preview.validUntil : false
  const cooldown = Math.max(nextApplyAt, preview?.nextApplyAt ?? 0)
  async function act(work: () => Promise<void>) {
    setBusy(true); setError(null); setMessage(null)
    try { await work() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const candidates = booths.filter((b) => b.active && !b.isPrizeDesk)
  return <section className="card mt-5" aria-labelledby="point-adjustments-title">
    <h2 id="point-adjustments-title" className="text-lg font-bold">Balance booth visits</h2>
    <p className="mt-1 text-sm text-ink-soft">Compare the last 30 completed minutes of scans. Quiet booths get 25% more than base points; busy booths get 25% less. Review before applying. Changes last 30 minutes and affect future stamps only.</p>
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">Exclude closed or special booths</summary>
      <p className="mt-2 text-xs text-ink-soft">Excluded booths keep base points and do not affect the comparison. Prize desks and booths not scheduled today are automatically omitted.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {candidates.map((b) => <label key={b.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.adjustmentExcluded ?? false} disabled={busy} onChange={(e) => {
            const excluded = e.target.checked
            void act(async () => { await api.updateBooth({ id: b.id, adjustmentExcluded: excluded }); setPreview(null) })
          }} /> Exclude {b.nameEn}
        </label>)}
      </div>
    </details>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={busy} onClick={() => void act(async () => {
        setPreview(null)
        const p = await api.previewPointAdjustments({})
        setPreview(p); setNextApplyAt(p.nextApplyAt)
      })}>{busy ? 'Working…' : 'Suggest point adjustments'}</button>
      <button className="btn-ghost" disabled={busy} onClick={() => void act(async () => {
        await api.resetPointAdjustments({}); setPreview(null)
        setMessage('All temporary rewards reset to base points. Earned points are unchanged.')
      })}>Reset to base points</button>
    </div>
    <div className="mt-3" aria-live="polite">
      {error && <Notice tone="red">{error}</Notice>}
      {message && <Notice tone="green">{message}</Notice>}
    </div>
    {preview && <div className="mt-4">
      <p className="text-sm">Scans from {pointTime(preview.windowStart)}–{pointTime(preview.windowEnd)} (Bangkok). {preview.totalScans} scans across {preview.rows.length} booths; average {preview.average.toFixed(1)}.</p>
      {!preview.sufficient && <div className="mt-3"><Notice tone="amber">Not enough recent participation. At least 3 eligible booths and {preview.minimumScans} scans are needed. No changes will be applied.</Notice></div>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Proposed booth rewards for the next 30 minutes</caption>
          <thead><tr className="border-b rule">{['Booth', 'Scans', 'Base', 'At preview', 'Suggested', 'Reason'].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{preview.rows.map((r) => <tr key={r.boothId} className="border-b rule">
            <th scope="row" className="p-2 font-medium">{r.name}</th>
            <td className="p-2 tabular-nums">{r.scans}</td><td className="p-2 tabular-nums">{r.basePoints}</td>
            <td className="p-2 tabular-nums">{r.currentPoints}</td><td className="p-2 font-bold tabular-nums">{r.suggestedPoints}</td>
            <td className="p-2">{preview.sufficient ? reasons[r.reason] : 'Insufficient data · unchanged'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">Proposed total across today’s active activity booths: <b>{preview.availablePoints} points</b>. Individual eligibility depends on each visitor’s earned stamps.</p>
      {preview.unreachableTiers.length > 0 && <div className="mt-2"><Notice tone="amber">Above this total: {preview.unreachableTiers.map((t) => `${t.name} (${t.thresholdPoints} points)`).join(', ')}. Prize thresholds and existing unlocks will stay unchanged.</Notice></div>}
      <p className="mt-2 text-xs text-ink-soft">Whole-point rounding and the 1–100 limit apply. Preview valid until {pointTime(preview.validUntil)}. Rewards expire 30 minutes after you apply them.</p>
      {expires && <p className="mt-2 text-sm text-warn-text">This preview expired. Generate a new preview.</p>}
      <button className="btn-primary mt-3" disabled={busy || !preview.sufficient || expires || now < cooldown} onClick={() => void act(async () => {
        const result = await api.applyPointAdjustments({ previewId: preview.id })
        setNextApplyAt(result.nextApplyAt); setPreview(null)
        setMessage(`Points applied until ${pointTime(result.expiresAt)} (Bangkok), then automatically return to base points.`)
      })}>Apply reviewed points</button>
    </div>}
    {now < cooldown && <p className="mt-3 text-sm text-ink-soft">Next adjustment available at {pointTime(cooldown)} (Bangkok). Reset is available immediately.</p>}
  </section>
}
