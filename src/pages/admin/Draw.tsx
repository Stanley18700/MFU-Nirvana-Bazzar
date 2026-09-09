import { useState } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { useCollection, useTiers } from '../../lib/data'
import { Notice, fmt } from '../../components/ui'
import { ts } from '../../lib/eventText'
import type { TierUnlockDoc } from '../../../shared/model'

export type DrawName = { uid: string; displayName: string; passportNo: string }
type DrawDoc = { names: DrawName[]; poolSize: number; createdAt: unknown }

/**
 * §6.7 — the closing stage draw. This is the operator's console; the reveal belongs to the hall
 * screen, which is the surface already pointed at the projector.
 *
 * The page used to be the reveal as well, which meant the audience saw either nothing or an admin
 * sidebar. It also withheld the one number anyone standing on a stage needs first — how many people
 * are in the hat — until after the draw had been run, because the pool size only came back in the
 * response. The pool is derived here from the same three facts the server uses, so it is on screen
 * before the button is pressed and it moves as visitors qualify during the day.
 */
export default function Draw() {
  const [count, setCount] = useState<number>(1)
  const countOk = Number.isInteger(count) && count >= 1 && count <= 20
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const drawTiers = useTiers().filter((t) => t.grantsDrawEntry && t.active)
  const tierIds = drawTiers.map((t) => t.id)
  const unlocks = useCollection<TierUnlockDoc>(
    tierIds.length ? query(collection(db, 'tierUnlocks'), where('tierId', 'in', tierIds.slice(0, 30))) : null,
    [tierIds.join()], 'the draw pool',
  ).data
  // Every draw, not a page of them: the server excludes winners from all of history, so a capped
  // query here would quietly report a pool larger than the one that will actually be drawn from.
  const history = useCollection<DrawDoc>(query(collection(db, 'draws'), orderBy('createdAt', 'desc')), [], 'the draw history').data

  const won = new Set(history.flatMap((d) => d.names.map((n) => n.uid)))
  const eligible = new Set(unlocks.filter((u) => !u.voidedAt).map((u) => u.visitorId))
  const pool = [...eligible].filter((uid) => !won.has(uid)).length
  const last = history[0]

  async function run() {
    if (!countOk) return
    if (history.length > 0 && !window.confirm(`Draw ${count} more winner${count === 1 ? '' : 's'}? Everyone already drawn stays out, and this is logged as a separate draw.`)) return
    setBusy(true); setErr(null)
    try { await api.runDraw({ count }) } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Stage draw</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Picks at random from visitors holding a tier that grants a draw entry. Everyone already drawn is excluded, and every draw is logged.
      </p>

      {drawTiers.length === 0 ? (
        <div className="mt-4">
          <Notice tone="amber">
            No tier grants a draw entry yet, so there is nobody to draw from. Tick <b>Stage draw entry</b> on a tier in Prizes &amp; stock.
          </Notice>
        </div>
      ) : (
        <section className="card mt-4">
          {/* The three facts you are asked for on stage, before anything is pressed. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="fig text-4xl text-action">{fmt(pool)}</div>
              <div className="mt-1 text-xs text-ink-soft">in the hat</div>
            </div>
            <div>
              <div className="fig text-4xl">{fmt(won.size)}</div>
              <div className="mt-1 text-xs text-ink-soft">already drawn, excluded</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{drawTiers.map((t) => t.name).join(', ')}</div>
              <div className="mt-1 text-xs text-ink-soft">grants the entry</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3 border-t rule pt-5">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Winners</span>
              <input type="number" min={1} max={20} className={`field w-24 ${countOk ? '' : 'border-danger'}`}
                value={Number.isFinite(count) ? count : ''} onChange={(e) => setCount(e.target.value === '' ? NaN : Number(e.target.value))} />
            </label>
            <button className="btn-gold px-8 py-3 text-lg" onClick={run} disabled={busy || !countOk || pool === 0}>
              {busy ? 'Drawing…' : 'Draw'}
            </button>
            <p className="flex-1 text-xs text-ink-soft">
              The reveal plays on the{' '}
              <a href="/admin/wall" target="_blank" rel="noreferrer" className="link">hall screen ↗</a>, which takes over from the live stats for a minute and then returns to them.
            </p>
          </div>
          {!countOk && <p className="mt-2 text-xs text-warn-text">Choose between 1 and 20 winners.</p>}
          {pool === 0 && <p className="mt-2 text-xs text-warn-text">Nobody is eligible right now. {won.size > 0 ? 'Everyone who qualified has already been drawn.' : 'No visitor has reached a tier that grants an entry yet.'}</p>}
          {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}
        </section>
      )}

      {/* What the hall is showing, repeated here so the name can be read out from the console. */}
      {last && (
        <section className="card mt-4">
          <h2 className="stamp-text text-ink-soft">On the hall screen now</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {last.names.map((n) => (
              <li key={n.uid} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t rule pt-2 first:border-0 first:pt-0">
                <span className="text-xl font-semibold">{n.displayName}</span>
                <span className="font-mono text-sm text-ink-soft">{n.passportNo}</span>
              </li>
            ))}
            {last.names.length === 0 && <li className="text-sm text-ink-soft">That draw found nobody eligible.</li>}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">Drawn from {fmt(last.poolSize)} entries at {ts(last.createdAt)}.</p>
        </section>
      )}

      {history.length > 1 && (
        <section className="card mt-4">
          <h2 className="stamp-text text-ink-soft">Every draw</h2>
          {/* A table, not the comma-joined run-on line this used to be: at a ceremony the question
              is "has this person already won", and that needs one name per row. */}
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="stamp-text text-left text-[10px] text-ink-soft">
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">Winner</th>
                <th className="pb-2 font-medium">Passport</th>
                <th className="pb-2 text-right font-medium">Pool</th>
              </tr>
            </thead>
            <tbody>
              {history.flatMap((d) => d.names.map((n, j) => (
                <tr key={`${d.id}-${n.uid}`} className="border-t rule">
                  <td className="whitespace-nowrap py-2 text-xs tabular-nums text-ink-soft">{j === 0 ? ts(d.createdAt) : ''}</td>
                  <td className="py-2 font-medium">{n.displayName}</td>
                  <td className="py-2 font-mono text-xs">{n.passportNo}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">{j === 0 ? fmt(d.poolSize) : ''}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
