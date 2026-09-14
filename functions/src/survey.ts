/**
 * Booth surveys — the short questionnaire a booth offers a visitor right after they collect
 * its stamp.
 *
 * Two rules shape everything here:
 *
 * 1. **Answering never affects the passport.** The stamp and the points are already awarded by
 *    `scan` before a visitor ever sees a survey, and nothing in this file writes to `users`,
 *    `scans` or the counters. A booth with a broken or endless form cannot cost anyone points.
 *
 * 2. **A response carries no identity.** `surveyResponses` is readable by the booth's organizer,
 *    so the visitor's uid appears neither in a field nor in the document id (§10 — sensitive
 *    answers are never shown per person). The "already answered" marker lives separately in
 *    `surveyTaken/{visitorId}_{boothId}`, which only that visitor and an admin can read.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db, FieldValue, requireRole, requireAuth, str, num, audit, getActiveEvent,
} from './lib'
import {
  EVENT_SURVEY_ID, OPTION_LIMIT, QUESTION_KINDS, QUESTION_LIMIT, QuestionKind, SurveyAnswer, SurveyDoc,
  SurveyQuestion, SurveyResponseDoc, UserDoc, answerIsEmpty, hasOptions, surveyProblems,
} from './shared/model'

const KINDS = QUESTION_KINDS.map((k) => k.kind)

/**
 * An organizer may only ever touch their own booth; an admin names the booth explicitly. The
 * same shape as `boothSession` in organizer.ts, so there is one story about booth ownership.
 */
function boothFor(req: Parameters<typeof requireAuth>[0], field = 'boothId'): { boothId: string; actor: string } {
  const { uid, role, boothId: claim } = requireRole(req, 'organizer', 'admin')
  const boothId = role === 'admin' ? str((req.data as Record<string, unknown>)?.[field], field) : claim
  if (!boothId) throw new HttpsError('failed-precondition', 'No booth assigned to this account')
  return { boothId, actor: uid }
}

/** Trusts nothing from the builder: every field is re-read and re-checked from scratch. */
function cleanQuestions(raw: unknown): SurveyQuestion[] {
  if (!Array.isArray(raw)) throw new HttpsError('invalid-argument', 'questions[] required')
  if (raw.length > QUESTION_LIMIT) throw new HttpsError('invalid-argument', `At most ${QUESTION_LIMIT} questions`)
  const seen = new Set<string>()
  return raw.map((r: Record<string, unknown>, i: number) => {
    const kind = str(r.kind, `questions[${i}].kind`) as QuestionKind
    if (!KINDS.includes(kind)) throw new HttpsError('invalid-argument', `Unknown question type: ${kind}`)
    // Ids are the keys answers are stored under, so a duplicate would silently overwrite.
    const id = str(r.id, `questions[${i}].id`, { max: 40 })
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError('invalid-argument', `Bad question id: ${id}`)
    if (seen.has(id)) throw new HttpsError('invalid-argument', `Two questions share the id ${id}`)
    seen.add(id)

    const q: SurveyQuestion = {
      id,
      kind,
      title: str(r.title, `questions[${i}].title`, { max: 300 }),
      required: r.required === true,
    }
    const help = str(r.help, `questions[${i}].help`, { required: false, max: 300 })
    if (help) q.help = help
    if (typeof r.imageUrl === 'string' && r.imageUrl) q.imageUrl = str(r.imageUrl, 'imageUrl', { max: 500 })
    else q.imageUrl = null

    if (hasOptions(kind)) {
      const opts = (Array.isArray(r.options) ? r.options : [])
        .map((o) => (typeof o === 'string' ? o.trim() : ''))
        .filter((o) => o.length > 0)
        .map((o) => str(o, `questions[${i}].options`, { max: 200 }))
      if (opts.length < 2) throw new HttpsError('invalid-argument', `Question ${i + 1} needs at least two options`)
      if (opts.length > OPTION_LIMIT) throw new HttpsError('invalid-argument', `Question ${i + 1} has too many options`)
      if (new Set(opts).size !== opts.length) throw new HttpsError('invalid-argument', `Question ${i + 1} has duplicate options`)
      q.options = opts
    }
    if (kind === 'scale') {
      q.scaleMin = typeof r.scaleMin === 'number' ? num(r.scaleMin, 'scaleMin', { min: 0, max: 10 }) : 1
      q.scaleMax = typeof r.scaleMax === 'number' ? num(r.scaleMax, 'scaleMax', { min: 1, max: 11 }) : 5
      if (q.scaleMax <= q.scaleMin) throw new HttpsError('invalid-argument', `Question ${i + 1}: bad scale range`)
      const lo = str(r.scaleMinLabel, 'scaleMinLabel', { required: false, max: 40 })
      const hi = str(r.scaleMaxLabel, 'scaleMaxLabel', { required: false, max: 40 })
      if (lo) q.scaleMinLabel = lo
      if (hi) q.scaleMaxLabel = hi
    }
    if (kind === 'rating') {
      q.stars = typeof r.stars === 'number' ? num(r.stars, 'stars', { min: 3, max: 10 }) : 5
    }
    return q
  })
}

