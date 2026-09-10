import { useMemo, useState } from 'react'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection } from '../../lib/data'
import { CsvButton, fmt } from '../../components/ui'
import { Select } from '../../components/Select'
import { ts } from '../../lib/eventText'
import { useLocale } from '../../lib/locale'
import type { UserDoc } from '../../../shared/model'

type Row = { actorUid: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; createdAt: unknown }
const PAGE = 200

/** §6.2 — every admin mutation, with actor and timestamp. */
export default function Audit() {
  const { t } = useLocale()
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
      <header>
        <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('audit.lead', {
          shown: filtered.length === rows.length ? fmt(rows.length) : t('audit.ofTotal', { shown: fmt(filtered.length), total: fmt(rows.length) }),
        })}</p>
      </header>

      {/*
        * The filters get their own row. They used to sit in the header opposite the title, where
        * `.field` — which is `w-full` and unlayered, so it beats a `w-auto` utility — stretched the
        * action picker across the page and shoved the whole group onto a line of its own above the
        * heading. Width now belongs to the wrapper, which is not a `.field`.
        */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select className="w-52" ariaLabel={t('audit.filterAction')} value={action} onChange={setAction}
          options={[{ value: '', label: t('audit.allActions') }, ...actions.map((a) => ({ value: a, label: a }))]} />
        <input className="field w-56" placeholder={t('audit.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('audit.searchLabel')} />
        <CsvButton className="ml-auto" rows={csvRows} name="audit-log" label={t('audit.csv')}
          confirm={t('audit.csvConfirm')} />
      </div>

      <div className="card mt-4 overflow-x-auto">
        {/* A minimum width rather than a squeeze: five columns of timestamps, ids and JSON do not
            fit a phone, and the card already scrolls sideways. Crushing them fits nothing. */}
        <table className="w-full min-w-[54rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="stamp-text text-left text-[10px] text-ink-soft">
              <th className="px-3 pb-2 font-medium">{t('audit.when')}</th>
              <th className="px-3 pb-2 font-medium">{t('audit.action')}</th>
              <th className="px-3 pb-2 font-medium">{t('audit.target')}</th>
              <th className="px-3 pb-2 font-medium">{t('audit.actor')}</th>
              <th className="px-3 pb-2 text-right font-medium">{t('audit.change')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="align-top transition-colors hover:bg-ink/4">
                <td className="whitespace-nowrap border-t rule px-3 py-3 text-xs tabular-nums text-ink-soft">{ts(r.createdAt)}</td>
                <td className="border-t rule px-3 py-3 font-medium">{r.action}</td>
                <td className="border-t rule px-3 py-3">
                  <div className="text-xs text-ink-soft">{r.targetType}</div>
                  <div className="font-mono text-xs break-all">{r.targetId}</div>
                </td>
                <td className="border-t rule px-3 py-3 text-xs">
                  {names.get(r.actorUid)
                    ?? <span className="font-mono text-ink-soft" title={r.actorUid}>{r.actorUid.slice(0, 8)}…</span>}
                </td>
                <td className="border-t rule px-3 py-3 text-right">
                  <details className="reveal-host text-xs">
                    <summary className="btn-quiet btn-sm inline-flex list-none">{t('audit.diff')}</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-ink/4 p-2 text-left">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre>
                  </details>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="border-t rule py-8 text-center text-ink-soft">{t(rows.length ? 'audit.noMatch' : 'audit.none')}</td></tr>}
          </tbody>
        </table>
        {rows.length >= pageSize && (
          <div className="mt-3 text-center">
            <button className="btn-ghost" onClick={() => setPageSize(pageSize + PAGE)}>{t('audit.loadMore', { count: PAGE })}</button>
          </div>
        )}
      </div>
    </div>
  )
}
