import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api, errorMessage, type CreateUserInput, type UpdateUserInput } from '../../lib/api'
import { useBooths, useCollection, useDoc, useRefList, useTiers, type WithId } from '../../lib/data'
import { CopyButton, Drawer, Notice, Toast, type Msg } from '../../components/ui'
import { Select } from '../../components/Select'
import { COUNTRIES, countryName } from '../../lib/countries'
import { ts } from '../../lib/eventText'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { useLabels } from '../../lib/labels'
import type { BoothDoc, InviteDoc, Role, ScanDoc, StaffRequestDoc, TierUnlockDoc, UserDoc, VisitorType } from '../../../shared/model'
import { useLocale } from '../../lib/locale'

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
  const { t } = useLocale()
  const { ROLE_LABEL } = useLabels()
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
  const [links, setLinks] = useState<Array<{ email: string; link: string; mailed: boolean }>>([])
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
    if (role === 'admin' && !window.confirm(t('users.makeAdminConfirm', { name: u.displayName }))) return
    if (u.role !== 'visitor' && role === 'visitor' && !window.confirm(t('users.demoteConfirm', { name: u.displayName }))) return
    try { await api.setUserRole({ uid: u.id, role, boothId }); setMsg({ tone: 'green', text: `${u.displayName} is now ${what}. Takes effect on their device within 15 minutes.` }) } catch (e) { fail(e) }
  }
  async function updateUser(u: Row, patch: Omit<UpdateUserInput, 'uid'>) {
    try { await api.updateUser({ uid: u.id, ...patch }); setMsg({ tone: 'green', text: `${u.displayName} updated.` }) } catch (e) { fail(e); throw e }
  }
  async function softDelete(u: Row) {
    if (!window.confirm(t('users.deleteConfirm', { name: u.displayName }))) return
    try { await api.deleteUser({ uid: u.id }); setMsg({ tone: 'green', text: t('users.deleted') }); setOpenId(null) } catch (e) { fail(e) }
  }
  /** PDPA erasure (§10): the account, passport, stamps and unlocks all go. Callers gate it behind a typed confirmation. */
  async function hardDelete(uid: string, label: string) {
    try { await api.deleteUser({ uid, hard: true }); setMsg({ tone: 'green', text: `${label} erased permanently.` }); setOpenId(null) } catch (e) { fail(e) }
  }
  async function dismissErasure(uid: string, reason: string) {
    try { await api.dismissErasureRequest({ uid, reason }); setMsg({ tone: 'green', text: t('users.dismissed') }) } catch (e) { fail(e) }
  }
  async function sendInvites() {
    setMsg(null)
    const list = inv.bulk.trim()
      ? inv.bulk.split('\n').map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((p) => p.length >= 2).map(([name, email, boothId]) => ({ name, email, boothId: boothId || inv.boothId, role: 'organizer' as Role }))
      : [{ name: inv.name, email: inv.email, boothId: inv.boothId || undefined, role: inv.role }]
    try {
      const r = await api.inviteOrganizer({ invites: list })
      setLinks(r.results)
      // Keyed off what actually went out, not off whether mail is *configured*: a configured
      // sender still fails per-recipient (an unverified domain, or Resend's test sender, which
      // delivers only to the account owner). Reading `mailConfigured` here put a green
      // "0 invitations emailed." directly above a row of links the admin had to send by hand.
      const mailed = r.results.filter((x) => x.mailed).length
      setMsg(mailed === r.results.length
        ? { tone: 'green', text: t('users.invitesSent', { count: mailed }) }
        : { tone: 'amber', text: r.mailConfigured
            ? t('users.mailFailed', { failed: r.results.length - mailed, total: r.results.length })
            : t('users.mailOff') })
      setInv({ ...inv, name: '', email: '', bulk: '' })
    } catch (e) { fail(e) }
  }
  async function resend(i: InviteDoc & { id: string }) {
    try {
      const r = await api.resendInvite({ inviteId: i.id })
      setLinks([{ email: i.email, link: r.link, mailed: r.mailed }])
      setMsg({ tone: r.mailed ? 'green' : 'amber', text: r.mailed ? t('users.resent', { email: i.email }) : t('users.resentLink') })
    } catch (e) { fail(e) }
  }
  async function revoke(i: InviteDoc & { id: string }) {
    if (!window.confirm(t('users.revokeConfirm', { email: i.email }))) return
    try { await api.revokeInvite({ inviteId: i.id }); setMsg({ tone: 'green', text: t('users.revoked', { email: i.email }) }) } catch (e) { fail(e) }
  }

  const openRow = (id: string) => setOpenId(id)

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">{t('users.title')}</h1>
      <Toast msg={msg} onClose={() => setMsg(null)} />

      <ErasureInbox requests={erasures} onErase={hardDelete} onDismiss={dismissErasure} />

      <StaffRequests booths={booths} onDone={setMsg} fail={fail} />

      <section className="card mt-4">
        <h2 className="stamp-text text-ink-soft">{t('users.inviteHeading')}</h2>
        <p className="mt-1 text-xs text-ink-soft">{t('users.inviteLead')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input className="field" placeholder={t('users.name')} aria-label={t('users.name')} value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
          <input className="field" placeholder={t('users.email')} aria-label={t('users.email')} type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
          <Select ariaLabel={t('users.role')} value={inv.role} onChange={(v) => setInv({ ...inv, role: v as Role })}
            options={[{ value: 'organizer', label: ROLE_LABEL.organizer }, { value: 'admin', label: ROLE_LABEL.admin }]} />
          <Select ariaLabel={t('users.booth')} value={inv.boothId} onChange={(v) => setInv({ ...inv, boothId: v })} disabled={inv.role === 'admin'}
            placeholder={t('users.boothPlaceholder')} options={booths.map((b) => ({ value: b.id, label: b.nameEn }))} />
        </div>
        <details className="reveal-host mt-2 text-sm"><summary className="cursor-pointer text-ink-soft">{t('users.bulkSummary')} <code>name, email, boothId</code> {t('users.bulkPerLine')}</summary>
          <textarea className="field mt-2 font-mono text-xs" rows={4} value={inv.bulk} onChange={(e) => setInv({ ...inv, bulk: e.target.value })} placeholder={'Somchai Thongdee, somchai@mfu.ac.th, booth-01\n…'} />
        </details>
        <button className="btn-primary mt-3" onClick={sendInvites} disabled={!inv.bulk.trim() && (!inv.name || !inv.email || (inv.role === 'organizer' && !inv.boothId))}>{t(inv.bulk.trim() ? 'users.sendInvitations' : 'users.sendInvitation')}</button>
        {links.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {links.map((l) => <LinkRow key={l.email} email={l.email} link={l.link} mailed={l.mailed} />)}
          </ul>
        )}
        {invites.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
              <span>Showing {shownInvites.length} of {invites.length} invitation{invites.length === 1 ? '' : 's'}{invites.length >= 100 ? ' (latest 100)' : ''}</span>
              <div ref={filter} className="tab-group flex gap-1" role="tablist" aria-label={t('users.inviteFilter')}>
                {(['pending', 'all'] as const).map((f) => (
                  <button key={f} role="tab" aria-selected={inviteFilter === f} onClick={() => setInviteFilter(f)}
                    className="tab">{t(f === 'pending' ? 'users.pending' : 'users.all')}</button>
                ))}
              </div>
            </div>
            {/* Six columns including an address and a timestamp: it needs the same wrapper its
                two sibling tables already have. */}
            <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="text-left text-xs text-ink-soft"><th className="py-1">{t('users.name')}</th><th>{t('users.email')}</th><th>{t('users.booth')}</th><th>{t('users.thStatus')}</th><th>{t('users.thSent')}</th><th></th></tr></thead>
              <tbody>
                {shownInvites.map((i) => (
                  <tr key={i.id} className="border-t rule">
                    <td className="py-1.5">{i.displayName}</td><td className="truncate">{i.email}</td><td>{booths.find((b) => b.id === i.boothId)?.nameEn ?? ROLE_LABEL[i.role]}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs ${i.status === 'accepted' ? 'bg-success/15 text-success-text' : i.status === 'opened' ? 'bg-action/10 text-ink' : i.status === 'sent' ? 'bg-ink/5' : 'bg-danger/10 text-danger-text'}`}>{i.status}</span></td>
                    <td className="text-xs text-ink-soft">{ts(i.sentAt)}</td>
                    <td className="text-right text-xs">
                      {i.status !== 'accepted' && i.status !== 'revoked' && <div className="flex justify-end gap-1">
                        <button className="btn-quiet btn-sm" onClick={() => resend(i)}>{t('users.resend')}</button>
                        <button className="btn-danger-soft btn-sm" onClick={() => revoke(i)}>{t('users.revoke')}</button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {shownInvites.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-xs text-ink-soft">{t('users.noPending')}</td></tr>}
              </tbody>
            </table>
            </div>
          </>
        )}
      </section>

      <CreateUser booths={booths} onCreated={(text, uid) => { setMsg({ tone: 'green', text }); setOpenId(uid) }} onError={fail} />

      <section className="card mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="stamp-text mr-auto text-ink-soft">{t('users.usersHeading')}</h2>
          <input className="field w-56" placeholder={t('users.search')} aria-label={t('users.searchAria')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="w-44" ariaLabel={t('users.filterRole')} value={roleFilter} onChange={(v) => setRoleFilter(v as Role | 'all')}
            options={[{ value: 'all', label: t('users.allRoles') }, ...ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}s` }))]} />
        </div>
        <p className="mt-1 text-xs text-ink-soft">{searching ? t('users.searchingAll', { count: users.length.toLocaleString('en-US') }) : t('users.showingLatest', { count: Math.min(users.length, pageSize) })} · {t('users.pressRow')}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-soft"><th className="py-1">{t('users.name')}</th><th>{t('users.role')}</th><th>{t('users.thAffiliation')}</th><th>{t('users.thCountry')}</th><th>{t('users.thStamps')}</th><th>{t('users.thPoints')}</th><th>{t('users.thRegistered')}</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} tabIndex={0} role="button" aria-label={t('users.openRow', { name: u.displayName })}
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
              {filtered.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-soft">{t(users.length ? 'users.nothingMatches' : 'users.noUsers')}</td></tr>}
            </tbody>
          </table>
        </div>
        {!searching && users.length >= pageSize && <button className="btn-ghost mt-3" onClick={() => setPageSize(pageSize + PAGE)}>{t('users.loadMore')}</button>}
      </section>

      {open && <UserDrawer u={open} booths={booths} onClose={closeDrawer} onRole={changeRole} onUpdate={updateUser} onSoftDelete={softDelete} onHardDelete={hardDelete} onMsg={setMsg} />}
    </div>
  )
}