export const saveSurvey = onCall(async (req) => {
  const { boothId, actor } = boothFor(req)
  const ev = await getActiveEvent()
  const title = str(req.data?.title, 'title', { max: 200 })
  const description = str(req.data?.description, 'description', { required: false, max: 1000 })
  const questions = cleanQuestions(req.data?.questions)

  // The same check the builder runs, so the two can never disagree about what is publishable.
  const problems = surveyProblems(title, questions)
  if (problems.length) throw new HttpsError('invalid-argument', problems[0])

  const ref = db.doc(`surveys/${boothId}`)
  const before = (await ref.get()).data() as SurveyDoc | undefined
  const doc: Partial<SurveyDoc> = {
    boothId,
    eventId: ev.id,
    title,
    description,
    headerImageUrl: typeof req.data?.headerImageUrl === 'string' && req.data.headerImageUrl
      ? str(req.data.headerImageUrl, 'headerImageUrl', { max: 500 })
      : null,
    questions,
    active: req.data?.active === true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor,
  }
  // responseCount belongs to the responses, not to an edit — never reset it on save.
  if (!before) doc.responseCount = 0

  /**
   * Answers are stored by question id, and the results screen labels them by joining against
   * whatever questions the survey currently holds. So reusing an id with new wording silently
   * relabels every answer already given: fifty people who rated the food are now reported as
   * having rated the staff, and nothing anywhere says so.
   *
   * Editing is not forbidden — an organizer fixing a typo mid-event is reasonable — but the
   * question set that answers were actually given against is kept, and every response records
   * which version it belongs to. That is enough to reconstruct an honest report, and enough
   * for the results screen to say when a table mixes two of them.
   */
  const prevVersion = before?.version ?? 1
  const changed = !before || JSON.stringify(before.questions ?? []) !== JSON.stringify(questions)
  doc.version = changed ? prevVersion + (before ? 1 : 0) : prevVersion
  if (before && changed) {
    await db.doc(`surveys/${boothId}/versions/${prevVersion}`).set({
      version: prevVersion,
      title: before.title ?? null,
      questions: before.questions ?? [],
      responseCountAtRetire: before.responseCount ?? 0,
      retiredAt: FieldValue.serverTimestamp(),
      retiredBy: actor,
    })
  }

  await ref.set(doc, { merge: true })
  await audit(actor, 'saveSurvey', 'survey', boothId,
    before ? { active: before.active, questions: before.questions.length, version: prevVersion } : null,
    { active: doc.active, questions: questions.length, version: doc.version })
  return { ok: true }
})

/**
 * Publish / unpublish on its own, so an organizer can take a survey down mid-event without
 * opening the builder and risking an accidental edit.
 */
