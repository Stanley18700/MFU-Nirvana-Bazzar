import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection } from '../../lib/data'

type Row = { actorUid: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; createdAt: unknown }
const ts = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? new Date((v as { toMillis(): number }).toMillis()).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '–')

/** §6.2 — every admin mutation, with actor and timestamp. */
export default function Audit() {
  const rows = useCollection<Row>(query(collection(db, 'auditLog'), orderBy('createdAt', 'desc'), limit(200)), []).data
  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Audit log</h1>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-navy-soft"><th className="py-1">When</th><th>Action</th><th>Target</th><th>Actor</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t rule align-top">
                <td className="whitespace-nowrap py-1.5 text-xs text-navy-soft">{ts(r.createdAt)}</td>
                <td className="font-medium">{r.action}</td>
                <td className="text-xs">{r.targetType} <span className="font-mono">{r.targetId}</span></td>
                <td className="font-mono text-xs">{r.actorUid.slice(0, 8)}…</td>
                <td><details className="text-xs"><summary className="cursor-pointer text-navy-soft">diff</summary><pre className="max-w-md overflow-x-auto whitespace-pre-wrap">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre></details></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-navy-soft">Nothing yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
