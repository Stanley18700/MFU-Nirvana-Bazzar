import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { ref as sref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { api, errorMessage, type BoothInput } from '../../lib/api'
import { useBooths, useCollection, useEvent } from '../../lib/data'
import { Stamp } from '../../components/Stamp'
import { stampMarks } from '../../lib/eventText'
import { CopyButton, Notice } from '../../components/ui'
import { ACCENTS, type BoothDoc, type InviteDoc, type UserDoc, type Zone } from '../../../shared/model'

type Row = BoothDoc & { id: string }
type Msg = { tone: 'green' | 'red' | 'amber'; text: string }
const empty: BoothInput = { nameEn: '', nameTh: '', shortName: '', hostUnit: '', location: '', descriptionEn: '', zone: 'entrance', points: 10, isPrizeDesk: false, active: true }

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
  const [busy, setBusy] = useState(false)

  // Booths are one shared list, not copied per event. Anything stamped with another event's id
  // is shown apart, so it is a decision rather than a mystery.
  const current = booths.filter((b) => !b.eventId || b.eventId === event.id)
  const previous = booths.filter((b) => b.eventId && b.eventId !== event.id)
  const totalPoints = current.filter((b) => b.active).reduce((s, b) => s + b.points, 0)
  const missingArt = current.filter((b) => b.active && !b.badgeUrl).length

  function startEdit(b?: Row) {
    setMsg(null)
    if (!b) { setEditing({ ...empty, activeDays: [...eventDays], points: zonePoints.entrance }); setEditId(null); return }
    setEditId(b.id)
    setEditing({ nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.shortName, hostUnit: b.hostUnit, location: b.location, descriptionEn: b.descriptionEn, zone: b.zone, points: b.points, activeDays: b.activeDays, isPrizeDesk: b.isPrizeDesk, active: b.active, accentColor: b.accentColor, sortOrder: b.sortOrder })
  }

  async function save() {
    if (!editing) return
    setBusy(true); setMsg(null)
    try {
      if (editId) await api.updateBooth({ id: editId, ...editing })
      else await api.createBooth(editing)
      setEditing(null); setEditId(null)
      setMsg({ tone: 'green', text: 'Saved.' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  async function rotate(id: string) {
    if (!window.confirm('Rotate this booth\'s secret? Every code currently on screen or in a photo stops working immediately.')) return
    try { await api.rotateBoothSecret({ id }); setMsg({ tone: 'green', text: 'Secret rotated. The booth screen picks it up on its next reload.' }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this booth? If it already has stamps it will be deactivated instead.')) return
    try { const r = await api.deleteBooth({ id }); setMsg({ tone: 'green', text: r.deactivated ? 'Booth has stamps — deactivated instead of deleted.' : 'Deleted.' }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  /** A no-change update re-stamps the booth with the current event's id (the server always writes it). */
  async function keep(b: Row) {
    setBusy(true); setMsg(null)
    try { await api.updateBooth({ id: b.id }); setMsg({ tone: 'green', text: `${b.nameEn} now belongs to ${event.nameEn}.` }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  async function upload(b: Row, kind: 'badge' | 'photo', file: File) {
    setBusy(true); setMsg(null)
    try {
      if (kind === 'badge' && file.size > 512 * 1024) throw new Error('Badge must be under 512 KB')
      if (kind === 'photo' && file.size > 2 * 1024 * 1024) throw new Error('Photo must be under 2 MB')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const r = sref(storage, `booths/${b.id}/${kind}.${ext}`)
      await uploadBytes(r, file, { contentType: file.type })
      const url = await getDownloadURL(r)
      await api.updateBooth(kind === 'badge' ? { id: b.id, badgeUrl: url, badgeThumbUrl: url } : { id: b.id, photoUrl: url, photoThumbUrl: url })
      setMsg({ tone: 'green', text: `${kind} uploaded.` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  /** Clears the URL on the booth (the server treats an explicit null as "remove") and, best effort, the file behind it. */
  async function removeImage(b: Row, kind: 'badge' | 'photo') {
    if (!window.confirm(kind === 'badge' ? 'Remove the badge? The generated stamp takes over.' : 'Remove the photo?')) return
    setBusy(true); setMsg(null)
    try {
      const url = kind === 'badge' ? b.badgeUrl : b.photoUrl
      await api.updateBooth(kind === 'badge' ? { id: b.id, badgeUrl: null, badgeThumbUrl: null } : { id: b.id, photoUrl: null, photoThumbUrl: null })
      if (url) await deleteObject(sref(storage, url)).catch(() => undefined)
      setMsg({ tone: 'green', text: `${kind} removed.` })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  const card = (b: Row, stale = false) => (
    <li key={b.id} className={`card flex flex-col gap-3 ${b.active && !stale ? '' : 'opacity-70'}`}>
      <div className="flex gap-3">
        <Stamp booth={b} collected tilt={-4} size={72} {...marks} />
        {b.photoUrl && <img src={b.photoThumbUrl ?? b.photoUrl} alt="" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><div className="truncate font-semibold">{b.nameEn}</div><div className="truncate text-xs text-navy-soft">{b.hostUnit}</div></div>
            <span className="fig text-lg" style={{ color: b.accentColor }}>{b.points}</span>
          </div>
          <div className="mt-1 text-xs text-navy-soft">{b.location} · {b.zone} · {b.activeDays.length}/{eventDays.length} days{b.isPrizeDesk ? ' · prize desk' : ''}{b.active ? '' : ' · inactive'}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {stale ? (
              <>
                <button className="font-semibold underline" disabled={busy} onClick={() => keep(b)}>Keep for this event</button>
                <button className="underline text-vermilion" onClick={() => remove(b.id)}>Delete</button>
              </>
            ) : (
              <>
                <button className="underline" onClick={() => startEdit(b)}>Edit</button>
                <Link className="underline" to={`/booth?boothId=${b.id}`} target="_blank" rel="noopener">Open screen</Link>
                <Link className="underline" to={`/booth/stats?boothId=${b.id}`}>Stats</Link>
                <label className="cursor-pointer underline">{b.badgeUrl ? 'Replace badge' : 'Badge'}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(b, 'badge', e.target.files[0])} /></label>
                {b.badgeUrl && <button className="underline" disabled={busy} onClick={() => removeImage(b, 'badge')}>Remove badge</button>}
                <label className="cursor-pointer underline">{b.photoUrl ? 'Replace photo' : 'Photo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(b, 'photo', e.target.files[0])} /></label>
                {b.photoUrl && <button className="underline" disabled={busy} onClick={() => removeImage(b, 'photo')}>Remove photo</button>}
                <button className="underline text-amber" onClick={() => rotate(b.id)}>Rotate secret</button>
                <button className="underline text-vermilion" onClick={() => remove(b.id)}>Delete</button>
              </>
            )}
          </div>
        </div>
      </div>
      {!stale && (
        <OrganizerPanel booth={b}
          organizer={b.organizerUid ? organizers.find((u) => u.id === b.organizerUid) ?? null : null}
          pending={invites.find((i) => i.boothId === b.id && (i.status === 'sent' || i.status === 'opened')) ?? null}
          onMsg={setMsg} />
      )}
    </li>
  )

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="stamp-text text-navy-soft">{event.nameEn} · {current.filter((b) => b.active).length} active booths · {totalPoints} points on the floor</div>
          <h1 className="text-2xl font-bold">Booths</h1>
        </div>
        <button className="btn-primary" onClick={() => startEdit()}>New booth</button>
      </header>
      {missingArt > 0 && <div className="mt-3"><Notice tone="amber">{missingArt} booth{missingArt > 1 ? 's' : ''} still use the generated stamp. That is fine — uploading a badge is optional (§2.5).</Notice></div>}
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {editing && (
        <section className="card mt-4 grid gap-3 md:grid-cols-2">
          <h2 className="stamp-text text-navy-soft md:col-span-2">{editId ? `Edit ${editId}` : 'New booth'}</h2>
          <label>Name (English)<input className="field mt-1" value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></label>
          <label>Name (Thai, optional)<input className="field mt-1" value={editing.nameTh ?? ''} onChange={(e) => setEditing({ ...editing, nameTh: e.target.value })} /></label>
          <label>Short name on stamp<input className="field mt-1" maxLength={6} value={editing.shortName ?? ''} onChange={(e) => setEditing({ ...editing, shortName: e.target.value.toUpperCase() })} /></label>
          <label>Host unit<input className="field mt-1" value={editing.hostUnit ?? ''} onChange={(e) => setEditing({ ...editing, hostUnit: e.target.value })} /></label>
          <label>Location<input className="field mt-1" value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></label>
          <label>Zone → default points
            <select className="field mt-1" value={editing.zone} onChange={(e) => { const z = e.target.value as Zone; setEditing({ ...editing, zone: z, points: zonePoints[z] }) }}>
              <option value="entrance">Entrance row · {zonePoints.entrance}</option><option value="middle">Middle hall · {zonePoints.middle}</option><option value="far">Far corner · {zonePoints.far}</option>
            </select>
          </label>
          <label>Points (override)<input className="field mt-1" type="number" min={1} max={100} value={editing.points ?? 10} onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })} /></label>
          <label>Order in the grid<input className="field mt-1" type="number" min={1} placeholder="next free" value={editing.sortOrder ?? ''} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
          <label>Accent
            <div className="mt-1 flex flex-wrap gap-2">{ACCENTS.map((c) => <button key={c} type="button" onClick={() => setEditing({ ...editing, accentColor: c })} className={`h-8 w-8 rounded-full ${editing.accentColor === c ? 'ring-2 ring-offset-2 ring-navy' : ''}`} style={{ background: c }} aria-label={c} />)}</div>
          </label>
          <label className="md:col-span-2">Description<textarea className="field mt-1" rows={2} value={editing.descriptionEn ?? ''} onChange={(e) => setEditing({ ...editing, descriptionEn: e.target.value })} /></label>
          <fieldset><legend>Present on</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">{eventDays.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={editing.activeDays?.includes(d)} onChange={(e) => setEditing({ ...editing, activeDays: e.target.checked ? [...(editing.activeDays ?? []), d] : (editing.activeDays ?? []).filter((x) => x !== d) })} />Day {i + 1}</label>)}</div>
          </fieldset>
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.isPrizeDesk} onChange={(e) => setEditing({ ...editing, isPrizeDesk: e.target.checked })} />This booth is a prize desk</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />Active</label>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button className="btn-primary" disabled={busy || !editing.nameEn} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn-ghost" onClick={() => { setEditing(null); setEditId(null) }}>Cancel</button>
          </div>
        </section>
      )}

      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {current.map((b) => card(b))}
        {current.length === 0 && <li className="text-sm text-navy-soft">No booths yet — press New booth.</li>}
      </ul>

      {previous.length > 0 && (
        <section className="mt-8">
          <h2 className="stamp-text text-navy-soft">From a previous event · {previous.length}</h2>
          <p className="mt-1 text-sm text-navy-soft">
            These booths were created under another event. Keep the ones you want at <b>{event.nameEn}</b> — they carry over as they are — and delete the rest.
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{previous.map((b) => card(b, true))}</ul>
        </section>
      )}
    </div>
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
      onMsg(r.mailed ? { tone: 'green', text: `Re-sent to ${pending.email}.` } : { tone: 'amber', text: 'New link ready under the booth — copy it. The old link no longer works.' })
    } catch (err) { onMsg({ tone: 'red', text: errorMessage(err) }) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl bg-white/50 px-3 py-2 text-xs">
      {organizer ? (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-jade" aria-hidden />
          <span className="truncate"><b>{organizer.displayName}</b>{organizer.contact ? ` · ${organizer.contact}` : ''}</span>
          <span className="ml-auto text-navy-soft">organizer</span>
        </div>
      ) : pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-amber" aria-hidden />
          <span className="truncate">Invited <b>{pending.displayName}</b> · {pending.email} · {pending.status}</span>
          <button className="ml-auto underline" disabled={busy} onClick={resend}>Resend</button>
        </div>
      ) : open ? (
        <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
          <input className="field w-36 py-1.5" placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field flex-1 py-1.5" placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary py-1.5" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          <button type="button" className="btn-ghost py-1.5" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-navy/30" aria-hidden />
          <span className="text-navy-soft">No organizer yet</span>
          <button className="ml-auto font-semibold underline" onClick={() => setOpen(true)}>Invite organizer</button>
        </div>
      )}
      {link && (
        <div className="mt-2 flex items-center gap-2">
          <input ref={ref} readOnly className="field flex-1 py-1 font-mono text-[11px]" value={link} onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={link} inputRef={ref} className="underline" />
        </div>
      )}
    </div>
  )
}
