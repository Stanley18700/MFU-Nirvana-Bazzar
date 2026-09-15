import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { collection, doc, documentId, getCountFromServer, getDocs, limit, limitToLast, orderBy, query, startAfter, where } from 'firebase/firestore'
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
/** Rows per page. Fifty is a screen and a half on a laptop and one long thumb-scroll on a phone. */
const PAGE = 50
/**
 * Firestore has no substring search, so a search reads the newest users once and filters here.
 * 2,000 covers the 1,500 expected at the festival with room; past it the page says so rather than
 * pretending. This is a one-shot read, not a listener — the old page kept a live snapshot of
 * every user open for as long as the search box had text in it.
 */
const SEARCH_ALL = 2000

/** The last row of a page, which is where the next page starts. */
type Cursor = { createdAt: unknown; id: string }

/**
 * The seven cells of the strip: first, last, the current page and its neighbours, and an ellipsis
 * standing in for whatever is skipped. Always seven when there are more than seven pages, so the
 * control keeps one width and every number keeps its place.
 */
function cellsFor(page: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  if (page <= 3) return [0, 1, 2, 3, 4, '…', total - 1]
  if (page >= total - 4) return [0, '…', total - 5, total - 4, total - 3, total - 2, total - 1]
  return [0, '…', page - 1, page, page + 1, '…', total - 1]
}

/**
 * The pager: a numbered strip with the current page as the sliding pill, and an arrow either side.
 *
 * Numbers rather than a "Page 3" label between two buttons, because the label was status dressed
 * as a control — same weight as the buttons beside it, and no way to act on it. In the strip the
 * current page is the pill, so status and control are one thing.
 *
 * Every number shown can be reached. That is the constraint the shape had to satisfy, not the
 * other way round: the first page needs no cursor, the last is read backwards off the index, and
 * the rest are a step from where you already are. An ellipsis is a gap, not a button — it says
 * "pages here" without pretending you can land on one by pressing dots.
 */
function Pager({ page, total, onPage, from, to, count, busy }: {
  page: number; total: number; onPage: (p: number) => void; from: number; to: number; count?: number; busy?: boolean
}) {
  const { t } = useLocale()
  const strip = useSlidingPill()
  if (total <= 1) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
      <span>{count === undefined ? t('users.showingPage', { from, to }) : t('users.showingPageOf', { from, to, total: count.toLocaleString('en-US') })}</span>
      <nav className="flex items-center gap-1.5" aria-label={t('users.pages')} aria-busy={busy || undefined}>
        <button type="button" className="btn-ghost btn-sm btn-icon-sm" onClick={() => onPage(page - 1)} disabled={page === 0 || busy} aria-label={t('users.prev')}>
          <span aria-hidden>‹</span>
        </button>
        <div ref={strip} className="seg seg-light" role="group">
          {cellsFor(page, total).map((c, i) => c === '…'
            ? <span key={`gap${i}`} aria-hidden className="seg-item pointer-events-none min-w-6 text-center opacity-60">…</span>
            : (
              <button
                key={c} type="button" onClick={() => onPage(c)} disabled={busy}
                className="seg-item min-w-8 tabular-nums" aria-current={c === page ? 'page' : undefined} aria-label={t('users.page', { n: c + 1 })}
              >
                {c + 1}
              </button>
            ))}
        </div>
        <button type="button" className="btn-ghost btn-sm btn-icon-sm" onClick={() => onPage(page + 1)} disabled={page >= total - 1 || busy} aria-label={t('users.next')}>
          <span aria-hidden>›</span>
        </button>
      </nav>
    </div>
  )
}

