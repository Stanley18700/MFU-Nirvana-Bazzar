import { useState } from 'react'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection } from '../../lib/data'
import { api, errorMessage } from '../../lib/api'
import { CsvButton, Notice, fmt } from '../../components/ui'
import { ts } from '../../lib/eventText'
import type { FeedbackFormDoc, FeedbackResponseDoc } from '../../../shared/model'

const cell = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('; ') : v ?? '')

/** Festival feedback, pulled from the organizers' Google Form every 10 minutes (functions/src/feedback.ts). */
export default function Feedback() {
  const form = useCollection<FeedbackFormDoc>(query(collection(db, 'feedbackForms'), limit(1)), [], 'the feedback form').data[0]
  const rows = useCollection<FeedbackResponseDoc>(query(collection(db, 'feedbackResponses'), orderBy('submittedAt', 'desc'), limit(1000)), [], 'the feedback responses').data
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const sync = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await api.syncFeedbackNow({})
      setMsg(r.formId ? `Fetched ${fmt(r.fetched)} response${r.fetched === 1 ? '' : 's'}; ${fmt(r.total)} in total.` : 'No form is configured. Set FEEDBACK_FORM_ID in functions/.env and redeploy.')
    } catch (e) { setMsg(errorMessage(e)) } finally { setBusy(false) }
  }

  const questions = form?.questions ?? []
  const csvRows = rows.map((r) => ({
    submitted: ts(r.submittedAt), passport: r.passportNo ?? '',
    ...Object.fromEntries(questions.map((q) => [q.title, cell(r.answers[q.id])])),
  }))

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Feedback</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {form
              ? <>{fmt(form.responseCount)} response{form.responseCount === 1 ? '' : 's'} to <a className="underline" href={form.responderUri} target="_blank" rel="noreferrer">{form.title}</a>. Last synced {ts(form.lastSyncAt)}; runs every 10 minutes.</>
              : 'No Google Form is connected yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</button>
          <CsvButton rows={csvRows} name="feedback" label="CSV (contains passport numbers)" />
        </div>
      </header>
      {msg && <div className="mt-3"><Notice>{msg}</Notice></div>}
      {!form && (
        <div className="mt-3">
          <Notice>
            Create the form in Google Forms, share it with the functions' service account as an <b>editor</b>, put its id in <code>FEEDBACK_FORM_ID</code> (functions/.env) and deploy. SETUP.md §4a has the steps. Then press <b>Sync now</b>.
          </Notice>
        </div>
      )}
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-soft">
              <th className="py-1">Submitted</th><th>Passport</th>
              {questions.map((q) => <th key={q.id}>{q.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t rule align-top">
                <td className="whitespace-nowrap py-1.5 text-xs text-ink-soft">{ts(r.submittedAt)}</td>
                <td className="font-mono text-xs">{r.passportNo ?? '—'}</td>
                {questions.map((q) => <td key={q.id} className="max-w-xs whitespace-pre-wrap">{cell(r.answers[q.id])}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={2 + questions.length} className="py-6 text-center text-sm text-ink-soft">No responses yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
