import { useMemo, useState } from 'react'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection } from '../../lib/data'
import { CsvButton, fmt } from '../../components/ui'
import type { UserDoc } from '../../../shared/model'

type Row = { actorUid: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; createdAt: unknown }
const ts = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? new Date((v as { toMillis(): number }).toMillis()).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '–')
const PAGE = 200

/** §6.2 — every admin mutation, with actor and timestamp. */
export default function Audit() {
  const [pageSize, setPageSize] = useState(PAGE)
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')
  const rows = useCollection<Row>(query(collection(db, 'auditLog'), orderBy('createdAt', 'desc'), limit(pageSize)), [pageSize], 'the audit log').data
  // Actors are admins (and organizers, for voided redemptions): a short list, joined here for names.
  const staff = useCollection<UserDoc>(query(collection(db, 'users'), where('role', 'in', ['admin', 'organizer'])), [], 'the staff list').data
  const names = useMemo(() => new Map(staff.map((u) => [u.id, u.displayName])), [staff])
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) =>
      (!action || r.action === action)
      && (!needle || [r.action, r.targetType, r.targetId, r.actorUid, names.get(r.actorUid) ?? ''].some((s) => s.toLowerCase().includes(needle))))
  }, [rows, action, q, names])
  const csvRows = filtered.map((r) => ({
    when: ts(r.createdAt), action: r.action, targetType: r.targetType, targetId: r.targetId,
    actor: names.get(r.actorUid) ?? '', actorUid: r.actorUid,
    before: r.before == null ? '' : JSON.stringify(r.before), after: r.after == null ? '' : JSON.stringify(r.after),
  }))

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="mt-1 text-sm text-navy-soft">Showing {filtered.length === rows.length ? fmt(rows.length) : `${fmt(filtered.length)} of ${fmt(rows.length)}`} most recent entries.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field w-auto py-1.5 text-sm" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="field w-48 py-1.5 text-sm" placeholder="Search target, actor…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          {/* The before/after diffs of updateUser carry contacts and student ids. */}
          <CsvButton rows={csvRows} name="audit-log" label="CSV (contains personal data)"
            confirm="This export includes before/after values from user edits, which contain contact details. Continue?" />
        </div>
      </header>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-navy-soft"><th className="py-1">When</th><th>Action</th><th>Target</th><th>Actor</th><th>Change</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t rule align-top">
                <td className="whitespace-nowrap py-1.5 text-xs text-navy-soft">{ts(r.createdAt)}</td>
                <td className="font-medium">{r.action}</td>
                <td className="text-xs">{r.targetType} <span className="font-mono">{r.targetId}</span></td>
                <td className="text-xs" title={r.actorUid}>{names.get(r.actorUid) ?? <span className="font-mono">{r.actorUid.slice(0, 8)}…</span>}</td>
                <td><details className="text-xs"><summary className="cursor-pointer text-navy-soft">diff</summary><pre className="max-w-md overflow-x-auto whitespace-pre-wrap">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre></details></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-navy-soft">{rows.length ? 'Nothing matches' : 'Nothing yet'}</td></tr>}
          </tbody>
        </table>
        {rows.length >= pageSize && (
          <div className="mt-3 text-center">
            <button className="btn-ghost" onClick={() => setPageSize(pageSize + PAGE)}>Load {PAGE} more</button>
          </div>
        )}
      </div>
    </div>
  )
}
