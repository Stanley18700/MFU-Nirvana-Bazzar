import { useMemo, useState } from 'react'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { useBooths, useCollection } from '../../lib/data'
import { Notice } from '../../components/ui'
import { countryName } from '../../lib/countries'
import type { InviteDoc, Role, ScanDoc, UserDoc } from '../../../shared/model'

type Row = UserDoc & { id: string }
const ts = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? new Date((v as { toMillis(): number }).toMillis()).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '–')

/** §6.2 users, §6.4 invitations. */
export default function Users() {
  const booths = useBooths(true)
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [q, setQ] = useState('')
  const [pageSize, setPageSize] = useState(50)
  const users = useCollection<UserDoc>(
    roleFilter === 'all' ? query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(pageSize)) : query(collection(db, 'users'), where('role', '==', roleFilter), orderBy('createdAt', 'desc'), limit(pageSize)),
    [roleFilter, pageSize],
  ).data
  const invites = useCollection<InviteDoc>(query(collection(db, 'invites'), orderBy('sentAt', 'desc'), limit(100)), []).data
  const [open, setOpen] = useState<Row | null>(null)
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null)
  const [inv, setInv] = useState({ name: '', email: '', boothId: '', role: 'organizer' as Role, bulk: '' })
  const [links, setLinks] = useState<Array<{ email: string; link?: string; mailed: boolean }>>([])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? users.filter((u) => [u.displayName, u.contact, u.studentId, u.passportNo].some((v) => v?.toLowerCase().includes(s))) : users
  }, [users, q])

  async function changeRole(u: Row, role: Role, boothId?: string) {
    if (role === 'admin' && !window.confirm(`Make ${u.displayName} an admin? They will be able to change every setting.`)) return
    try { await api.setUserRole({ uid: u.id, role, boothId }); setMsg({ tone: 'green', text: `${u.displayName} is now ${role}. Takes effect on their device within 15 minutes.` }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }
  async function softDelete(u: Row) {
    if (!window.confirm(`Delete ${u.displayName}? Contact details are anonymised; scan rows are kept for statistics.`)) return
    try { await api.deleteUser({ uid: u.id }); setMsg({ tone: 'green', text: 'Deleted (soft).' }); setOpen(null) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }
  async function sendInvites() {
    setMsg(null)
    const list = inv.bulk.trim()
      ? inv.bulk.split('\n').map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((p) => p.length >= 2).map(([name, email, boothId]) => ({ name, email, boothId: boothId || inv.boothId, role: 'organizer' as Role }))
      : [{ name: inv.name, email: inv.email, boothId: inv.boothId || undefined, role: inv.role }]
    try {
      const r = await api.inviteOrganizer({ invites: list })
      setLinks(r.results)
      setMsg({ tone: r.mailConfigured ? 'green' : 'amber', text: r.mailConfigured ? `${r.results.filter((x) => x.mailed).length} invitation(s) emailed.` : 'Email is not configured yet — copy each link below and send it to the organizer yourself.' })
      setInv({ ...inv, name: '', email: '', bulk: '' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Users & invitations</h1>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {/* Only renders while the signed-in admin is still an anonymous /setup account. */}

      <section className="card mt-4">
        <h2 className="stamp-text text-navy-soft">Invite booth organizers</h2>
        <p className="mt-1 text-xs text-navy-soft">They never register or set a password: the emailed link signs them in on the booth device and opens their screen. Single-use, expires in 14 days or at the end of the event.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className="field" placeholder="Name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
          <input className="field" placeholder="Email" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
          <select className="field" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}><option value="organizer">Booth organizer</option><option value="admin">Admin</option></select>
          <select className="field" value={inv.boothId} onChange={(e) => setInv({ ...inv, boothId: e.target.value })} disabled={inv.role === 'admin'}>
            <option value="">— booth —</option>{booths.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
          </select>
        </div>
        <details className="mt-2 text-sm"><summary className="cursor-pointer text-navy-soft">Bulk: paste <code>name, email, boothId</code> per line</summary>
          <textarea className="field mt-2 font-mono text-xs" rows={4} value={inv.bulk} onChange={(e) => setInv({ ...inv, bulk: e.target.value })} placeholder={'Somchai Thongdee, somchai@mfu.ac.th, booth-01\n…'} />
        </details>
        <button className="btn-primary mt-3" onClick={sendInvites} disabled={!inv.bulk.trim() && (!inv.name || !inv.email || (inv.role === 'organizer' && !inv.boothId))}>Send invitation{inv.bulk.trim() ? 's' : ''}</button>
        {links.some((l) => l.link) && (
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {links.filter((l) => l.link).map((l) => <li key={l.email} className="flex items-center gap-2"><span className="w-48 truncate">{l.email}</span><input readOnly className="field flex-1 font-mono text-[11px]" value={l.link} onFocus={(e) => e.currentTarget.select()} /><button className="underline" onClick={() => navigator.clipboard.writeText(l.link!)}>Copy</button></li>)}
          </ul>
        )}
        {invites.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-xs text-navy-soft"><th className="py-1">Name</th><th>Email</th><th>Booth</th><th>Status</th><th>Sent</th><th></th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t rule">
                  <td className="py-1.5">{i.displayName}</td><td className="truncate">{i.email}</td><td>{booths.find((b) => b.id === i.boothId)?.nameEn ?? i.role}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${i.status === 'accepted' ? 'bg-jade/15 text-jade' : i.status === 'opened' ? 'bg-stamp-blue/10 text-seal' : i.status === 'sent' ? 'bg-navy/5' : 'bg-vermilion/10 text-vermilion'}`}>{i.status}</span></td>
                  <td className="text-xs text-navy-soft">{ts(i.sentAt)}</td>
                  <td className="text-right text-xs">
                    {i.status !== 'accepted' && i.status !== 'revoked' && <>
                      <button className="underline" onClick={async () => { try { const r = await api.resendInvite({ inviteId: i.id }); setLinks([{ email: i.email, link: r.link, mailed: r.mailed }]); setMsg({ tone: r.mailed ? 'green' : 'amber', text: r.mailed ? 'Re-sent.' : 'New link ready below — copy it.' }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } }}>Resend</button>{' · '}
                      <button className="underline text-vermilion" onClick={async () => { try { await api.revokeInvite({ inviteId: i.id }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } }}>Revoke</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="stamp-text mr-auto text-navy-soft">Users</h2>
          <input className="field w-56" placeholder="Search name, ID, contact" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field w-40" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}><option value="all">All roles</option><option value="visitor">Visitors</option><option value="organizer">Organizers</option><option value="admin">Admins</option></select>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-navy-soft"><th className="py-1">Name</th><th>Role</th><th>Affiliation</th><th>Country</th><th>Stamps</th><th>Points</th><th>Registered</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={`cursor-pointer border-t rule hover:bg-white/50 ${u.deletedAt ? 'opacity-50' : ''}`} onClick={() => setOpen(u)}>
                  <td className="py-1.5 font-medium">{u.displayName}<div className="text-xs text-navy-soft">{u.passportNo ?? u.contact}</div></td>
                  <td>{u.role}{u.boothId ? <div className="text-xs text-navy-soft">{booths.find((b) => b.id === u.boothId)?.nameEn}</div> : null}</td>
                  <td className="text-xs">{u.institution}{u.school ? ` · ${u.school}` : ''}</td>
                  <td className="text-xs">{u.countryCode ? countryName(u.countryCode) : ''}</td>
                  <td className="fig">{u.stampCount}</td><td className="fig">{u.points}</td>
                  <td className="text-xs text-navy-soft">{ts(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length >= pageSize && <button className="btn-ghost mt-3" onClick={() => setPageSize(pageSize + 50)}>Load more</button>}
      </section>

      {open && <UserDrawer u={open} booths={booths} onClose={() => setOpen(null)} onRole={changeRole} onDelete={softDelete} />}
    </div>
  )
}

function UserDrawer({ u, booths, onClose, onRole, onDelete }: { u: Row; booths: Array<{ id: string; nameEn: string }>; onClose: () => void; onRole: (u: Row, r: Role, b?: string) => void; onDelete: (u: Row) => void }) {
  const scans = useCollection<ScanDoc>(query(collection(db, 'scans'), where('visitorId', '==', u.id), orderBy('scannedAt', 'asc')), [u.id]).data
  const [role, setRole] = useState<Role>(u.role)
  const [boothId, setBoothId] = useState(u.boothId ?? '')
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-navy-deep/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-paper p-5 shadow-2xl page-in" onClick={(e) => e.stopPropagation()}>
        <button className="text-sm text-navy-soft" onClick={onClose}>Close ✕</button>
        <h2 className="mt-2 text-xl font-bold">{u.displayName}</h2>
        <div className="text-sm text-navy-soft">{u.passportNo} · {u.contact}</div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-navy-soft">Type</dt><dd>{u.visitorType}</dd>
          <dt className="text-navy-soft">Institution</dt><dd>{u.institution}{u.school ? ` · ${u.school}` : ''}</dd>
          <dt className="text-navy-soft">Country</dt><dd>{u.countryCode ? countryName(u.countryCode) : '–'}</dd>
          <dt className="text-navy-soft">Points</dt><dd className="fig">{u.points} · {u.stampCount} stamps</dd>
          <dt className="text-navy-soft">Days</dt><dd>{u.daysAttended?.join(', ')}</dd>
          <dt className="text-navy-soft">Last seen</dt><dd>{ts(u.lastSeenAt)}</dd>
        </dl>
        <p className="mt-2 text-xs text-navy-soft">Ethnic group is never shown per person (§4.1).</p>

        <h3 className="stamp-text mt-5 text-navy-soft">Route walked</h3>
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {scans.map((s) => <li key={s.id} className="flex justify-between"><span>{booths.find((b) => b.id === s.boothId)?.nameEn ?? s.boothId}</span><span className="text-xs text-navy-soft">{ts(s.scannedAt)} · +{s.pointsAwarded}</span></li>)}
          {scans.length === 0 && <li className="text-navy-soft">No stamps yet</li>}
        </ol>

        <h3 className="stamp-text mt-5 text-navy-soft">Role</h3>
        <div className="mt-2 flex gap-2">
          <select className="field" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="visitor">visitor</option><option value="organizer">organizer</option><option value="admin">admin</option></select>
          {role === 'organizer' && <select className="field" value={boothId} onChange={(e) => setBoothId(e.target.value)}><option value="">— booth —</option>{booths.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}</select>}
          <button className="btn-primary" disabled={role === u.role && boothId === (u.boothId ?? '')} onClick={() => onRole(u, role, boothId || undefined)}>Apply</button>
        </div>
        <button className="btn-danger mt-6" onClick={() => onDelete(u)}>Delete user</button>
      </aside>
    </div>
  )
}