/**
 * One copyable invite link. The input is the fallback when the clipboard API refuses.
 *
 * When the invitation was emailed the link is folded behind a toggle rather than dropped: the
 * admin does not need it, until the organizer says it never arrived and it is the only thing
 * that will help. Unmailed, it is the whole point of the row and stays open.
 */
function LinkRow({ email, link, mailed }: { email: string; link: string; mailed: boolean }) {
  const { t } = useLocale()
  const ref = useRef<HTMLInputElement>(null)
  // `min-w-0` on the input: a flex item will not shrink below its intrinsic width without it,
  // and this row is the path an admin uses whenever email delivery is not configured.
  const row = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full truncate sm:w-48">{email}</span>
      <input ref={ref} readOnly className="field min-w-0 flex-1 font-mono text-[11px]" value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t('users.inviteLinkFor', { email })} />
      <CopyButton text={link} inputRef={ref} />
    </div>
  )
  return (
    <li>
      {mailed ? (
        <details className="reveal-host">
          <summary className="cursor-pointer text-ink-soft">{t('users.showLink', { email })}</summary>
          <div className="mt-1">{row}</div>
        </details>
      ) : row}
    </li>
  )
}

/** §10 — visitors who asked from their account page for their data to be deleted. Rendered only when there is something to do. */
function ErasureInbox({ requests, onErase, onDismiss }: { requests: Array<ErasureRequest & { id: string }>; onErase: (uid: string, label: string) => Promise<void>; onDismiss: (uid: string, reason: string) => Promise<void> }) {
  const { t } = useLocale()
  if (!requests.length) return null
  return (
    <section className="mt-4 rounded-2xl border-2 border-danger/40 p-4">
      <h2 className="stamp-text text-danger-text">{t('users.erasureHeading', { count: requests.length })}</h2>
      <p className="mt-1 text-xs text-ink-soft">{t('users.erasureLead')}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {requests.map((r) => <ErasureRow key={r.id} r={r} onErase={onErase} onDismiss={onDismiss} />)}
      </ul>
    </section>
  )
}

