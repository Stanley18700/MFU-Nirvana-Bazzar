import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { ref as sref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { api, errorMessage, type BoothInput } from '../../lib/api'
import { useBooths, useCollection, useEvent } from '../../lib/data'
import { Stamp } from '../../components/Stamp'
import { stampMarks } from '../../lib/eventText'
import { CopyButton, Notice, Toast, type Msg } from '../../components/ui'
import { ZONE_LABEL } from '../../lib/labels'
import { numOpt } from '../../lib/form'
import { ACCENTS, type BoothDoc, type InviteDoc, type UserDoc, type Zone } from '../../../shared/model'

type Row = BoothDoc & { id: string }
const empty: BoothInput = { nameEn: '', nameTh: '', shortName: '', hostUnit: '', location: '', descriptionEn: '', zone: 'entrance', points: 10, isPrizeDesk: false, active: true }
const FILTER_FROM = 9

/** §6.3 / §6.6 — booth CRUD, points, artwork, rotate secret, and the organizer for each booth (§6.4). */
export default function Booths() {
  const booths = useBooths(true)
  // Days and default zone points are the live event's, not constants (spec 7.1).
  const event = useEvent()
  const eventDays = event.days
  const zonePoints = event.zonePoints
  const marks = stampMarks(event)
  const organizers = useCollection<UserDoc>(query(collection(db, 'users'), where('role', '==', 'organizer')), [], 'the organizer list').data
  const invites = useCollection<InviteDoc>(query(collection(db, 'invites'), orderBy('sentAt', 'desc'), limit(200)), [], 'the invitations').data
  const [editing, setEditing] = useState<BoothInput | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  // One booth at a time is busy — an upload on one card used to disable every button on the page.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [unstaffedOnly, setUnstaffedOnly] = useState(false)
  const editorRef = useRef<HTMLElement>(null)

  // Booths are one shared list, not copied per event. Anything stamped with another event's id
  // is shown apart, so it is a decision rather than a mystery.
  const current = booths.filter((b) => !b.eventId || b.eventId === event.id)
  const previous = booths.filter((b) => b.eventId && b.eventId !== event.id)
  const totalPoints = current.filter((b) => b.active).reduce((s, b) => s + b.points, 0)
  const missingArt = current.filter((b) => b.active && !b.badgeUrl).length
  const pendingFor = (id: string) => invites.find((i) => i.boothId === id && (i.status === 'sent' || i.status === 'opened')) ?? null
  const needle = filter.trim().toLowerCase()
  const shown = current.filter((b) =>
    (!needle || [b.nameEn, b.nameTh, b.hostUnit, b.location, ZONE_LABEL[b.zone], b.shortName].some((s) => s?.toLowerCase().includes(needle)))
    && (!unstaffedOnly || (!b.organizerUid && !pendingFor(b.id))))

  // The editor sits above the grid; opening it from a card far down used to leave it off-screen.
  const editorOpen = editing !== null
  useEffect(() => {
    if (editorOpen) editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [editorOpen, editId])

  function startEdit(b?: Row) {
    setMsg(null)
    if (!b) { setEditing({ ...empty, activeDays: [...eventDays], points: zonePoints.entrance }); setEditId(null); return }
    setEditId(b.id)
    setEditing({ nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.shortName, hostUnit: b.hostUnit, location: b.location, descriptionEn: b.descriptionEn, zone: b.zone, points: b.points, activeDays: b.activeDays, isPrizeDesk: b.isPrizeDesk, active: b.active, accentColor: b.accentColor, sortOrder: b.sortOrder })
  }

  const pointsOk = !editing || (Number.isFinite(editing.points) && (editing.points ?? 0) >= 1 && (editing.points ?? 0) <= 100)

  async function save() {
    if (!editing || !pointsOk) return
    setBusyId(editId ?? 'new'); setMsg(null)
    try {
      if (editId) await api.updateBooth({ id: editId, ...editing })
      else await api.createBooth(editing)
      setEditing(null); setEditId(null)
      setMsg({ tone: 'green', text: editId ? `${editing.nameEn} saved.` : `${editing.nameEn} created.` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusyId(null) }
  }

  async function rotate(b: Row) {
    if (!window.confirm(`Rotate the secret of ${b.nameEn}? Every code currently on its screen or in a photo stops working immediately.`)) return
    setBusyId(b.id)
    try { await api.rotateBoothSecret({ id: b.id }); setMsg({ tone: 'green', text: `${b.nameEn}: secret rotated. Its screen picks the new codes up within 15 minutes, or as soon as its tab is refocused — no reload needed.` }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusyId(null) }
  }

  async function remove(b: Row) {
    if (!window.confirm(`Delete ${b.nameEn}? If it already has stamps it will be deactivated instead.`)) return
    setBusyId(b.id)
    try { const r = await api.deleteBooth({ id: b.id }); setMsg({ tone: 'green', text: r.deactivated ? `${b.nameEn} has stamps — deactivated instead of deleted.` : `${b.nameEn} deleted.` }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusyId(null) }
  }

  /** A no-change update re-stamps the booth with the current event's id (the server always writes it). */
  async function keep(b: Row) {
    setBusyId(b.id); setMsg(null)
    try { await api.updateBooth({ id: b.id }); setMsg({ tone: 'green', text: `${b.nameEn} now belongs to ${event.nameEn}.` }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusyId(null) }
  }

  async function upload(b: Row, kind: 'badge' | 'photo', file: File) {
    setBusyId(b.id); setMsg(null)
    try {
      if (kind === 'badge' && file.size > 512 * 1024) throw new Error('Badge must be under 512 KB')
      if (kind === 'photo' && file.size > 2 * 1024 * 1024) throw new Error('Photo must be under 2 MB')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const r = sref(storage, `booths/${b.id}/${kind}.${ext}`)
      await uploadBytes(r, file, { contentType: file.type })
      const url = await getDownloadURL(r)
      await api.updateBooth(kind === 'badge' ? { id: b.id, badgeUrl: url, badgeThumbUrl: url } : { id: b.id, photoUrl: url, photoThumbUrl: url })
      setMsg({ tone: 'green', text: `${b.nameEn}: ${kind} uploaded.` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusyId(null) }
  }

  /** Clears the URL on the booth (the server treats an explicit null as "remove") and, best effort, the file behind it. */
  async function removeImage(b: Row, kind: 'badge' | 'photo') {
    if (!window.confirm(kind === 'badge' ? `Remove the badge of ${b.nameEn}? The generated stamp takes over.` : `Remove the photo of ${b.nameEn}?`)) return
    setBusyId(b.id); setMsg(null)
    try {
      const url = kind === 'badge' ? b.badgeUrl : b.photoUrl
      await api.updateBooth(kind === 'badge' ? { id: b.id, badgeUrl: null, badgeThumbUrl: null } : { id: b.id, photoUrl: null, photoThumbUrl: null })
      if (url) await deleteObject(sref(storage, url)).catch(() => undefined)
      setMsg({ tone: 'green', text: `${b.nameEn}: ${kind} removed.` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusyId(null) }
  }

  const card = (b: Row, stale = false) => {
    const busy = busyId === b.id
    const closeMenu = (e: React.SyntheticEvent) => (e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')
    return (
      <li key={b.id} className={`card flex flex-col gap-3 ${b.active && !stale ? '' : 'opacity-70'} ${busy ? 'animate-pulse' : ''}`}>
        <div className="flex gap-3">
          <Stamp booth={b} collected tilt={-4} size={72} {...marks} />
          {b.photoUrl && <img src={b.photoThumbUrl ?? b.photoUrl} alt="" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-semibold">{b.nameEn}</div><div className="truncate text-xs text-ink-soft">{b.hostUnit}</div></div>
              <span className="fig text-lg" style={{ color: b.accentColor }}>{b.points}</span>
            </div>
            <div className="mt-1 text-xs text-ink-soft">{b.location} · {ZONE_LABEL[b.zone]} · {b.activeDays.length}/{eventDays.length} days{b.isPrizeDesk ? ' · prize desk' : ''}{b.active ? '' : ' · inactive'}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {stale ? (
                <>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => keep(b)}>Keep for this event</button>
                  <button className="btn-danger-soft btn-sm" disabled={busy} onClick={() => remove(b)}>Delete</button>
                </>
              ) : (
                <>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => startEdit(b)}>Edit</button>
                  <Link className="btn-ghost btn-sm" to={`/booth?boothId=${b.id}`} target="_blank" rel="noopener">Open screen</Link>
                  <Link className="btn-quiet btn-sm" to={`/booth/stats?boothId=${b.id}`}>Stats</Link>
                  {/* Artwork and the two dangerous actions live under one menu, so nine underlined words no longer compete. */}
                  <details className="relative">
                    <summary className="btn-quiet btn-sm list-none" aria-label={`More actions for ${b.nameEn}`}>More ▾</summary>
                    <div className="absolute left-0 z-10 mt-1 flex w-52 flex-col rounded-xl bg-white p-1.5 text-sm shadow-lg ring-1 ring-black/10">
                      <label className="menu-item">{b.badgeUrl ? 'Replace badge…' : 'Upload badge…'}
                        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; closeMenu(e); if (f) void upload(b, 'badge', f) }} /></label>
                      {b.badgeUrl && <button className="menu-item" disabled={busy} onClick={(e) => { closeMenu(e); void removeImage(b, 'badge') }}>Remove badge</button>}
                      <label className="menu-item">{b.photoUrl ? 'Replace photo…' : 'Upload photo…'}
                        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; closeMenu(e); if (f) void upload(b, 'photo', f) }} /></label>
                      {b.photoUrl && <button className="menu-item" disabled={busy} onClick={(e) => { closeMenu(e); void removeImage(b, 'photo') }}>Remove photo</button>}
                      <div className="my-1 border-t rule" />
                      <button className="menu-item text-[#8a4a12] hover:bg-warn/10" disabled={busy} onClick={(e) => { closeMenu(e); void rotate(b) }}>Rotate secret…</button>
                      <button className="menu-item text-[#8f2a1c] hover:bg-danger/10" disabled={busy} onClick={(e) => { closeMenu(e); void remove(b) }}>Delete booth…</button>
                    </div>
                  </details>
                </>
              )}
            </div>
          </div>
        </div>
        {!stale && (
          <OrganizerPanel booth={b}
            organizer={b.organizerUid ? organizers.find((u) => u.id === b.organizerUid) ?? null : null}
            pending={pendingFor(b.id)}
            onMsg={setMsg} />
        )}
      </li>
    )
  }

  const editRow = editId ? booths.find((b) => b.id === editId) : undefined
  const editName = editId ? editRow?.nameEn ?? editId : null

  return (
    <div className="page-in">
      <Toast msg={msg} onClose={() => setMsg(null)} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="stamp-text text-ink-soft">{event.nameEn} · {current.filter((b) => b.active).length} active booths · {totalPoints} points on the floor</div>
          <h1 className="text-2xl font-bold">Booths</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {current.some((b) => b.active) && <Link to="/admin/booth-cards" target="_blank" rel="noopener" className="btn-ghost">Print all cards</Link>}
          <button className="btn-primary" onClick={() => startEdit()}>New booth</button>
        </div>
      </header>
      {missingArt > 0 && <div className="mt-3"><Notice tone="amber">{missingArt} booth{missingArt > 1 ? 's' : ''} still use the generated stamp. That is fine — uploading a badge is optional.</Notice></div>}

      {editing && (
        <section ref={editorRef} className="card mt-4 grid gap-3 scroll-mt-4 md:grid-cols-2" aria-labelledby="booth-editor-title">
          <h2 id="booth-editor-title" className="stamp-text text-ink-soft md:col-span-2">{editName ? `Edit · ${editName}` : 'New booth'}</h2>
          <label>Name (English)<input className="field mt-1" value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} autoFocus /></label>
          <label>Name (Thai, optional)<input className="field mt-1" value={editing.nameTh ?? ''} onChange={(e) => setEditing({ ...editing, nameTh: e.target.value })} /></label>
          <label>Short name on stamp<input className="field mt-1" maxLength={6} value={editing.shortName ?? ''} onChange={(e) => setEditing({ ...editing, shortName: e.target.value.toUpperCase() })} /></label>
          <label>Host unit<input className="field mt-1" value={editing.hostUnit ?? ''} onChange={(e) => setEditing({ ...editing, hostUnit: e.target.value })} /></label>
          <label>Location<input className="field mt-1" value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></label>
          <label>Zone → default points
            <select className="field mt-1" value={editing.zone} onChange={(e) => { const z = e.target.value as Zone; setEditing({ ...editing, zone: z, points: zonePoints[z] }) }}>
              {(['entrance', 'middle', 'far'] as Zone[]).map((z) => <option key={z} value={z}>{ZONE_LABEL[z]} · {zonePoints[z]}</option>)}
            </select>
          </label>
          <label>Points (override)
            <input className={`field mt-1 ${pointsOk ? '' : 'border-danger'}`} type="number" min={1} max={100} value={Number.isFinite(editing.points) ? editing.points : ''} onChange={(e) => setEditing({ ...editing, points: e.target.value === '' ? NaN : Number(e.target.value) })} />
            {!pointsOk && <span className="text-xs text-danger-text">1 to 100</span>}
          </label>
          <label>Order in the grid<input className="field mt-1" type="number" min={1} placeholder="next free" value={editing.sortOrder ?? ''} onChange={(e) => setEditing({ ...editing, sortOrder: numOpt(e.target.value, { min: 1 }) })} /></label>
          <div className="flex items-start gap-4 md:col-span-2">
            <div className="min-w-0 flex-1">
              <div>Accent</div>
              <div className="mt-1 flex flex-wrap gap-2">{ACCENTS.map((c) => <button key={c} type="button" onClick={() => setEditing({ ...editing, accentColor: c })} className={`h-8 w-8 cursor-pointer rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/45 focus-visible:ring-offset-2 ${editing.accentColor === c ? 'ring-2 ring-offset-2 ring-ink' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} aria-pressed={editing.accentColor === c} />)}</div>
            </div>
            {/* What the visitor's stamp will look like, as the fields change. */}
            <div className="shrink-0 text-center text-xs text-ink-soft">
              <Stamp booth={{ shortName: editing.shortName || editing.nameEn.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'NEW', accentColor: editing.accentColor ?? ACCENTS[0], nameEn: editing.nameEn || 'New booth', badgeUrl: editRow?.badgeUrl ?? null, badgeThumbUrl: editRow?.badgeThumbUrl ?? null }} collected size={80} {...marks} />
              <div className="mt-1">Stamp preview</div>
            </div>
          </div>
          <label className="md:col-span-2">Description<textarea className="field mt-1" rows={2} value={editing.descriptionEn ?? ''} onChange={(e) => setEditing({ ...editing, descriptionEn: e.target.value })} /></label>
          <fieldset><legend>Present on</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">{eventDays.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={editing.activeDays?.includes(d)} onChange={(e) => setEditing({ ...editing, activeDays: e.target.checked ? [...(editing.activeDays ?? []), d] : (editing.activeDays ?? []).filter((x) => x !== d) })} />Day {i + 1}</label>)}</div>
          </fieldset>
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.isPrizeDesk} onChange={(e) => setEditing({ ...editing, isPrizeDesk: e.target.checked })} />This booth is a prize desk</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />Active</label>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button className="btn-primary" disabled={busyId !== null || !editing.nameEn.trim() || !pointsOk} onClick={save}>{busyId === (editId ?? 'new') ? 'Saving…' : editId ? 'Save' : 'Create booth'}</button>
            <button className="btn-ghost" onClick={() => { setEditing(null); setEditId(null) }}>Cancel</button>
          </div>
        </section>
      )}

      <BulkImport zonePoints={zonePoints} onDone={setMsg} />

      {current.length >= FILTER_FROM && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <input className="field w-64" placeholder="Filter by name, host, location, zone" aria-label="Filter booths" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={unstaffedOnly} onChange={(e) => setUnstaffedOnly(e.target.checked)} />Without an organizer only</label>
          {(needle || unstaffedOnly) && <span className="text-xs text-ink-soft">{shown.length} of {current.length}</span>}
        </div>
      )}

      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((b) => card(b))}
        {current.length === 0 && <li className="text-sm text-ink-soft">No booths yet — press New booth.</li>}
        {current.length > 0 && shown.length === 0 && <li className="text-sm text-ink-soft">No booth matches.</li>}
      </ul>

      {previous.length > 0 && (
        <section className="mt-8">
          <h2 className="stamp-text text-ink-soft">From a previous event · {previous.length}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            These booths were created under another event. Keep the ones you want at <b>{event.nameEn}</b> — they carry over as they are — and delete the rest.
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{previous.map((b) => card(b, true))}</ul>
        </section>
      )}
    </div>
  )
}

const ZONES: Zone[] = ['entrance', 'middle', 'far']

/** Stand up a floor plan from a pasted list — one booth per line, `name, host unit, location, zone[, points]`. */
function BulkImport({ zonePoints, onDone }: { zonePoints: Record<Zone, number>; onDone: (m: Msg) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nameEn = '', hostUnit = '', location = '', zoneRaw = '', pointsRaw = ''] = l.split(/[,\t;]/).map((x) => x.trim())
    const zone = ZONES.find((z) => z === zoneRaw.toLowerCase()) ?? 'entrance'
    const points = Number(pointsRaw) > 0 ? Number(pointsRaw) : zonePoints[zone]
    const badZone = !!zoneRaw && !ZONES.includes(zoneRaw.toLowerCase() as Zone)
    return { nameEn, hostUnit, location, zone, points, bad: !nameEn || badZone, line: l }
  })
  const bad = rows.filter((r) => r.bad)

  async function run() {
    setBusy(true)
    let made = 0
    const failed: string[] = []
    // One at a time: the server numbers booth ids from the current count.
    for (const [i, r] of rows.entries()) {
      setProgress(`Creating ${i + 1} of ${rows.length}…`)
      try { await api.createBooth({ nameEn: r.nameEn, hostUnit: r.hostUnit, location: r.location, zone: r.zone, points: r.points }); made++ }
      catch (e) { failed.push(`${r.nameEn}: ${errorMessage(e)}`) }
    }
    setBusy(false); setProgress(null)
    if (failed.length) onDone({ tone: 'amber', text: `${made} created, ${failed.length} failed — ${failed.join('; ')}` })
    else { onDone({ tone: 'green', text: `${made} booth${made === 1 ? '' : 's'} created.` }); setText('') }
  }

  return (
    <details className="card mt-4">
      <summary className="cursor-pointer rounded-lg transition hover:text-ink"><span className="stamp-text text-ink-soft">Bulk: paste a list of booths</span></summary>
      <p className="mt-2 text-xs text-ink-soft">
        One booth per line: <code>name, host unit, location, zone</code>, with an optional fifth column for points.
        Zone is <code>entrance</code>, <code>middle</code> or <code>far</code> ({zonePoints.entrance} / {zonePoints.middle} / {zonePoints.far} points by default). Badges, days and the prize-desk flag are set on the cards afterwards.
      </p>
      <textarea className="field mt-2 font-mono text-xs" rows={5} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} aria-label="Booth list"
        placeholder={'School of Law, School of Law, Hall A · Row 1, entrance\nOffice of International Affairs, OIA, Hall B · Stage, far, 25'} />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button className="btn-primary" disabled={busy || rows.length === 0 || bad.length > 0} onClick={run}>{busy ? progress : `Create ${rows.length} booth${rows.length === 1 ? '' : 's'}`}</button>
        {bad.length > 0 && <span className="text-xs text-danger-text">{bad.length} line{bad.length === 1 ? '' : 's'} need a name and a zone of entrance / middle / far: {bad.slice(0, 2).map((r) => `“${r.line}”`).join(', ')}</span>}
      </div>
    </details>
  )
}

/**
 * §6.4 from the booth's side: who runs it, or the invitation on its way, or a button to send one —
 * so a booth can be staffed without a trip to the Users page.
 */
function OrganizerPanel({ booth, organizer, pending, onMsg }: {
  booth: Row; organizer: (UserDoc & { id: string }) | null; pending: (InviteDoc & { id: string }) | null; onMsg: (m: Msg) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function invite(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api.inviteOrganizer({ invites: [{ name: name.trim(), email: email.trim(), boothId: booth.id }] })
      const res = r.results[0]
      setLink(res.link ?? null)
      onMsg(res.mailed ? { tone: 'green', text: `Invitation emailed to ${res.email}.` } : { tone: 'amber', text: `Email is not configured — copy the link under ${booth.nameEn} and send it yourself.` })
      setOpen(false); setName(''); setEmail('')
    } catch (err) { onMsg({ tone: 'red', text: errorMessage(err) }) } finally { setBusy(false) }
  }

  async function resend() {
    if (!pending) return
    setBusy(true)
    try {
      const r = await api.resendInvite({ inviteId: pending.id })
      setLink(r.link ?? null)
      onMsg(r.mailed ? { tone: 'green', text: `Re-sent to ${pending.email}.` } : { tone: 'amber', text: `New link ready under ${booth.nameEn} — copy it. The old link no longer works.` })
    } catch (err) { onMsg({ tone: 'red', text: errorMessage(err) }) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl bg-white/50 px-3 py-2 text-xs">
      {organizer ? (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden />
          <span className="truncate"><b>{organizer.displayName}</b>{organizer.contact ? ` · ${organizer.contact}` : ''}</span>
          <span className="ml-auto text-ink-soft">organizer</span>
        </div>
      ) : pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-warn" aria-hidden />
          <span className="truncate">Invited <b>{pending.displayName}</b> · {pending.email} · {pending.status}</span>
          <button className="btn-quiet btn-sm ml-auto" disabled={busy} onClick={resend}>Resend</button>
        </div>
      ) : open ? (
        <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
          <input className="field w-36 py-1.5" placeholder="Name" aria-label="Organizer name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="field flex-1 py-1.5" placeholder="Email" aria-label="Organizer email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary py-1.5" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          <button type="button" className="btn-ghost py-1.5" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-ink/30" aria-hidden />
          <span className="text-ink-soft">No organizer yet</span>
          <button className="btn-quiet btn-sm ml-auto" onClick={() => setOpen(true)}>Invite organizer</button>
        </div>
      )}
      {link && (
        <div className="mt-2 flex items-center gap-2">
          <input ref={ref} readOnly className="field flex-1 py-1 font-mono text-[11px]" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
          <CopyButton text={link} inputRef={ref} />
        </div>
      )}
    </div>
  )
}
