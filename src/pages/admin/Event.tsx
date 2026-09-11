import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, type EventRow, type PurgeScope } from '../../lib/api'
import { Notice, Spinner, Toast, fmt, type Msg } from '../../components/ui'
import { DateTimeField } from '../../components/DateTimeField'
import { useLabels } from '../../lib/labels'
import { useUnsavedGuard } from '../../lib/useUnsavedGuard'
import { dayOf, type Zone } from '../../../shared/model'
import { useLocale } from '../../lib/locale'
import type { StringKey } from '../../lib/strings'

const ZONES: Zone[] = ['entrance', 'middle', 'far']

type Form = {
  id?: string
  nameEn: string
  nameTh: string
  startsAt: string
  endsAt: string
  days: string[]
  qrPeriodSeconds: number
  passportPrefix: string
  zonePoints: Record<Zone, number>
}

/** `<input type="datetime-local">` wants local wall-clock, not an ISO instant. */
function toLocalInput(ms: number | null): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function daysBetween(startMs: number, endMs: number): string[] {
  const out: string[] = []
  for (let t = startMs; t <= endMs && out.length < 60; t += 86400_000) {
    const d = dayOf(new Date(t))
    if (!out.includes(d)) out.push(d)
  }
  const last = dayOf(new Date(endMs))
  if (!out.includes(last)) out.push(last)
  return out
}

function blank(): Form {
  const start = new Date(); start.setHours(9, 0, 0, 0)
  const end = new Date(start.getTime() + 2 * 86400_000); end.setHours(16, 0, 0, 0)
  return {
    nameEn: '', nameTh: '',
    startsAt: toLocalInput(start.getTime()), endsAt: toLocalInput(end.getTime()),
    days: daysBetween(start.getTime(), end.getTime()),
    qrPeriodSeconds: 20, passportPrefix: 'MFU-GG',
    zonePoints: { entrance: 10, middle: 15, far: 20 },
  }
}

function fromRow(r: EventRow): Form {
  return {
    id: r.id, nameEn: r.nameEn, nameTh: r.nameTh,
    startsAt: toLocalInput(r.startsAt), endsAt: toLocalInput(r.endsAt),
    days: r.days, qrPeriodSeconds: r.qrPeriodSeconds, passportPrefix: r.passportPrefix,
    zonePoints: r.zonePoints,
  }
}

/**
 * The steps of an archive-and-restart, in the order they must run. `scans` must go before
 * `booths` — the deterministic id `scans/{uid}_{boothId}` is what would otherwise stop a
 * returning visitor re-stamping a reused booth id.
 */
const CLEAR_STEPS: Array<{ scope: PurgeScope; label: StringKey }> = [
  { scope: 'scans', label: 'event.scope.scans' },
  { scope: 'tierUnlocks', label: 'event.scope.tierUnlocks' },
  { scope: 'stockAdjustments', label: 'event.scope.stockAdjustments' },
  { scope: 'draws', label: 'event.scope.draws' },
  { scope: 'buckets', label: 'event.scope.buckets' },
  { scope: 'invites', label: 'event.scope.invites' },
  { scope: 'rateLimits', label: 'event.scope.rateLimits' },
  { scope: 'counters', label: 'event.scope.counters' },
  { scope: 'visitors', label: 'event.scope.visitors' },
  // `eventStats` is deliberately last, and repeated after a settle below: deleting a visitor
  // fires onUserWrite, which decrements the shards. Clearing them first lets those late
  // deltas recreate the shards at negative values, and the next event opens below zero.
  { scope: 'eventStats', label: 'event.scope.eventStats' },
]