function ErasureRow({ r, onErase, onDismiss }: { r: ErasureRequest; onErase: (uid: string, label: string) => Promise<void>; onDismiss: (uid: string, reason: string) => Promise<void> }) {
  const { t } = useLocale()
  const [mode, setMode] = useState<'idle' | 'erase' | 'dismiss'>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const label = r.displayName ?? r.contact ?? r.uid
  const expect = r.passportNo ?? r.displayName ?? r.uid
  return (
    <li className="rounded-xl bg-white/50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{r.displayName ?? t('users.unknownName')}</b>{' '}
          <span className="text-ink-soft">{[r.passportNo, r.contact ?? r.uid].filter(Boolean).join(' · ')}</span>
          <div className="text-xs text-ink-soft">{t('users.requested', { when: ts(r.requestedAt) })}</div>
        </div>
        {mode === 'idle' && (
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => setMode('erase')}>{t('users.eraseNow')}</button>
            <button className="btn-ghost" onClick={() => setMode('dismiss')}>{t('users.dismiss')}</button>
          </div>
        )}
      </div>
      {mode === 'erase' && (
        <TypedConfirm expect={expect} busy={busy} onCancel={() => setMode('idle')}
          onConfirm={async () => { setBusy(true); try { await onErase(r.uid, label) } finally { setBusy(false) } }} />
      )}
      {mode === 'dismiss' && (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onDismiss(r.uid, reason.trim()) } finally { setBusy(false) } }}>
          <input className="field flex-1" placeholder={t('users.reasonAudit')} aria-label={t('users.reason')} value={reason} onChange={(e) => setReason(e.target.value)} required />
          <button className="btn-primary" disabled={busy || !reason.trim()}>{t('users.dismiss')}</button>
          <button type="button" className="btn-ghost" onClick={() => setMode('idle')}>{t('users.cancel')}</button>
        </form>
      )}
    </li>
  )
}