export const setSurveyActive = onCall(async (req) => {
  const { boothId, actor } = boothFor(req)
  const active = req.data?.active === true
  const ref = db.doc(`surveys/${boothId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'This booth has no survey yet')
  if (active) {
    const s = snap.data() as SurveyDoc
    const problems = surveyProblems(s.title, s.questions ?? [])
    if (problems.length) throw new HttpsError('failed-precondition', problems[0])
  }
  await ref.set({ active }, { merge: true })
  await audit(actor, 'setSurveyActive', 'survey', boothId, null, { active })
  return { ok: true, active }
})

/**
 * Throwing away answers is worse than keeping them, so this only clears the questions and
 * unpublishes; the responses stay for the post-event report.
 */
export const deleteSurvey = onCall(async (req) => {
  const { boothId, actor } = boothFor(req)
  const ref = db.doc(`surveys/${boothId}`)
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'This booth has no survey yet')
  await ref.set({ questions: [], active: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor }, { merge: true })
  await audit(actor, 'deleteSurvey', 'survey', boothId, null, null)
  return { ok: true }
})

/** What a visitor is allowed to know before answering. Only ever an active survey. */
export const surveyForBooth = onCall(async (req) => {
  const uid = requireAuth(req)
  const boothId = str(req.data?.boothId, 'boothId', { max: 40 })
  const snap = await db.doc(`surveys/${boothId}`).get()
  const s = snap.data() as SurveyDoc | undefined
  if (!s || !s.active || !s.questions?.length) return { status: 'none' as const }
  const taken = await db.doc(`surveyTaken/${uid}_${boothId}`).get()
  if (taken.exists) return { status: 'done' as const }
  return {
    status: 'ok' as const,
    title: s.title,
    description: s.description ?? '',
    headerImageUrl: s.headerImageUrl ?? null,
    questions: s.questions,
  }
})

export const submitSurveyResponse = onCall(async (req) => {
  const uid = requireAuth(req)
  const boothId = str(req.data?.boothId, 'boothId', { max: 40 })
  const ev = await getActiveEvent()

  const snap = await db.doc(`surveys/${boothId}`).get()
  const survey = snap.data() as SurveyDoc | undefined
  if (!survey || !survey.active || !survey.questions?.length) {
    throw new HttpsError('failed-precondition', 'This booth is not collecting answers')
  }

  /**
   * Only someone who actually visited the booth may answer it. `scans/{visitorId}_{boothId}` is
   * the stamp itself, so this is the same fact the passport already shows — and it keeps the
   * survey from becoming a way to spam a booth's results from a phone across the hall.
   *
   * The festival survey has no booth to have visited, so the equivalent bar is having been to
   * the festival at all: one stamp. It is the same idea — an answer should come from somebody
   * who was there — and it is the strongest claim the data can actually support.
   */
  if (boothId === EVENT_SURVEY_ID) {
    const me = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined
    if (!me || (me.stampCount ?? 0) < 1) {
      throw new HttpsError('permission-denied', 'Collect a stamp first')
    }
  } else if (!(await db.doc(`scans/${uid}_${boothId}`).get()).exists) {
    throw new HttpsError('permission-denied', 'Collect this booth\'s stamp first')
  }

  const takenRef = db.doc(`surveyTaken/${uid}_${boothId}`)
  if ((await takenRef.get()).exists) throw new HttpsError('already-exists', 'You have already answered this one')

  const raw = (req.data?.answers ?? {}) as Record<string, unknown>
  const answers: Record<string, SurveyAnswer> = {}
  for (const q of survey.questions) {
    const a = raw[q.id]
    let value: SurveyAnswer | undefined

    if (q.kind === 'checkboxes') {
      const picked = (Array.isArray(a) ? a : [])
        .map((x) => (typeof x === 'string' ? x : ''))
        .filter((x) => (q.options ?? []).includes(x))
      if (picked.length) value = [...new Set(picked)]
    } else if (q.kind === 'choice' || q.kind === 'dropdown') {
      // Anything not on the list is dropped rather than stored: the results are grouped by
      // option, and one invented value would show up as its own bar.
      if (typeof a === 'string' && (q.options ?? []).includes(a)) value = a
    } else if (q.kind === 'scale') {
      const lo = q.scaleMin ?? 1, hi = q.scaleMax ?? 5
      if (typeof a === 'number' && Number.isInteger(a) && a >= lo && a <= hi) value = a
    } else if (q.kind === 'rating') {
      const stars = q.stars ?? 5
      if (typeof a === 'number' && Number.isInteger(a) && a >= 1 && a <= stars) value = a
    } else if (q.kind === 'date') {
      if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a)) value = a
    } else if (typeof a === 'string') {
      const text = a.trim().slice(0, q.kind === 'paragraph' ? 2000 : 300)
      if (text) value = text
    }

    if (value === undefined || answerIsEmpty(value)) {
      if (q.required) throw new HttpsError('invalid-argument', `"${q.title}" is required`)
      continue
    }
    answers[q.id] = value
  }

  const doc: SurveyResponseDoc = {
    // Which question set these answers were given against, so an edit cannot relabel them.
    boothId, eventId: ev.id, surveyVersion: survey.version ?? 1, answers, submittedAt: FieldValue.serverTimestamp(),
  }
  /**
   * The "already answered" read above is a courtesy, not the guard: a batch is atomic but
   * takes no read lock, so two submissions sent at once both find `surveyTaken` absent and
   * both commit. `create` is the guard — it fails if the marker is already there, so the
   * loser's whole batch is rejected and only one response is stored.
   *
   * This has to be right at the write rather than cleaned up afterwards: the response carries
   * an auto-id and nothing linking it to its author, which is deliberate (§10) and means a
   * duplicate cannot be told from a second visitor's answers once it is in.
   */
  const batch = db.batch()
  // Auto-id, so nothing about the document's address hints at who wrote it.
  batch.set(db.collection('surveyResponses').doc(), doc)
  batch.create(takenRef, { boothId, takenAt: FieldValue.serverTimestamp() })
  batch.set(db.doc(`surveys/${boothId}`), { responseCount: FieldValue.increment(1) }, { merge: true })
  try {
    await batch.commit()
  } catch (e) {
    if ((e as { code?: number }).code === 6) throw new HttpsError('already-exists', 'You have already answered this one')
    throw e
  }
  return { ok: true }
})