export default function EventAdmin() {
  const { t } = useLocale()
  const { ZONE_LABEL } = useLabels()
  const [rows, setRows] = useState<EventRow[] | null>(null)
  const [liveId, setLiveId] = useState<string>('')
  const [form, setForm] = useState<Form | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)
  // What was loaded, to know when the form has unsaved edits.
  const [loaded, setLoaded] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const r = await api.listEvents({})
      setRows(r.events); setLiveId(r.liveId)
      const live = r.events.find((e) => e.id === r.liveId)
      setForm((f) => { const next = f ?? (live ? fromRow(live) : blank()); setLoaded(JSON.stringify(next)); return next })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }, [])

  useEffect(() => { void load() }, [load])

  function setDates(startsAt: string, endsAt: string) {
    if (!form) return
    const a = startsAt ? new Date(startsAt).getTime() : 0
    const b = endsAt ? new Date(endsAt).getTime() : 0
    setForm({ ...form, startsAt, endsAt, days: a && b && b >= a ? daysBetween(a, b) : form.days })
  }

  async function save() {
    if (!form) return
    setBusy(true); setMsg(null)
    try {
      const payload = {
        nameEn: form.nameEn, nameTh: form.nameTh,
        startsAt: new Date(form.startsAt).getTime(),
        endsAt: new Date(form.endsAt).getTime(),
        days: form.days, qrPeriodSeconds: form.qrPeriodSeconds,
        passportPrefix: form.passportPrefix, zonePoints: form.zonePoints,
      }
      if (form.id) { await api.updateEvent({ id: form.id, ...payload }); setMsg({ tone: 'green', text: t('event.saved') }); setLoaded(JSON.stringify(form)) }
      else { const r = await api.createEvent(payload); setForm({ ...form, id: r.id }); setMsg({ tone: 'green', text: t('event.created', { id: r.id }) }) }
      await load()
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  async function goLive(id: string) {
    setBusy(true); setMsg(null)
    try { await api.goLive({ id }); setMsg({ tone: 'green', text: t('event.nowLive') }); await load() }
    catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  async function deleteDraft(r: EventRow) {
    if (!window.confirm(t('event.deleteDraftConfirm', { name: r.nameEn }))) return
    setBusy(true); setMsg(null)
    try {
      await api.deleteEvent({ id: r.id })
      if (form?.id === r.id) setForm(blank())
      setMsg({ tone: 'green', text: t('event.draftDeleted', { id: r.id }) })
      await load()
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  const live = rows?.find((e) => e.id === liveId) ?? null
  const dirty = !!form && JSON.stringify(form) !== loaded
  useUnsavedGuard(dirty)
  // An emptied number field used to save as 0 (a QR period of 0 s, a zone worth 0 points).
  const periodOk = !!form && form.qrPeriodSeconds >= 10 && form.qrPeriodSeconds <= 120
  const zonesOk = !!form && ZONES.every((z) => form.zonePoints[z] >= 1 && form.zonePoints[z] <= 100)

  if (!rows || !form) return <Spinner label={t('event.loading')} />

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">{t('event.title')}</h1>
        <p className="text-sm text-ink-soft">
          The app runs one event at a time. Its name, dates, days, QR period and default points live
          here; booths, prizes and people are set up on their own pages.
        </p>
      </header>

      <Toast msg={msg} onClose={() => setMsg(null)} />

      <section className="card mt-5 grid gap-4 md:grid-cols-2">
        <h2 className="stamp-text text-ink-soft md:col-span-2">
          {form.id === liveId ? t('event.current') : form.id ? t('event.draft', { id: form.id }) : t('event.newEvent')}
          {form.id !== liveId && live && (
            <button className="btn-quiet btn-sm ml-3 normal-case tracking-normal" onClick={() => { setForm(fromRow(live)); setMsg(null) }}>{t('event.backToCurrent')}</button>
          )}
        </h2>
        <label>{t('event.nameEn')}<input className="field mt-1" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></label>
        <label>{t('event.nameTh')}<input className="field mt-1" value={form.nameTh} onChange={(e) => setForm({ ...form, nameTh: e.target.value })} /></label>
        <div>{t('event.starts')}<div className="mt-1"><DateTimeField id="ev-starts" ariaLabel={t('event.starts')} value={form.startsAt} onChange={(v) => setDates(v, form.endsAt)} /></div></div>
        <div>{t('event.ends')}<div className="mt-1"><DateTimeField id="ev-ends" ariaLabel={t('event.ends')} value={form.endsAt} onChange={(v) => setDates(form.startsAt, v)} /></div></div>

        <fieldset className="md:col-span-2">
          <legend className="stamp-text text-ink-soft">{t('event.days')}</legend>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {(form.startsAt && form.endsAt ? daysBetween(new Date(form.startsAt).getTime(), new Date(form.endsAt).getTime()) : form.days).map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input type="checkbox" checked={form.days.includes(d)}
                  onChange={(e) => setForm({ ...form, days: e.target.checked ? [...form.days, d].sort() : form.days.filter((x) => x !== d) })} />
                {t('event.dayN', { n: i + 1 })} · {d}
              </label>
            ))}
          </div>
        </fieldset>

        <label>{t('event.qrPeriod')}
          <input className={`field mt-1 ${periodOk ? '' : 'border-danger'}`} type="number" min={10} max={120} value={Number.isFinite(form.qrPeriodSeconds) ? form.qrPeriodSeconds : ''}
            onChange={(e) => setForm({ ...form, qrPeriodSeconds: e.target.value === '' ? NaN : Number(e.target.value) })} />
          {!periodOk && <span className="text-xs text-danger-text">{t('event.qrRange')}</span>}
        </label>
        <label>{t('event.prefix')}
          <input className="field mt-1" value={form.passportPrefix} onChange={(e) => setForm({ ...form, passportPrefix: e.target.value.toUpperCase() })} />
          <span className="text-xs text-ink-soft">{t('event.prefixHint', { prefix: form.passportPrefix || 'MFU-GG' })}</span>
        </label>

        <fieldset className="md:col-span-2">
          <legend className="stamp-text text-ink-soft">{t('event.zonePoints')}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {ZONES.map((z) => (
              <label key={z} className="text-sm">{ZONE_LABEL[z]}
                <input className={`field mt-1 ${form.zonePoints[z] >= 1 && form.zonePoints[z] <= 100 ? '' : 'border-danger'}`} type="number" min={1} max={100} value={Number.isFinite(form.zonePoints[z]) ? form.zonePoints[z] : ''}
                  onChange={(e) => setForm({ ...form, zonePoints: { ...form.zonePoints, [z]: e.target.value === '' ? NaN : Number(e.target.value) } })} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {t('event.zoneNote')}
          </p>
        </fieldset>

        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className="btn-primary" disabled={busy || !form.nameEn.trim() || !form.startsAt || !form.endsAt || !periodOk || !zonesOk || (!!form.id && !dirty)} onClick={save}>
            {t(busy ? 'common.saving' : form.id ? 'common.save' : 'event.createDraft')}
          </button>
          {dirty && form.id && <span className="self-center text-xs text-warn-text">{t('event.unsaved')}</span>}
          {form.id && form.id !== liveId && (
            <button className="btn-gold" disabled={busy} onClick={() => goLive(form.id!)}>{t('event.goLive')}</button>
          )}
        </div>
      </section>

      {/* Everything about a *second* event stays folded away: day to day there is only the one above. */}
      <details className="reveal-host mt-8 rounded-2xl border rule p-4">
        <summary className="cursor-pointer rounded-lg transition hover:text-ink">
          <span className="stamp-text text-ink-soft">{t('event.after')}</span>
        </summary>
        <p className="mt-3 text-sm text-ink-soft">
          {t('event.afterLead')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => { setForm(blank()); setMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t('event.newDraft')}</button>
        </div>
        <h2 className="stamp-text mt-5 text-ink-soft">{t('event.all')}</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="card text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.nameEn}</div>
                  <div className="text-xs text-ink-soft">{r.id} · {r.days.length} days · {fmt(r.boothCount)} booths</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  r.status === 'live' ? 'bg-success/15 text-success-text' : r.status === 'draft' ? 'bg-warn/15 text-warn-text' : 'bg-ink/10 text-ink-soft'
                }`}>{r.status}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button className="btn-quiet btn-sm" onClick={() => { setForm(fromRow(r)); setMsg(null) }}>{t('event.edit')}</button>
                {r.status !== 'live' && <button className="btn-gold btn-sm" disabled={busy} onClick={() => goLive(r.id)}>{t('event.goLive')}</button>}
                {r.status === 'draft' && <button className="btn-danger-soft btn-sm" disabled={busy} onClick={() => deleteDraft(r)}>{t('event.deleteDraft')}</button>}
              </div>
            </li>
          ))}
        </ul>
        {live && <DangerZone live={live} onDone={load} />}
      </details>
    </div>
  )
}

/**
 * Archive the live event and start the next one. Every step is a separate call so nothing
 * runs past the callable timeout on a full three-day dataset, and the admin can see progress.
 */
function DangerZone({ live, onDone }: { live: EventRow; onDone: () => Promise<void> }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [keepBooths, setKeepBooths] = useState(true)
  const [keepTiers, setKeepTiers] = useState(true)
  const [hardDelete, setHardDelete] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const say = (s: string) => setLog((l) => [...l, s])

  async function drain(scope: PurgeScope, label: string, hard = false) {
    say(`${label}…`)
    let total = 0, idle = 0, remaining = 0, done = false
    for (let guard = 0; guard < 500 && !done; guard++) {
      const r = await api.purgeEventData({ eventId: live.id, scope, hard })
      total += r.deleted; remaining = r.remaining; done = r.done
      // A scope that reports work left but clears nothing three times running is stuck; stop
      // rather than spend the whole budget on it.
      idle = r.deleted === 0 && !r.done ? idle + 1 : 0
      if (idle >= 3) break
    }
    if (!done) {
      // Used to fall out of the loop and log the step as cleared; an unfinished purge must say so.
      setLog((l) => [...l.slice(0, -1), `${label} — incomplete, ${fmt(remaining)} still to clear`])
      throw new Error(`${label}: stopped with ${fmt(remaining)} item${remaining === 1 ? '' : 's'} still to clear. Wait a moment and run the archive again; steps already cleared will report nothing to clear.`)
    }
    setLog((l) => [...l.slice(0, -1), `${label} — ${total ? `${total} cleared` : 'nothing to clear'}`])
  }

  async function run() {
    setRunning(true); setErr(null); setLog([]); setDone(false)
    try {
      say(t('event.freezing'))
      const a = await api.archiveEvent({ id: live.id, confirmName })
      setLog((l) => [...l.slice(0, -1), t('event.archived', { visitors: fmt(a.totals.visitors), stamps: fmt(a.totals.stamps), prizes: fmt(a.totals.redeemed) })])

      for (const step of CLEAR_STEPS) {
        await drain(step.scope, t(step.label), step.scope === 'visitors' && hardDelete)
      }
      if (keepBooths) {
        await drain('boothStats', t('event.stepBoothStats'))
        await drain('rotateSecrets', t('event.stepRotate'))
      } else {
        await drain('booths', t('event.stepBooths'))
      }
      if (keepTiers) await drain('resetTierStock', t('event.stepResetStock'))
      else await drain('prizeTiers', t('event.stepTiers'))

      // Let any trailing onUserWrite / onScanCreate deltas land, then clear the counters again.
      say(t('event.settling'))
      await new Promise((r) => setTimeout(r, 6000))
      await api.purgeEventData({ eventId: live.id, scope: 'eventStats' })
      setLog((l) => [...l.slice(0, -1), t('event.settled')])

      setDone(true)
      await onDone()
    } catch (e) {
      setErr(errorMessage(e))
    } finally { setRunning(false) }
  }

  return (
    <section className="mt-8 rounded-2xl border-2 border-danger/40 p-4">
      <h2 className="stamp-text text-danger-text">{t('event.danger')}</h2>
      <p className="mt-2 text-sm text-ink-soft">
        {t('event.dangerBefore')} <b>{live.nameEn}</b> {t('event.dangerAfter')}
      </p>

      {!open ? (
        <button className="btn-danger mt-3" onClick={() => setOpen(true)}>{t('event.archiveStart')}</button>
      ) : (
        <div className="mt-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepBooths} onChange={(e) => setKeepBooths(e.target.checked)} disabled={running} />
            {t('event.keepBooths')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepTiers} onChange={(e) => setKeepTiers(e.target.checked)} disabled={running} />
            {t('event.keepTiers')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hardDelete} onChange={(e) => setHardDelete(e.target.checked)} disabled={running} />
            {t('event.hardDelete')}
          </label>

          <label className="text-sm">{t('event.typeToConfirm')} <b>{live.nameEn}</b> {t('event.toConfirm')}
            <input className="field mt-1" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} disabled={running} />
          </label>

          <div className="flex flex-wrap gap-2">
            <button className="btn-danger" disabled={running || confirmName.trim().toLowerCase() !== live.nameEn.trim().toLowerCase()} onClick={run}>
              {t(running ? 'event.working' : 'event.archiveClear')}
            </button>
            <button className="btn-ghost" disabled={running} onClick={() => { setOpen(false); setLog([]); setErr(null) }}>{t('event.cancel')}</button>
          </div>

          {log.length > 0 && (
            <ol className="mt-2 rounded-xl bg-ink/5 p-3 text-sm">
              {log.map((l, i) => <li key={i} className="tabular-nums">{l}</li>)}
            </ol>
          )}
          {err && <Notice tone="red">{err}</Notice>}
          {done && (
            <Notice tone="green">
              {t('event.clearedBefore')} <code>archives/{live.id}</code>. {t('event.clearedAfter')}{keepBooths ? '' : t('event.clearedBooths')}{keepTiers ? '' : t('event.clearedTiers')}{t('event.clearedThen')} <b>{t('event.goLive')}</b>.
            </Notice>
          )}
        </div>
      )}
    </section>
  )
}
