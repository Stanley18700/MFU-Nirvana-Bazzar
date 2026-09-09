/**
 * Festival feedback via Google Forms. The organizers keep the form in their own Google account
 * (they edit questions there, without a deploy); this pulls its responses into Firestore so the
 * admin dashboard shows and exports them next to everything else.
 *
 * Read-only, and no OAuth: the function's own service account is added to the form as a
 * collaborator (HANDOVER.md §5), and asks the metadata server for a Forms-scoped token. Locally
 * there is no metadata server, so point GOOGLE_APPLICATION_CREDENTIALS at an impersonated-ADC
 * file for that account (SETUP.md §4a); the same GoogleAuth call handles both.
 *
 *   FEEDBACK_FORM_ID in functions/.env selects the form. Blank = feature off.
 */
import { onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineString } from 'firebase-functions/params'
import { GoogleAuth } from 'google-auth-library'
import { audit, db, FieldValue, requireRole, Timestamp } from './lib'
import { FeedbackFormDoc, FeedbackQuestion, FeedbackResponseDoc } from './shared/model'

export const FEEDBACK_FORM_ID = defineString('FEEDBACK_FORM_ID', { default: '' })

const SCOPES = [
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
]
/** Forms API pages are capped well under Firestore's 500 writes per batch. */
const PAGE = 400

/* eslint-disable @typescript-eslint/no-explicit-any */
async function forms(path: string): Promise<any> {
  const token = await new GoogleAuth({ scopes: SCOPES }).getAccessToken()
  const r = await fetch(`https://forms.googleapis.com/v1/forms/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`Forms API ${r.status} on ${path.split('?')[0]}: ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

/** Idempotent: a response is keyed by the Forms responseId, so re-pulling overlaps is harmless. */
export async function pullFeedback(formId = FEEDBACK_FORM_ID.value()): Promise<{ formId: string; fetched: number; total: number }> {
  if (!formId) return { formId: '', fetched: 0, total: 0 }
  const metaRef = db.doc(`feedbackForms/${formId}`)
  const prev = (await metaRef.get()).data() as FeedbackFormDoc | undefined

  const form = await forms(formId)
  const questions: FeedbackQuestion[] = (form.items ?? []).flatMap((it: any) => {
    const q = it.questionItem?.question
    return q?.questionId ? [{ id: q.questionId as string, title: String(it.title ?? ''), entry: parseInt(q.questionId, 16) }] : []
  })
  const passportQ = questions.find((q) => /passport/i.test(q.title))

  // Incremental: the API filters on a response's last-submitted time. Overlap the previous run
  // by a minute so a response that landed while it ran is not skipped for good.
  const since = prev?.lastSyncAt ? new Date((prev.lastSyncAt as Timestamp).toMillis() - 60_000).toISOString() : null
  let fetched = 0
  let pageToken: string | undefined
  do {
    const qs = new URLSearchParams({ pageSize: String(PAGE) })
    if (since) qs.set('filter', `timestamp >= ${since}`)
    if (pageToken) qs.set('pageToken', pageToken)
    const page = await forms(`${formId}/responses?${qs}`)
    const batch = db.batch()
    for (const r of page.responses ?? []) {
      const answers: FeedbackResponseDoc['answers'] = {}
      for (const [qid, a] of Object.entries<any>(r.answers ?? {})) {
        const vals: string[] = (a.textAnswers?.answers ?? []).map((x: any) => String(x.value ?? ''))
        answers[qid] = vals.length === 1 ? vals[0] : vals
      }
      const passportNo = passportQ ? String(answers[passportQ.id] ?? '').trim().toUpperCase() : ''
      const doc: FeedbackResponseDoc = {
        formId,
        submittedAt: Timestamp.fromDate(new Date(r.lastSubmittedTime ?? r.createTime)),
        passportNo: passportNo || null,
        answers,
        syncedAt: FieldValue.serverTimestamp(),
      }
      batch.set(db.doc(`feedbackResponses/${r.responseId}`), doc)
      fetched++
    }
    await batch.commit()
    pageToken = page.nextPageToken
  } while (pageToken)

  const total = (await db.collection('feedbackResponses').where('formId', '==', formId).count().get()).data().count
  const meta: FeedbackFormDoc = {
    formId,
    title: String(form.info?.title ?? 'Feedback'),
    responderUri: String(form.responderUri ?? ''),
    questions,
    passportEntry: passportQ?.entry ?? null,
    responseCount: total,
    lastSyncAt: FieldValue.serverTimestamp(),
  }
  await metaRef.set(meta)
  return { formId, fetched, total }
}

// ponytail: responses are never purged with the event (purgeEventData); add when a second event needs a clean slate.
export const syncFeedback = onSchedule({ schedule: 'every 10 minutes', timeZone: 'Asia/Bangkok' }, async () => {
  await pullFeedback()
})

/** The dashboard's "Sync now" — and the only way to run the pull in the emulator, which has no scheduler. */
export const syncFeedbackNow = onCall(async (req) => {
  const { uid } = requireRole(req, 'admin')
  const r = await pullFeedback()
  await audit(uid, 'syncFeedback', 'feedbackForm', r.formId || '-', null, r)
  return r
})