/** Type the passport number (or name) before an irreversible erase. */
function TypedConfirm({ expect, busy, onConfirm, onCancel }: { expect: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useLocale()
  const [typed, setTyped] = useState('')
  const ok = typed.trim().toLowerCase() === expect.trim().toLowerCase()
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-danger/10 p-3 text-sm">
      <p>{t('users.eraseWarn')}</p>
      <label className="text-xs text-ink-soft">{t('users.typeToConfirm')} <b className="font-mono">{expect}</b> {t('users.toConfirm')}
        <input className="field mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
      </label>
      <div className="flex gap-2">
        <button className="btn-danger" disabled={!ok || busy} onClick={onConfirm}>{t(busy ? 'users.erasing' : 'users.erasePermanently')}</button>
        <button className="btn-ghost" disabled={busy} onClick={onCancel}>{t('users.cancel')}</button>
      </div>
    </div>
  )
}

const BLANK: CreateUserInput = { displayName: '', contact: '', role: 'visitor', boothId: '', password: '', visitorType: 'guest', countryCode: 'TH', institution: 'MFU', school: '', studentId: '' }

/** §6.2 — an account made at the desk: a walk-up visitor without a working phone, or a staff account with a set password. */
function CreateUser({ booths, onCreated, onError }: { booths: BoothOpt[]; onCreated: (text: string, uid: string) => void; onError: (e: unknown) => void }) {
  const { t } = useLocale()
  const { ROLE_LABEL, VISITOR_TYPE_LABEL } = useLabels()
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
      <summary className="cursor-pointer"><span className="stamp-text text-ink-soft">{t('users.createHeading')}</span></summary>
      <p className="mt-2 text-xs text-ink-soft">
        Staff normally arrive through an invitation above. Use this for a walk-up visitor who cannot sign up on their own phone, or a
        staff account with a set password. An email contact counts as confirmed — you are vouching for it.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className="field" placeholder={t('users.name')} aria-label={t('users.name')} required maxLength={80} value={f.displayName} onChange={(e) => set('displayName', e.target.value)} />
        <input className="field" placeholder={t('users.contact')} aria-label={t('users.contactAria')} required value={f.contact} onChange={(e) => set('contact', e.target.value)} />
        <Select ariaLabel={t('users.role')} value={f.role} onChange={(v) => set('role', v as Role)}
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        {f.role === 'organizer' ? (
          <Select ariaLabel={t('users.booth')} value={f.boothId} onChange={(v) => set('boothId', v)}
            placeholder="— booth —" options={booths.map((b) => ({ value: b.id, label: b.nameEn }))} />
        ) : <span className="hidden md:block" />}
        {f.role === 'visitor' && (
          <>
            <Select ariaLabel={t('users.visitorType')} value={f.visitorType} onChange={(v) => set('visitorType', v as VisitorType)}
              options={VISITOR_TYPES.map((t) => ({ value: t, label: VISITOR_TYPE_LABEL[t] }))} />
            <Select ariaLabel={t('users.country')} value={f.countryCode} onChange={(v) => set('countryCode', v)}
              options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
            {/* The same lists the visitor's own form offers, chosen the same way. A `<datalist>`
                draws its suggestions in the OS, and half this row is already `Select`. */}
            <Select ariaLabel={t('users.institution')} placeholder={t('users.institution')} value={f.institution}
              onChange={(v) => set('institution', v)}
              options={institutions.map((i) => ({ value: i, label: i }))} />
            {f.institution === 'MFU' ? (
              <Select ariaLabel={t('users.schoolAria')} placeholder={t('users.school')} value={f.school}
                onChange={(v) => set('school', v)}
                options={schools.map((x) => ({ value: x, label: x }))} />
            ) : <span className="hidden md:block" />}
            <input className="field" placeholder={t('users.studentId')} aria-label={t('users.studentIdAria')} maxLength={40} value={f.studentId} onChange={(e) => set('studentId', e.target.value)} />
          </>
        )}
        <input className={`field md:col-span-2 ${f.password && !passwordOk ? 'border-danger' : ''}`} type="text" autoComplete="off" placeholder={t('users.password')} aria-label={t('users.passwordAria')} value={f.password} onChange={(e) => set('password', e.target.value)} />
        <div className="md:col-span-4">
          <button className="btn-primary" disabled={busy || !canSubmit}>{t(busy ? 'users.creating' : 'users.createAccount')}</button>
          {!f.password && <span className="ml-3 text-xs text-ink-soft">{t('users.noPasswordNote')}</span>}
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
  const { t } = useLocale()
  const { ROLE_LABEL, VISITOR_TYPE_LABEL } = useLabels()
  const scans = useCollection<ScanDoc>(query(collection(db, 'scans'), where('visitorId', '==', u.id), orderBy('scannedAt', 'asc')), [u.id], 'this visitor’s stamps').data
  const [role, setRole] = useState<Role>(u.role)
  const [boothId, setBoothId] = useState(u.boothId ?? '')
  const [editing, setEditing] = useState(false)
  const [erasing, setErasing] = useState(false)
  const uidRef = useRef<HTMLInputElement>(null)
  return (
    <Drawer title={u.displayName} onClose={onClose}
      actions={!editing && !u.deletedAt ? <button className="btn-quiet btn-sm" onClick={() => setEditing(true)}>{t('users.editDetails')}</button> : null}>
      <div className="text-sm text-ink-soft">{[u.passportNo, u.contact].filter(Boolean).join(' · ')}</div>
      {/* The user id is what "Void a redemption" on Prizes asks for; it was shown nowhere before. */}
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
        <span>ID</span>
        <input ref={uidRef} readOnly className="min-w-0 flex-1 bg-transparent font-mono text-[11px]" value={u.id} onFocus={(e) => e.currentTarget.select()} aria-label={t('users.userId')} />
        <CopyButton text={u.id} inputRef={uidRef} />
      </div>
      {!!u.deletedAt && <div className="mt-2"><Notice tone="amber">Soft-deleted {ts(u.deletedAt)}: anonymised and disabled. Stamps kept for statistics.</Notice></div>}

      {editing ? (
        <EditForm u={u} onCancel={() => setEditing(false)} onSave={async (patch) => { await onUpdate(u, patch); setEditing(false) }} />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-soft">{t('users.type')}</dt><dd>{u.visitorType ? VISITOR_TYPE_LABEL[u.visitorType] : '–'}</dd>
          <dt className="text-ink-soft">{t('users.institution')}</dt><dd>{u.institution}{u.school ? ` · ${u.school}` : ''}</dd>
          <dt className="text-ink-soft">{t('users.studentIdAria')}</dt><dd>{u.studentId || '–'}</dd>
          <dt className="text-ink-soft">{t('users.country')}</dt><dd>{u.countryCode ? countryName(u.countryCode) : '–'}</dd>
          <dt className="text-ink-soft">{t('users.thPoints')}</dt><dd className="fig">{t('users.pointsStamps', { points: u.points, stamps: u.stampCount })}</dd>
          <dt className="text-ink-soft">{t('users.days')}</dt><dd>{u.daysAttended?.join(', ') || '–'}</dd>
          <dt className="text-ink-soft">{t('users.lastSeen')}</dt><dd>{ts(u.lastSeenAt)}</dd>
        </dl>
      )}
      <p className="mt-2 text-xs text-ink-soft">{t('users.ethnicNote')}</p>

      <h3 className="stamp-text mt-5 text-ink-soft">{t('users.route')}</h3>
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {scans.map((s) => <li key={s.id} className="flex justify-between"><span>{booths.find((b) => b.id === s.boothId)?.nameEn ?? s.boothId}</span><span className="text-xs text-ink-soft">{ts(s.scannedAt)} · +{s.pointsAwarded}</span></li>)}
        {scans.length === 0 && <li className="text-ink-soft">{t('users.noStamps')}</li>}
      </ol>

      {u.role === 'visitor' && <PrizesCollected u={u} onMsg={onMsg} />}

      <h3 className="stamp-text mt-5 text-ink-soft">{t('users.role')}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Select className="w-44" ariaLabel={t('users.role')} value={role} onChange={(v) => setRole(v as Role)}
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        {role === 'organizer' && <Select className="w-56" ariaLabel={t('users.booth')} value={boothId} onChange={setBoothId}
          placeholder="— booth —" options={booths.map((b) => ({ value: b.id, label: b.nameEn }))} />}
        <button className="btn-primary" disabled={(role === u.role && boothId === (u.boothId ?? '')) || (role === 'organizer' && !boothId)} onClick={() => onRole(u, role, boothId || undefined)}>{t('users.apply')}</button>
      </div>

      <h3 className="stamp-text mt-6 text-ink-soft">{t('users.remove')}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {!u.deletedAt && <button className="btn-ghost" onClick={() => onSoftDelete(u)}>{t('users.softDelete')}</button>}
        {!erasing && <button className="btn-danger" onClick={() => setErasing(true)}>{t('users.erasePdpa')}</button>}
      </div>
      <p className="mt-1 text-xs text-ink-soft">{t('users.removeNote')}</p>
      {erasing && <TypedConfirm expect={u.passportNo ?? u.displayName} onCancel={() => setErasing(false)} onConfirm={() => onHardDelete(u.id, u.displayName)} />}
    </Drawer>
  )
}

