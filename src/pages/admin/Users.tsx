import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage, type CreateUserInput, type UpdateUserInput } from '../../lib/api'
import { useBooths, useCollection, useRefList, useTiers } from '../../lib/data'
import { CopyButton, Drawer, Notice, Toast, type Msg } from '../../components/ui'
import { COUNTRIES, countryName } from '../../lib/countries'
import { ts } from '../../lib/eventText'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { ROLE_LABEL, VISITOR_TYPE_LABEL } from '../../lib/labels'
import type { InviteDoc, Role, ScanDoc, TierUnlockDoc, UserDoc, VisitorType } from '../../../shared/model'

type Row = UserDoc & { id: string }
type BoothOpt = { id: string; nameEn: string }
type ErasureRequest = { uid: string; displayName: string | null; passportNo: string | null; contact: string | null; requestedAt: unknown; status: string }

const VISITOR_TYPES: VisitorType[] = ['student', 'staff', 'alumni', 'guest']
const ROLES: Role[] = ['visitor', 'organizer', 'admin']
const PAGE = 50
/** Firestore has no substring search; while a search is typed the page widens to the whole list (1,500 expected) and filters here. */
const SEARCH_ALL = 2000

/** §6.2 users, §6.4 invitations, §10 erasure requests. */
export default function Users() {
  const booths = useBooths(true)
  const filter = useSlidingPill()
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [q, setQ] = useState('')
  const [pageSize, setPageSize] = useState(PAGE)
  const searching = q.trim().length >= 2
  const fetchLimit = searching ? SEARCH_ALL : pageSize
  const users = useCollection<UserDoc>(
    roleFilter === 'all' ? query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(fetchLimit)) : query(collection(db, 'users'), where('role', '==', roleFilter), orderBy('createdAt', 'desc'), limit(fetchLimit)),
    [roleFilter, fetchLimit], 'the user list',
  ).data
  const invites = useCollection<InviteDoc>(query(collection(db, 'invites'), orderBy('sentAt', 'desc'), limit(100)), [], 'the invitations').data
  const erasures = useCollection<ErasureRequest>(query(collection(db, 'erasureRequests'), orderBy('requestedAt', 'desc'), limit(100)), [], 'the erasure requests').data
    .filter((r) => r.status === 'open')
  // The drawer follows the live row, so an edit or a role change shows at once and a hard delete closes it.
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? users.find((u) => u.id === openId) ?? null : null
  const closeDrawer = useCallback(() => setOpenId(null), [])
  const [msg, setMsg] = useState<Msg | null>(null)
  const [inv, setInv] = useState({ name: '', email: '', boothId: '', role: 'organizer' as Role, bulk: '' })
  const [links, setLinks] = useState<Array<{ email: string; link?: string; mailed: boolean }>>([])
  const [inviteFilter, setInviteFilter] = useState<'pending' | 'all'>('pending')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? users.filter((u) => [u.displayName, u.contact, u.studentId, u.passportNo].some((v) => v?.toLowerCase().includes(s))) : users
  }, [users, q])
  const shownInvites = inviteFilter === 'all' ? invites : invites.filter((i) => i.status === 'sent' || i.status === 'opened')

  const fail = (e: unknown) => setMsg({ tone: 'red', text: errorMessage(e) })

  async function changeRole(u: Row, role: Role, boothId?: string) {
    const boothName = boothId ? booths.find((b) => b.id === boothId)?.nameEn ?? boothId : null
    const what = role === 'organizer' ? `${ROLE_LABEL.organizer} at ${boothName}` : ROLE_LABEL[role]
    if (role === 'admin' && !window.confirm(`Make ${u.displayName} an admin? They will be able to change every setting.`)) return
    if (u.role !== 'visitor' && role === 'visitor' && !window.confirm(`Demote ${u.displayName} to a visitor? Their booth screen and desk stop working within 15 minutes.`)) return
    try { await api.setUserRole({ uid: u.id, role, boothId }); setMsg({ tone: 'green', text: `${u.displayName} is now ${what}. Takes effect on their device within 15 minutes.` }) } catch (e) { fail(e) }
  }
  async function updateUser(u: Row, patch: Omit<UpdateUserInput, 'uid'>) {
    try { await api.updateUser({ uid: u.id, ...patch }); setMsg({ tone: 'green', text: `${u.displayName} updated.` }) } catch (e) { fail(e); throw e }
  }
  async function softDelete(u: Row) {
    if (!window.confirm(`Delete ${u.displayName}? Contact details are anonymised and the account is disabled; scan rows are kept for statistics.`)) return
    try { await api.deleteUser({ uid: u.id }); setMsg({ tone: 'green', text: 'Deleted (soft): anonymised and disabled.' }); setOpenId(null) } catch (e) { fail(e) }
  }
  /** PDPA erasure (§10): the account, passport, stamps and unlocks all go. Callers gate it behind a typed confirmation. */
  async function hardDelete(uid: string, label: string) {
    try { await api.deleteUser({ uid, hard: true }); setMsg({ tone: 'green', text: `${label} erased permanently.` }); setOpenId(null) } catch (e) { fail(e) }
  }
  async function dismissErasure(uid: string, reason: string) {
    try { await api.dismissErasureRequest({ uid, reason }); setMsg({ tone: 'green', text: 'Request dismissed and logged.' }) } catch (e) { fail(e) }
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
    } catch (e) { fail(e) }
  }
  async function resend(i: InviteDoc & { id: string }) {
    try {
      const r = await api.resendInvite({ inviteId: i.id })
      setLinks([{ email: i.email, link: r.link, mailed: r.mailed }])
      setMsg({ tone: r.mailed ? 'green' : 'amber', text: r.mailed ? `Re-sent to ${i.email}.` : 'New link ready below — copy it. The old link no longer works.' })
    } catch (e) { fail(e) }
  }
  async function revoke(i: InviteDoc & { id: string }) {
    if (!window.confirm(`Revoke the invitation to ${i.email}? Its link stops working.`)) return
    try { await api.revokeInvite({ inviteId: i.id }); setMsg({ tone: 'green', text: `Invitation to ${i.email} revoked — its link no longer works.` }) } catch (e) { fail(e) }
  }

  const openRow = (id: string) => setOpenId(id)

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Users & invitations</h1>
      <Toast msg={msg} onClose={() => setMsg(null)} />

      <ErasureInbox requests={erasures} onErase={hardDelete} onDismiss={dismissErasure} />

      <section className="card mt-4">
        <h2 className="stamp-text text-ink-soft">Invite booth organizers</h2>
        <p className="mt-1 text-xs text-ink-soft">The link signs them in on the booth device with their own account and opens their screen. Single-use, expires in 14 days or at the end of the event.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input className="field" placeholder="Name" aria-label="Name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
          <input className="field" placeholder="Email" aria-label="Email" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
          <select className="field" aria-label="Role" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}><option value="organizer">{ROLE_LABEL.organizer}</option><option value="admin">{ROLE_LABEL.admin}</option></select>
          <select className="field" aria-label="Booth" value={inv.boothId} onChange={(e) => setInv({ ...inv, boothId: e.target.value })} disabled={inv.role === 'admin'}>
            <option value="">— booth —</option>{booths.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
          </select>
        </div>
        <details className="reveal-host mt-2 text-sm"><summary className="cursor-pointer text-ink-soft">Bulk: paste <code>name, email, boothId</code> per line</summary>
          <textarea className="field mt-2 font-mono text-xs" rows={4} value={inv.bulk} onChange={(e) => setInv({ ...inv, bulk: e.target.value })} placeholder={'Somchai Thongdee, somchai@mfu.ac.th, booth-01\n…'} />
        </details>
        <button className="btn-primary mt-3" onClick={sendInvites} disabled={!inv.bulk.trim() && (!inv.name || !inv.email || (inv.role === 'organizer' && !inv.boothId))}>Send invitation{inv.bulk.trim() ? 's' : ''}</button>
        {links.some((l) => l.link) && (
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {links.filter((l) => l.link).map((l) => <LinkRow key={l.email} email={l.email} link={l.link!} />)}
          </ul>
        )}
        {invites.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
              <span>Showing {shownInvites.length} of {invites.length} invitation{invites.length === 1 ? '' : 's'}{invites.length >= 100 ? ' (latest 100)' : ''}</span>
              <div ref={filter} className="tab-group flex gap-1" role="tablist" aria-label="Invitation filter">
                {(['pending', 'all'] as const).map((f) => (
                  <button key={f} role="tab" aria-selected={inviteFilter === f} onClick={() => setInviteFilter(f)}
                    className="tab">{f === 'pending' ? 'Pending' : 'All'}</button>
                ))}
              </div>
            </div>
            {/* Six columns including an address and a timestamp: it needs the same wrapper its
                two sibling tables already have. */}
            <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="text-left text-xs text-ink-soft"><th className="py-1">Name</th><th>Email</th><th>Booth</th><th>Status</th><th>Sent</th><th></th></tr></thead>
              <tbody>
                {shownInvites.map((i) => (
                  <tr key={i.id} className="border-t rule">
                    <td className="py-1.5">{i.displayName}</td><td className="truncate">{i.email}</td><td>{booths.find((b) => b.id === i.boothId)?.nameEn ?? ROLE_LABEL[i.role]}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs ${i.status === 'accepted' ? 'bg-success/15 text-success-text' : i.status === 'opened' ? 'bg-action/10 text-ink' : i.status === 'sent' ? 'bg-ink/5' : 'bg-danger/10 text-danger-text'}`}>{i.status}</span></td>
                    <td className="text-xs text-ink-soft">{ts(i.sentAt)}</td>
                    <td className="text-right text-xs">
                      {i.status !== 'accepted' && i.status !== 'revoked' && <div className="flex justify-end gap-1">
                        <button className="btn-quiet btn-sm" onClick={() => resend(i)}>Resend</button>
                        <button className="btn-danger-soft btn-sm" onClick={() => revoke(i)}>Revoke</button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {shownInvites.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-xs text-ink-soft">No pending invitations.</td></tr>}
              </tbody>
            </table>
            </div>
          </>
        )}
      </section>

      <CreateUser booths={booths} onCreated={(text, uid) => { setMsg({ tone: 'green', text }); setOpenId(uid) }} onError={fail} />

      <section className="card mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="stamp-text mr-auto text-ink-soft">Users</h2>
          <input className="field w-56" placeholder="Search name, ID, passport, contact" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field w-44" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}><option value="all">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}s</option>)}</select>
        </div>
        <p className="mt-1 text-xs text-ink-soft">{searching ? `Searching all ${users.length.toLocaleString('en-US')} users` : `Showing the latest ${Math.min(users.length, pageSize)}`} · press a row to open it</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-soft"><th className="py-1">Name</th><th>Role</th><th>Affiliation</th><th>Country</th><th>Stamps</th><th>Points</th><th>Registered</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} tabIndex={0} role="button" aria-label={`Open ${u.displayName}`}
                  className={`cursor-pointer border-t rule hover:bg-white/50 focus:outline-none focus-visible:bg-white/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/50 ${u.deletedAt ? 'opacity-50' : ''}`}
                  onClick={() => openRow(u.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(u.id) } }}>
                  <td className="py-1.5 font-medium">{u.displayName}<div className="text-xs text-ink-soft">{u.passportNo ?? u.contact}</div></td>
                  <td>{ROLE_LABEL[u.role]}{u.boothId ? <div className="text-xs text-ink-soft">{booths.find((b) => b.id === u.boothId)?.nameEn}</div> : null}</td>
                  <td className="text-xs">{u.institution}{u.school ? ` · ${u.school}` : ''}</td>
                  <td className="text-xs">{u.countryCode ? countryName(u.countryCode) : ''}</td>
                  <td className="fig">{u.stampCount}</td><td className="fig">{u.points}</td>
                  <td className="text-xs text-ink-soft">{ts(u.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-soft">{users.length ? 'Nothing matches' : 'No users yet'}</td></tr>}
            </tbody>
          </table>
        </div>
        {!searching && users.length >= pageSize && <button className="btn-ghost mt-3" onClick={() => setPageSize(pageSize + PAGE)}>Load more</button>}
      </section>

      {open && <UserDrawer u={open} booths={booths} onClose={closeDrawer} onRole={changeRole} onUpdate={updateUser} onSoftDelete={softDelete} onHardDelete={hardDelete} onMsg={setMsg} />}
    </div>
  )
}

/** One copyable invite link. The input is the fallback when the clipboard API refuses. */
function LinkRow({ email, link }: { email: string; link: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    // `min-w-0` on the input: a flex item will not shrink below its intrinsic width without it,
    // and this row is the path an admin uses whenever email delivery is not configured.
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-full truncate sm:w-48">{email}</span>
      <input ref={ref} readOnly className="field min-w-0 flex-1 font-mono text-[11px]" value={link} onFocus={(e) => e.currentTarget.select()} aria-label={`Invitation link for ${email}`} />
      <CopyButton text={link} inputRef={ref} />
    </li>
  )
}

/** §10 — visitors who asked from their account page for their data to be deleted. Rendered only when there is something to do. */
function ErasureInbox({ requests, onErase, onDismiss }: { requests: Array<ErasureRequest & { id: string }>; onErase: (uid: string, label: string) => Promise<void>; onDismiss: (uid: string, reason: string) => Promise<void> }) {
  if (!requests.length) return null
  return (
    <section className="mt-4 rounded-2xl border-2 border-danger/40 p-4">
      <h2 className="stamp-text text-danger-text">Erasure requests · {requests.length}</h2>
      <p className="mt-1 text-xs text-ink-soft">Erasing removes the account, passport, stamps and prize unlocks; booth counters stay. Dismiss a duplicate or test request with a reason — both actions are audited.</p>
      <ul className="mt-3 flex flex-col gap-3">
        {requests.map((r) => <ErasureRow key={r.id} r={r} onErase={onErase} onDismiss={onDismiss} />)}
      </ul>
    </section>
  )
}

function ErasureRow({ r, onErase, onDismiss }: { r: ErasureRequest; onErase: (uid: string, label: string) => Promise<void>; onDismiss: (uid: string, reason: string) => Promise<void> }) {
  const [mode, setMode] = useState<'idle' | 'erase' | 'dismiss'>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const label = r.displayName ?? r.contact ?? r.uid
  const expect = r.passportNo ?? r.displayName ?? r.uid
  return (
    <li className="rounded-xl bg-white/50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{r.displayName ?? 'Unknown name'}</b>{' '}
          <span className="text-ink-soft">{[r.passportNo, r.contact ?? r.uid].filter(Boolean).join(' · ')}</span>
          <div className="text-xs text-ink-soft">Requested {ts(r.requestedAt)}</div>
        </div>
        {mode === 'idle' && (
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => setMode('erase')}>Erase now</button>
            <button className="btn-ghost" onClick={() => setMode('dismiss')}>Dismiss</button>
          </div>
        )}
      </div>
      {mode === 'erase' && (
        <TypedConfirm expect={expect} busy={busy} onCancel={() => setMode('idle')}
          onConfirm={async () => { setBusy(true); try { await onErase(r.uid, label) } finally { setBusy(false) } }} />
      )}
      {mode === 'dismiss' && (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onDismiss(r.uid, reason.trim()) } finally { setBusy(false) } }}>
          <input className="field flex-1" placeholder="Reason (kept in the audit log)" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          <button className="btn-primary" disabled={busy || !reason.trim()}>Dismiss</button>
          <button type="button" className="btn-ghost" onClick={() => setMode('idle')}>Cancel</button>
        </form>
      )}
    </li>
  )
}

/** Type the passport number (or name) before an irreversible erase. */
function TypedConfirm({ expect, busy, onConfirm, onCancel }: { expect: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('')
  const ok = typed.trim().toLowerCase() === expect.trim().toLowerCase()
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-danger/10 p-3 text-sm">
      <p>This removes the account, passport, stamps and prize unlocks. Booth counters stay. It cannot be undone.</p>
      <label className="text-xs text-ink-soft">Type <b className="font-mono">{expect}</b> to confirm
        <input className="field mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
      </label>
      <div className="flex gap-2">
        <button className="btn-danger" disabled={!ok || busy} onClick={onConfirm}>{busy ? 'Erasing…' : 'Erase permanently'}</button>
        <button className="btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

const BLANK: CreateUserInput = { displayName: '', contact: '', role: 'visitor', boothId: '', password: '', visitorType: 'guest', countryCode: 'TH', institution: 'MFU', school: '', studentId: '' }

/** §6.2 — an account made at the desk: a walk-up visitor without a working phone, or a staff account with a set password. */
function CreateUser({ booths, onCreated, onError }: { booths: BoothOpt[]; onCreated: (text: string, uid: string) => void; onError: (e: unknown) => void }) {
  const institutions = useRefList('institutions')
  const schools = useRefList('mfuSchools')
  const [f, setF] = useState<CreateUserInput>(BLANK)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof CreateUserInput>(k: K, v: CreateUserInput[K]) => setF({ ...f, [k]: v })
  const isEmail = f.contact.includes('@')
  const passwordOk = !f.password || (f.password.length >= 10 && isEmail)
  const canSubmit = !!f.displayName.trim() && !!f.contact.trim() && (f.role !== 'organizer' || !!f.boothId) && passwordOk

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // Empty optional strings are left out so the server applies its defaults.
      const input = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as unknown as CreateUserInput
      if (input.role !== 'visitor') { delete input.visitorType; delete input.countryCode; delete input.school; delete input.studentId }
      const r = await api.createUser(input)
      onCreated(r.passportNo ? `${f.displayName} created — passport ${r.passportNo}.` : `${f.displayName} created as ${ROLE_LABEL[f.role].toLowerCase()}.`, r.uid)
      setF(BLANK)
    } catch (err) { onError(err) } finally { setBusy(false) }
  }

  return (
    <details className="reveal-host card card-static mt-4">
      <summary className="cursor-pointer"><span className="stamp-text text-ink-soft">Create a user at the desk</span></summary>
      <p className="mt-2 text-xs text-ink-soft">
        Staff normally arrive through an invitation above. Use this for a walk-up visitor who cannot sign up on their own phone, or a
        staff account with a set password. An email contact counts as confirmed — you are vouching for it.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className="field" placeholder="Name" aria-label="Name" required maxLength={80} value={f.displayName} onChange={(e) => set('displayName', e.target.value)} />
        <input className="field" placeholder="Email (or phone for a visitor)" aria-label="Contact" required value={f.contact} onChange={(e) => set('contact', e.target.value)} />
        <select className="field" aria-label="Role" value={f.role} onChange={(e) => set('role', e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        {f.role === 'organizer' ? (
          <select className="field" aria-label="Booth" value={f.boothId} onChange={(e) => set('boothId', e.target.value)} required>
            <option value="">— booth —</option>{booths.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
          </select>
        ) : <span className="hidden md:block" />}
        {f.role === 'visitor' && (
          <>
            <select className="field" aria-label="Visitor type" value={f.visitorType} onChange={(e) => set('visitorType', e.target.value as VisitorType)}>
              {VISITOR_TYPES.map((t) => <option key={t} value={t}>{VISITOR_TYPE_LABEL[t]}</option>)}
            </select>
            <select className="field" aria-label="Country" value={f.countryCode} onChange={(e) => set('countryCode', e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <input className="field" list="create-institutions" placeholder="Institution" aria-label="Institution" value={f.institution} onChange={(e) => set('institution', e.target.value)} />
            <datalist id="create-institutions">{institutions.map((i) => <option key={i} value={i} />)}</datalist>
            {f.institution === 'MFU' ? (
              <>
                <input className="field" list="create-schools" placeholder="School (MFU)" aria-label="School" value={f.school} onChange={(e) => set('school', e.target.value)} />
                <datalist id="create-schools">{schools.map((s) => <option key={s} value={s} />)}</datalist>
              </>
            ) : <span className="hidden md:block" />}
            <input className="field" placeholder="Student ID (optional)" aria-label="Student ID" maxLength={40} value={f.studentId} onChange={(e) => set('studentId', e.target.value)} />
          </>
        )}
        <input className={`field md:col-span-2 ${f.password && !passwordOk ? 'border-danger' : ''}`} type="text" autoComplete="off" placeholder="Password (optional · 10+ characters · needs an email contact)" aria-label="Password" value={f.password} onChange={(e) => set('password', e.target.value)} />
        <div className="md:col-span-4">
          <button className="btn-primary" disabled={busy || !canSubmit}>{busy ? 'Creating…' : 'Create account'}</button>
          {!f.password && <span className="ml-3 text-xs text-ink-soft">Without a password the person signs in with Google on that address, or uses “Forgot your password?” to set one.</span>}
        </div>
      </form>
    </details>
  )
}

function UserDrawer({ u, booths, onClose, onRole, onUpdate, onSoftDelete, onHardDelete, onMsg }: {
  u: Row; booths: BoothOpt[]; onClose: () => void
  onRole: (u: Row, r: Role, b?: string) => void
  onUpdate: (u: Row, patch: Omit<UpdateUserInput, 'uid'>) => Promise<void>
  onSoftDelete: (u: Row) => void
  onHardDelete: (uid: string, label: string) => Promise<void>
  onMsg: (m: Msg) => void
}) {
  const scans = useCollection<ScanDoc>(query(collection(db, 'scans'), where('visitorId', '==', u.id), orderBy('scannedAt', 'asc')), [u.id], 'this visitor’s stamps').data
  const [role, setRole] = useState<Role>(u.role)
  const [boothId, setBoothId] = useState(u.boothId ?? '')
  const [editing, setEditing] = useState(false)
  const [erasing, setErasing] = useState(false)
  const uidRef = useRef<HTMLInputElement>(null)
  return (
    <Drawer title={u.displayName} onClose={onClose}
      actions={!editing && !u.deletedAt ? <button className="btn-quiet btn-sm" onClick={() => setEditing(true)}>Edit details</button> : null}>
      <div className="text-sm text-ink-soft">{[u.passportNo, u.contact].filter(Boolean).join(' · ')}</div>
      {/* The user id is what "Void a redemption" on Prizes asks for; it was shown nowhere before. */}
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
        <span>ID</span>
        <input ref={uidRef} readOnly className="min-w-0 flex-1 bg-transparent font-mono text-[11px]" value={u.id} onFocus={(e) => e.currentTarget.select()} aria-label="User id" />
        <CopyButton text={u.id} inputRef={uidRef} />
      </div>
      {!!u.deletedAt && <div className="mt-2"><Notice tone="amber">Soft-deleted {ts(u.deletedAt)}: anonymised and disabled. Stamps kept for statistics.</Notice></div>}

      {editing ? (
        <EditForm u={u} onCancel={() => setEditing(false)} onSave={async (patch) => { await onUpdate(u, patch); setEditing(false) }} />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-soft">Type</dt><dd>{u.visitorType ? VISITOR_TYPE_LABEL[u.visitorType] : '–'}</dd>
          <dt className="text-ink-soft">Institution</dt><dd>{u.institution}{u.school ? ` · ${u.school}` : ''}</dd>
          <dt className="text-ink-soft">Student ID</dt><dd>{u.studentId || '–'}</dd>
          <dt className="text-ink-soft">Country</dt><dd>{u.countryCode ? countryName(u.countryCode) : '–'}</dd>
          <dt className="text-ink-soft">Points</dt><dd className="fig">{u.points} · {u.stampCount} stamps</dd>
          <dt className="text-ink-soft">Days</dt><dd>{u.daysAttended?.join(', ') || '–'}</dd>
          <dt className="text-ink-soft">Last seen</dt><dd>{ts(u.lastSeenAt)}</dd>
        </dl>
      )}
      <p className="mt-2 text-xs text-ink-soft">Ethnic group is never shown per person — it exists only as an aggregate on the dashboard.</p>

      <h3 className="stamp-text mt-5 text-ink-soft">Route walked</h3>
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {scans.map((s) => <li key={s.id} className="flex justify-between"><span>{booths.find((b) => b.id === s.boothId)?.nameEn ?? s.boothId}</span><span className="text-xs text-ink-soft">{ts(s.scannedAt)} · +{s.pointsAwarded}</span></li>)}
        {scans.length === 0 && <li className="text-ink-soft">No stamps yet</li>}
      </ol>

      {u.role === 'visitor' && <PrizesCollected u={u} onMsg={onMsg} />}

      <h3 className="stamp-text mt-5 text-ink-soft">Role</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className="field w-auto" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        {role === 'organizer' && <select className="field w-auto" aria-label="Booth" value={boothId} onChange={(e) => setBoothId(e.target.value)}><option value="">— booth —</option>{booths.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}</select>}
        <button className="btn-primary" disabled={(role === u.role && boothId === (u.boothId ?? '')) || (role === 'organizer' && !boothId)} onClick={() => onRole(u, role, boothId || undefined)}>Apply</button>
      </div>

      <h3 className="stamp-text mt-6 text-ink-soft">Remove</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {!u.deletedAt && <button className="btn-ghost" onClick={() => onSoftDelete(u)}>Delete (soft)</button>}
        {!erasing && <button className="btn-danger" onClick={() => setErasing(true)}>Erase permanently (PDPA)</button>}
      </div>
      <p className="mt-1 text-xs text-ink-soft">Soft delete anonymises the contact and disables sign-in; stamps stay in the statistics. Erase is the right to be forgotten: everything about the person goes.</p>
      {erasing && <TypedConfirm expect={u.passportNo ?? u.displayName} onCancel={() => setErasing(false)} onConfirm={() => onHardDelete(u.id, u.displayName)} />}
    </Drawer>
  )
}

/**
 * The visitor's prize tiers, with a Void on anything handed over — so a wrong hand-over is fixed
 * from the person's own record rather than by copying an id into the Prizes page.
 */
function PrizesCollected({ u, onMsg }: { u: Row; onMsg: (m: Msg) => void }) {
  const tiers = useTiers()
  const unlocks = useCollection<TierUnlockDoc>(query(collection(db, 'tierUnlocks'), where('visitorId', '==', u.id)), [u.id], 'this visitor’s prizes').data
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = tiers.filter((t) => unlocks.some((x) => x.tierId === t.id))
  if (!rows.length) return null
  async function doVoid(tierId: string, name: string) {
    setBusy(true)
    try { await api.voidRedemption({ visitorId: u.id, tierId, reason: reason.trim() }); onMsg({ tone: 'green', text: `${name} voided for ${u.displayName} — the item is back in stock.` }); setVoiding(null); setReason('') }
    catch (e) { onMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }
  return (
    <>
      <h3 className="stamp-text mt-5 text-ink-soft">Prizes</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {rows.map((t) => {
          const un = unlocks.find((x) => x.tierId === t.id)!
          const redeemed = !!un.redeemedAt && !un.voidedAt
          return (
            <li key={t.id} className="rounded-xl bg-white/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span><b>{t.name}</b> <span className="text-xs text-ink-soft">{redeemed ? `handed over ${ts(un.redeemedAt)}` : un.voidedAt ? 'voided — can collect again' : 'unlocked, not yet collected'}</span></span>
                {redeemed && voiding !== t.id && <button className="btn-danger-soft btn-sm" onClick={() => { setVoiding(t.id); setReason('') }}>Void</button>}
              </div>
              {voiding === t.id && (
                <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void doVoid(t.id, t.name) }}>
                  <input className="field flex-1 py-1.5 text-sm" placeholder="Reason (kept in the audit log)" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
                  <button className="btn-danger py-1.5" disabled={busy || !reason.trim()}>{busy ? 'Voiding…' : 'Void'}</button>
                  <button type="button" className="btn-ghost py-1.5" onClick={() => setVoiding(null)}>Cancel</button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Edit the profile fields updateUser accepts; only changed keys are sent. */
function EditForm({ u, onSave, onCancel }: { u: Row; onSave: (patch: Omit<UpdateUserInput, 'uid'>) => Promise<void>; onCancel: () => void }) {
  const institutions = useRefList('institutions')
  const schools = useRefList('mfuSchools')
  const initial = { displayName: u.displayName, contact: u.contact ?? '', studentId: u.studentId ?? '', institution: u.institution ?? '', school: u.school ?? '', visitorType: u.visitorType ?? 'guest', countryCode: u.countryCode ?? 'TH' }
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => setF({ ...f, [k]: v })
  const patch = Object.fromEntries((Object.keys(initial) as Array<keyof typeof initial>).filter((k) => f[k] !== initial[k]).map((k) => [k, f[k]])) as Omit<UpdateUserInput, 'uid'>
  const changed = Object.keys(patch).length > 0

  return (
    <form className="mt-3 grid grid-cols-2 gap-2 text-sm" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(patch) } catch { /* reported by the parent */ } finally { setBusy(false) } }}>
      <label className="col-span-2">Name<input className="field mt-1" required maxLength={80} value={f.displayName} onChange={(e) => set('displayName', e.target.value)} /></label>
      <label className="col-span-2">Contact <span className="text-xs text-ink-soft">(an email here also becomes the sign-in address)</span>
        <input className="field mt-1" required value={f.contact} onChange={(e) => set('contact', e.target.value)} /></label>
      <label>Type<select className="field mt-1" value={f.visitorType} onChange={(e) => set('visitorType', e.target.value as VisitorType)}>{VISITOR_TYPES.map((t) => <option key={t} value={t}>{VISITOR_TYPE_LABEL[t]}</option>)}</select></label>
      <label>Country<select className="field mt-1" value={f.countryCode} onChange={(e) => set('countryCode', e.target.value)}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
      <label>Institution<input className="field mt-1" list="edit-institutions" required value={f.institution} onChange={(e) => set('institution', e.target.value)} /></label>
      <datalist id="edit-institutions">{institutions.map((i) => <option key={i} value={i} />)}</datalist>
      <label>School<input className="field mt-1" list="edit-schools" value={f.school} onChange={(e) => set('school', e.target.value)} placeholder="(MFU only)" /></label>
      <datalist id="edit-schools">{schools.map((s) => <option key={s} value={s} />)}</datalist>
      <label className="col-span-2">Student ID<input className="field mt-1" maxLength={40} value={f.studentId} onChange={(e) => set('studentId', e.target.value)} /></label>
      <div className="col-span-2 flex gap-2">
        <button className="btn-primary" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}