/** §6.2 users, §6.4 invitations, §10 erasure requests. */
export default function Users() {
  const { t } = useLocale()
  const { ROLE_LABEL } = useLabels()
  const booths = useBooths(true)
  const filter = useSlidingPill()
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [q, setQ] = useState('')
  // Debounced: the search reads the whole list once, and it should not do that on every keystroke.
  const [qd, setQd] = useState('')
  useEffect(() => { const id = setTimeout(() => setQd(q), 300); return () => clearTimeout(id) }, [q])
  const searching = qd.trim().length >= 2

  /*
   * One page of users, live, and only that page. The cursor for page n is the last row of page
   * n-1, kept per page so Previous is a lookup rather than a second query. `documentId()` is the
   * tie-break: two people who joined in the same millisecond of the gate rush share a
   * `createdAt`, and without it one of them would fall between two pages.
   *
   * PAGE + 1 rows are asked for so the page knows whether there is a next one without a count.
   */
  const [page, setPage] = useState(0)
  const [cursors, setCursors] = useState<Cursor[]>([])
  const base = roleFilter === 'all'
    ? query(collection(db, 'users'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'))
    : query(collection(db, 'users'), where('role', '==', roleFilter), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'))
  const cursor = page > 0 ? cursors[page - 1] : undefined

  /*
   * How long the list is, so the strip can show real page numbers from the first render instead of
   * discovering them one press at a time. `getCountFromServer` is an aggregation — it reads index
   * entries, not documents, and bills one read per thousand, so the whole festival costs two. It
   * runs again when the role filter changes, because that is a different list.
   *
   * If it fails the page still works: `null` falls back to counting the pages we have cursors for
   * plus the one the fifty-first row proves is there.
   */
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    setCount(null)
    getCountFromServer(base).then((s) => { if (!cancelled) setCount(s.data().count) }).catch(() => { if (!cancelled) setCount(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter])

  /*
   * Which end to read from.
   *
   * A cursor is the last row of the page before it, so reaching page thirty from page one means
   * fetching twenty-nine pages to throw away. `limitToLast` does not: it is the same query read
   * backwards off the same index, so the last page costs its own rows and nothing else. Whichever
   * end the wanted page is nearer to is the end it is fetched from — which is what makes every
   * number in the strip reachable rather than only the ones next door.
   */
  const knownTotal = count === null ? null : Math.max(1, Math.ceil(count / PAGE))
  const tailRows = knownTotal === null || count === null ? 0 : count - (knownTotal - 1) * PAGE
  const fromEnd = knownTotal === null ? Infinity : knownTotal - 1 - page
  const useTail = knownTotal !== null && fromEnd < page && page > cursors.length
  const tailLimit = useTail ? fromEnd * PAGE + tailRows : 0
  const live = useCollection<UserDoc>(
    searching ? null
      : useTail ? query(base, limitToLast(tailLimit))
      : cursor ? query(base, startAfter(cursor.createdAt, cursor.id), limit(PAGE + 1))
      : query(base, limit(PAGE + 1)),
    [roleFilter, page, searching, cursor?.id, useTail, tailLimit], 'the user list',
  )
  const pageRows = live.data.slice(0, PAGE)
  const liveHasNext = useTail ? fromEnd > 0 : live.data.length > PAGE

  /*
   * Which page the rows on screen are actually from.
   *
   * A snapshot arrives a few hundred milliseconds after the press, and until it does the table
   * still holds the previous page while the pill has already moved — the control saying one thing
   * and the table showing another. `live.data` is a fresh array on every snapshot, so the page
   * number recorded when it changes is the page those rows belong to, and anything else means the
   * table is still catching up.
   */
  const [rowsFrom, setRowsFrom] = useState(0)
  useEffect(() => {
    /*
     * A cached snapshot does not count. Firestore answers from the local cache first, and its
     * answer to `limitToLast(88)` is drawn from whatever documents happen to be cached — stepping
     * back from the last page briefly showed rows from the top of the list, undimmed, because
     * those were the documents most recently fetched. Only the server's answer says which page
     * these rows are.
     *
     * The wait is capped so a desk on failing wifi is left with a dimmed table rather than a dim
     * one forever; offline, cached rows are the best answer there is.
     */
    if (!live.fromCache) { setRowsFrom(page); return }
    const id = setTimeout(() => setRowsFrom(page), 1200)
    return () => clearTimeout(id)
  }, [live.data, live.fromCache]) // eslint-disable-line react-hooks/exhaustive-deps
  const catchingUp = !searching && rowsFrom !== page

  const livePages = knownTotal ?? Math.max(cursors.length + 1, page + 1 + (liveHasNext ? 1 : 0))

  // A filter or a search is a new list: start it from the top.
  useEffect(() => { setPage(0); setCursors([]) }, [roleFilter, searching, qd])

  /* The search: one read of the newest SEARCH_ALL, filtered here, paged here. */
  const [found, setFound] = useState<Row[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'busy' | 'error'>('idle')
  useEffect(() => {
    if (!searching) { setFound([]); setSearchState('idle'); return }
    let cancelled = false
    setSearchState('busy')
    getDocs(query(base, limit(SEARCH_ALL)))
      .then((snap) => { if (!cancelled) { setFound(snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserDoc) }))); setSearchState('idle') } })
      .catch(() => { if (!cancelled) setSearchState('error') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, qd, roleFilter])

  const users = searching ? found : pageRows
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
    const s = qd.trim().toLowerCase()
    return searching ? users.filter((u) => [u.displayName, u.contact, u.studentId, u.passportNo].some((v) => v?.toLowerCase().includes(s))) : users
  }, [users, qd, searching])
  const totalPages = searching ? Math.max(1, Math.ceil(filtered.length / PAGE)) : livePages
  // What is on screen this page. Server pages arrive already cut; a search is cut here.
  const visible = searching ? filtered.slice(page * PAGE, (page + 1) * PAGE) : filtered
  /*
   * Moving forward leaves this page's last row behind as the cursor for the next one, recorded on
   * the press rather than in an effect. An effect that watched the rows instead would fire once
   * with the page number already advanced and the previous page's rows still on screen, and file
   * that page's cursor under the new number — a duplicated page, found by walking nine of them.
   *
   * Cursors are kept, not truncated, so the numbers stay reachable after jumping back. They do
   * not go stale: a cursor names a document, not an offset, so people arriving at the gate land
   * on page one and shift nothing underneath it.
   */

  /*
   * Moving. A page that is nearer the end than the start is read backwards and needs no cursor at
   * all; one that is nearer the start needs the cursors up to it, and the only forward move the
   * strip offers without them is the very next page, whose last row is already on screen.
   *
   * The walk is kept for the case the count is unavailable, where there is no "nearer the end" to
   * measure against — it fetches whole pages to keep their last rows, which is why the strip does
   * not offer distant numbers when it cannot tell how far away they are.
   */
  /*
   * The top of the list, to return to on a page change. The pager sits at the foot of a table
   * fifty rows tall, so without this the new page opens wherever the old one left the scroll: at
   * its middle when the page grows, and hauled up by the browser when it shrinks, which is what
   * made stepping back from the last page feel like it had lost its place.
   */
  const listTop = useRef<HTMLDivElement>(null)
  const invTop = useRef<HTMLDivElement>(null)
  const show = (p: number) => {
    setPage(p)
    listTop.current?.scrollIntoView({ block: 'start' })
  }

  const [jumping, setJumping] = useState(false)
  const goPage = async (p: number) => {
    if (p < 0 || p >= totalPages || p === page) return
    if (searching) { show(p); return }
    if (p <= cursors.length) { show(p); return }
    if (knownTotal !== null && knownTotal - 1 - p < p) { show(p); return }   // read from the end
    if (p === page + 1 && pageRows.length) {
      const last = pageRows[pageRows.length - 1]
      setCursors((c) => Object.assign([...c], { [page]: { createdAt: last.createdAt, id: last.id } }))
      show(p)
      return
    }
    setJumping(true)
    try {
      const next = [...cursors]
      for (let i = next.length; i < p; i++) {
        const c = i === 0 ? undefined : next[i - 1]
        const snap = await getDocs(c ? query(base, startAfter(c.createdAt, c.id), limit(PAGE)) : query(base, limit(PAGE)))
        const last = snap.docs[snap.docs.length - 1]
        if (!last) break
        next[i] = { createdAt: last.get('createdAt'), id: last.id }
      }
      if (next.length >= p) { setCursors(next); show(p) }
    } catch { /* the list itself reports the failure; the page simply does not move */ }
    finally { setJumping(false) }
  }
  const [invPage, setInvPage] = useState(0)
  const shownInvites = inviteFilter === 'all' ? invites : invites.filter((i) => i.status === 'sent' || i.status === 'opened')
  useEffect(() => { setInvPage(0) }, [inviteFilter])
  const visibleInvites = shownInvites.slice(invPage * PAGE, (invPage + 1) * PAGE)

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

      <section className="card mt-4" ref={invTop}>
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
                {visibleInvites.map((i) => (
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
            <Pager page={invPage} total={Math.max(1, Math.ceil(shownInvites.length / PAGE))}
              onPage={(p) => { setInvPage(p); invTop.current?.scrollIntoView({ block: 'start' }) }}
              from={invPage * PAGE + 1} to={Math.min(shownInvites.length, (invPage + 1) * PAGE)} count={shownInvites.length} />
          </>
        )}
      </section>

      <CreateUser booths={booths} onCreated={(text, uid) => { setMsg({ tone: 'green', text }); setOpenId(uid) }} onError={fail} />

      <section className="card mt-4" ref={listTop}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="stamp-text mr-auto text-ink-soft">{t('users.usersHeading')}</h2>
          <input className="field w-56" placeholder={t('users.search')} aria-label={t('users.searchAria')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="w-44" ariaLabel={t('users.filterRole')} value={roleFilter} onChange={(v) => setRoleFilter(v as Role | 'all')}
            options={[{ value: 'all', label: t('users.allRoles') }, ...ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}s` }))]} />
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          {searching
            ? searchState === 'busy' ? t('users.searching')
              : searchState === 'error' ? t('users.searchFailed')
              : `${t('users.searchingAll', { count: found.length.toLocaleString('en-US') })}${found.length >= SEARCH_ALL ? ` · ${t('users.searchCapped', { count: SEARCH_ALL.toLocaleString('en-US') })}` : ''}`
            : t('users.newestFirst')}
          {' · '}{t('users.pressRow')}
        </p>
        {/* Seven columns need a floor, like the invitations table has: without one a 390px
            screen crushes them instead of scrolling them, and "Registered" arrives as "15/0". */}
        {/* Dimmed, not emptied, while the rows catch up with the pill: a table that blanks for
            three hundred milliseconds reads as a page that broke, and the rows underneath are
            still the ones the admin was looking at. */}
        <div className={`mt-3 overflow-x-auto transition-opacity duration-150 ${catchingUp ? 'pointer-events-none opacity-45' : ''}`} aria-busy={catchingUp || undefined}>
          <table className="w-full min-w-[44rem] text-sm">
            <thead><tr className="text-left text-xs text-ink-soft"><th className="py-1">{t('users.name')}</th><th>{t('users.role')}</th><th>{t('users.thAffiliation')}</th><th>{t('users.thCountry')}</th><th>{t('users.thStamps')}</th><th>{t('users.thPoints')}</th><th>{t('users.thRegistered')}</th></tr></thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id} tabIndex={0} role="button" aria-label={t('users.openRow', { name: u.displayName })}
                  className={`cursor-pointer border-t rule hover:bg-white/50 focus:outline-none focus-visible:bg-white/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/50 ${u.deletedAt ? 'opacity-50' : ''}`}
                  onClick={() => openRow(u.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(u.id) } }}>
                  <td className="py-1.5 font-medium">{u.displayName}<div className="text-xs text-ink-soft">{u.passportNo ?? u.contact}</div></td>
                  <td>{ROLE_LABEL[u.role]}{u.boothId ? <div className="text-xs text-ink-soft">{booths.find((b) => b.id === u.boothId)?.nameEn}</div> : null}</td>
                  <td className="text-xs">{u.institution}{u.school ? ` · ${u.school}` : ''}</td>
                  <td className="text-xs">{u.countryCode ? countryName(u.countryCode) : ''}</td>
                  <td className="fig">{u.stampCount}</td><td className="fig">{u.points}</td>
                  <td className="whitespace-nowrap text-xs text-ink-soft">{ts(u.createdAt)}</td>
                </tr>
              ))}
              {visible.length === 0 && searchState !== 'busy' && <tr><td colSpan={7} className="py-4 text-center text-ink-soft">{t(searching ? 'users.nothingMatches' : 'users.noUsers')}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={totalPages} onPage={goPage} busy={jumping || catchingUp}
          from={page * PAGE + 1} to={page * PAGE + visible.length} count={searching ? filtered.length : count ?? undefined} />
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