/**
 * The visitor's prize tiers, with a Void on anything handed over — so a wrong hand-over is fixed
 * from the person's own record rather than by copying an id into the Prizes page.
 */
function PrizesCollected({ u, onMsg }: { u: Row; onMsg: (m: Msg) => void }) {
  const { t } = useLocale()
  const tiers = useTiers()
  const unlocks = useCollection<TierUnlockDoc>(query(collection(db, 'tierUnlocks'), where('visitorId', '==', u.id)), [u.id], 'this visitor’s prizes').data
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = tiers.filter((t) => unlocks.some((x) => x.tierId === t.id))
  if (!rows.length) return null
  async function doVoid(tierId: string, name: string) {
    setBusy(true)
    try { await api.voidRedemption({ visitorId: u.id, tierId, reason: reason.trim() }); onMsg({ tone: 'green', text: t('users.voided', { tier: name, name: u.displayName }) }); setVoiding(null); setReason('') }
    catch (e) { onMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }
  return (
    <>
      <h3 className="stamp-text mt-5 text-ink-soft">{t('users.prizes')}</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {rows.map((tier) => {
          const un = unlocks.find((x) => x.tierId === tier.id)!
          const redeemed = !!un.redeemedAt && !un.voidedAt
          return (
            <li key={tier.id} className="rounded-xl bg-white/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span><b>{tier.name}</b> <span className="text-xs text-ink-soft">{redeemed ? `handed over ${ts(un.redeemedAt)}` : un.voidedAt ? 'voided — can collect again' : 'unlocked, not yet collected'}</span></span>
                {redeemed && voiding !== tier.id && <button className="btn-danger-soft btn-sm" onClick={() => { setVoiding(tier.id); setReason('') }}>{t('users.void')}</button>}
              </div>
              {voiding === tier.id && (
                <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void doVoid(tier.id, tier.name) }}>
                  <input className="field flex-1 py-1.5 text-sm" placeholder={t('users.reasonAudit')} aria-label={t('users.reason')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
                  <button className="btn-danger py-1.5" disabled={busy || !reason.trim()}>{t(busy ? 'users.voiding' : 'users.void')}</button>
                  <button type="button" className="btn-ghost py-1.5" onClick={() => setVoiding(null)}>{t('users.cancel')}</button>
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
  const { t } = useLocale()
  const { VISITOR_TYPE_LABEL } = useLabels()
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
      <label className="col-span-2">{t('users.name')}<input className="field mt-1" required maxLength={80} value={f.displayName} onChange={(e) => set('displayName', e.target.value)} /></label>
      <label className="col-span-2">{t('users.contactEdit')} <span className="text-xs text-ink-soft">{t('users.contactEditNote')}</span>
        <input className="field mt-1" required value={f.contact} onChange={(e) => set('contact', e.target.value)} /></label>
      <div>{t('users.type')}<div className="mt-1"><Select ariaLabel={t('users.type')} value={f.visitorType} onChange={(v) => set('visitorType', v as VisitorType)}
        options={VISITOR_TYPES.map((t) => ({ value: t, label: VISITOR_TYPE_LABEL[t] }))} /></div></div>
      <div>Country<div className="mt-1"><Select ariaLabel={t('users.country')} value={f.countryCode} onChange={(v) => set('countryCode', v)}
        options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} /></div></div>
      <div>{t('users.institution')}<div className="mt-1"><Select ariaLabel={t('users.institution')} value={f.institution}
        onChange={(v) => set('institution', v)} options={institutions.map((i) => ({ value: i, label: i }))} /></div></div>
      <div>{t('users.schoolAria')}<div className="mt-1"><Select ariaLabel={t('users.schoolAria')} placeholder={t('users.mfuOnly')} value={f.school}
        onChange={(v) => set('school', v)} options={schools.map((x) => ({ value: x, label: x }))} /></div></div>
      <label className="col-span-2">{t('users.studentIdAria')}<input className="field mt-1" maxLength={40} value={f.studentId} onChange={(e) => set('studentId', e.target.value)} /></label>
      <div className="col-span-2 flex gap-2">
        <button className="btn-primary" disabled={busy || !changed}>{t(busy ? 'common.saving' : 'users.saveChanges')}</button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>{t('users.cancel')}</button>
      </div>
    </form>
  )
}

/** Who currently runs the booth a request names, so an approval is a choice and not a surprise. */
function CurrentHolder({ uid, self }: { uid: string; self: string }) {
  const { t } = useLocale()
  const holder = useDoc<UserDoc>(doc(db, 'users', uid), [uid], 'the current organizer').data
  // Their own re-request for a booth they already hold is not a conflict worth flagging.
  if (uid === self) return null
  return <p className="mt-1 text-xs font-medium text-warn-text">{t('users.reqHeldBy', { name: holder?.displayName || holder?.contact || uid })}</p>
}

/**
 * Booth hosts who asked for access without an invitation.
 *
 * Above the invite form deliberately: an invitation is a task an admin chose to start, a pending
 * request is someone standing at the desk waiting. The order on the page should match that.
 */
function StaffRequests({ booths, onDone, fail }: {
  booths: WithId<BoothDoc>[]
  onDone: (m: Msg) => void
  fail: (e: unknown) => void
}) {
  const { t } = useLocale()
  const rows = useCollection<StaffRequestDoc>(
    query(collection(db, 'staffRequests'), where('status', '==', 'pending')), [], 'the booth access requests').data
  const [override, setOverride] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  if (!rows.length) return null

  async function decide(uid: string, approve: boolean) {
    setBusy(uid)
    try {
      const r = await api.decideStaffRequest({ uid, approve, ...(override[uid] ? { boothId: override[uid] } : {}) })
      onDone(approve
        ? { tone: 'green', text: t('users.reqApproved', { booth: r.boothName ?? '', n: r.createdBooth ? 1 : 0 }) }
        : { tone: 'amber', text: t('users.reqRejected') })
    } catch (e) { fail(e) } finally { setBusy(null) }
  }

  return (
    <section className="card mt-4 ring-2 ring-action/40">
      <h2 className="stamp-text text-ink-soft">{t('users.reqHeading')}</h2>
      <p className="mt-1 text-xs text-ink-soft">{t('users.reqLead')}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl bg-ink/4 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{r.displayName}</span>
              <span className="text-xs text-ink-soft">{r.contact}</span>
            </div>
            <p className="mt-1 text-sm">
              {r.boothId
                ? t('users.reqWants', { booth: booths.find((b) => b.id === r.boothId)?.nameEn ?? r.boothId })
                : t('users.reqWantsNew', { booth: r.newBoothName ?? '' })}
            </p>
            {/* The decision the admin is actually making when the booth is already staffed is
                "a second person, or a mistake?" — and they cannot make it without being told there
                is a first person. The booth's own pointer names them. */}
            {r.boothId && booths.find((b) => b.id === r.boothId)?.organizerUid && (
              <CurrentHolder uid={booths.find((b) => b.id === r.boothId)!.organizerUid!} self={r.id} />
            )}
            {r.note && <p className="mt-1 text-xs italic text-ink-soft">{r.note}</p>}
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              {/* An override, because the name someone gives their booth and the name on the
                  sheet are often not the same — "the Korea table" against ED12. */}
              <Select
                ariaLabel={t('users.reqOverride')} value={override[r.id] ?? ''}
                onChange={(v) => setOverride({ ...override, [r.id]: v })}
                placeholder={t('users.reqOverride')}
                options={booths.map((b) => ({ value: b.id, label: b.nameEn }))}
              />
              <button className="btn-primary" disabled={busy !== null} onClick={() => decide(r.id, true)}>{t('users.reqApprove')}</button>
              <button className="btn-ghost" disabled={busy !== null} onClick={() => decide(r.id, false)}>{t('users.reqReject')}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
