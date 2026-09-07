import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../lib/firebase'
import { api, errorMessage, type BoothInput } from '../../lib/api'
import { useBooths } from '../../lib/data'
import { Stamp } from '../../components/Stamp'
import { Notice } from '../../components/ui'
import { ACCENTS, EVENT_DAYS, ZONE_POINTS, type BoothDoc, type Zone } from '../../../shared/model'

type Row = BoothDoc & { id: string }
const empty: BoothInput = { nameEn: '', nameTh: '', shortName: '', hostUnit: '', location: '', descriptionEn: '', zone: 'entrance', points: 10, activeDays: [...EVENT_DAYS], isPrizeDesk: false, active: true }

/** §6.3 / §6.6 — booth CRUD, points, artwork, rotate secret. */
export default function Booths() {
  const booths = useBooths(true)
  const [editing, setEditing] = useState<BoothInput | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const totalPoints = booths.filter((b) => b.active).reduce((s, b) => s + b.points, 0)
  const missingArt = booths.filter((b) => b.active && !b.badgeUrl).length

  function startEdit(b?: Row) {
    setMsg(null)
    if (!b) { setEditing({ ...empty }); setEditId(null); return }
    setEditId(b.id)
    setEditing({ nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.shortName, hostUnit: b.hostUnit, location: b.location, descriptionEn: b.descriptionEn, zone: b.zone, points: b.points, activeDays: b.activeDays, isPrizeDesk: b.isPrizeDesk, active: b.active, accentColor: b.accentColor })
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

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="stamp-text text-navy-soft">{booths.filter((b) => b.active).length} active booths · {totalPoints} points on the floor</div>
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
            <select className="field mt-1" value={editing.zone} onChange={(e) => { const z = e.target.value as Zone; setEditing({ ...editing, zone: z, points: ZONE_POINTS[z] }) }}>
              <option value="entrance">Entrance row · 10</option><option value="middle">Middle hall · 15</option><option value="far">Far corner · 20</option>
            </select>
          </label>
          <label>Points (override)<input className="field mt-1" type="number" min={1} max={100} value={editing.points ?? 10} onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })} /></label>
          <label>Accent
            <div className="mt-1 flex flex-wrap gap-2">{ACCENTS.map((c) => <button key={c} type="button" onClick={() => setEditing({ ...editing, accentColor: c })} className={`h-8 w-8 rounded-full ${editing.accentColor === c ? 'ring-2 ring-offset-2 ring-navy' : ''}`} style={{ background: c }} aria-label={c} />)}</div>
          </label>
          <label className="md:col-span-2">Description<textarea className="field mt-1" rows={2} value={editing.descriptionEn ?? ''} onChange={(e) => setEditing({ ...editing, descriptionEn: e.target.value })} /></label>
          <fieldset><legend>Present on</legend>
            <div className="mt-1 flex gap-3 text-sm">{EVENT_DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={editing.activeDays?.includes(d)} onChange={(e) => setEditing({ ...editing, activeDays: e.target.checked ? [...(editing.activeDays ?? []), d] : (editing.activeDays ?? []).filter((x) => x !== d) })} />Day {i + 1}</label>)}</div>
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
        {booths.map((b) => (
          <li key={b.id} className={`card flex gap-3 ${b.active ? '' : 'opacity-60'}`}>
            <Stamp booth={b} collected tilt={-4} size={72} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-semibold">{b.nameEn}</div><div className="truncate text-xs text-navy-soft">{b.hostUnit}</div></div>
                <span className="fig text-lg" style={{ color: b.accentColor }}>{b.points}</span>
              </div>
              <div className="mt-1 text-xs text-navy-soft">{b.location} · {b.zone} · {b.activeDays.length}/3 days{b.isPrizeDesk ? ' · prize desk' : ''}{b.organizerUid ? ' · organizer linked' : ' · no organizer yet'}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button className="underline" onClick={() => startEdit(b)}>Edit</button>
                <Link className="underline" to={`/booth?boothId=${b.id}`}>Open screen</Link>
                <Link className="underline" to={`/booth/stats?boothId=${b.id}`}>Stats</Link>
                <label className="cursor-pointer underline">Badge<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(b, 'badge', e.target.files[0])} /></label>
                <button className="underline text-amber" onClick={() => rotate(b.id)}>Rotate secret</button>
                <button className="underline text-vermilion" onClick={() => remove(b.id)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
