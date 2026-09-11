/**
 * End-to-end smoke test of the booth survey against the local emulators.
 *
 * The two properties that matter most are the ones a reading of the code cannot settle, so both
 * are asserted here against the real rules and the real callables:
 *
 *   1. Answering never touches the passport — points, stamps and the stamp document are
 *      identical before and after a submission.
 *   2. A response carries no identity — no visitor uid in any field, and none in the document
 *      id either, checked by reading the collection as the organizer who owns the booth.
 *
 *   npm run e2e:survey
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { createHmac } from 'node:crypto'

const app = initializeApp({ projectId: 'mfu-passport', apiKey: 'demo-key', authDomain: 'localhost' })
const auth = getAuth(app)
const db = getFirestore(app)
const fns = getFunctions(app, 'asia-southeast1')
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8080)
connectFunctionsEmulator(fns, '127.0.0.1', 5001)

const call = (n) => async (d = {}) => (await httpsCallable(fns, n)(d)).data
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`) }
}
const section = (s) => console.log(`\n=== ${s} ===`)
async function throws(name, fn, wanted) {
  try { await fn(); ok(name, false, 'no error thrown') } catch (e) {
    ok(name, !wanted || (e.message ?? '').toLowerCase().includes(wanted.toLowerCase()), e.message)
  }
}
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }

/**
 * Points and stamp counts are written by the `onScanCreate` trigger, not by `scan` itself, so a
 * read taken straight after a scan can still show the old totals. Wait for the passport to
 * settle before using it as a baseline — otherwise this test blames the survey for the scan's
 * own increment.
 */
async function settled(fn, want, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const v = await fn()
    if (want(v)) return v
    await new Promise((r) => setTimeout(r, 100))
  }
  return fn()
}

async function signUpVerified(email, password = 'passw0rd!') {
  await createUserWithEmailAndPassword(auth, email, password)
  const localId = auth.currentUser.uid
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/mfu-passport/accounts:update', {
    method: 'POST', headers: OWNER, body: JSON.stringify({ localId, emailVerified: true }),
  })
  await auth.currentUser.getIdToken(true)
  return localId
}
async function setClaims(uid, claims) {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/mfu-passport/accounts:update', {
    method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
  })
}

// Booth token, same scheme as shared/token.ts.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function boothToken(secretB64, boothId, counter) {
  const mac = createHmac('sha256', Buffer.from(secretB64, 'base64')).update(`${boothId}:${counter}`).digest()
  let bits = '', out = ''
  for (const b of mac) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < 6; i++) out += B32[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]
  return out
}
/** The QR counter is derived from the live event's period, never a hardcoded 20. */
async function livePeriod() {
  const r = await fetch('http://127.0.0.1:8080/v1/projects/mfu-passport/databases/(default)/documents/events', { headers: OWNER })
  const d = await r.json()
  const live = (d.documents ?? []).find((x) => x.fields?.status?.stringValue === 'live')
  return Number(live?.fields?.qrPeriodSeconds?.integerValue ?? 20)
}

async function secretOf(boothId) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/mfu-passport/databases/(default)/documents/boothSecrets/${boothId}`, { headers: OWNER })
  return (await r.json()).fields.secret.stringValue
}

const QUESTIONS = [
  { id: 'q_rate', kind: 'rating', title: 'Rate this booth', required: true, stars: 5 },
  { id: 'q_how', kind: 'choice', title: 'How did you hear about us?', required: false, options: ['Poster', 'A friend', 'Instagram'] },
  { id: 'q_langs', kind: 'checkboxes', title: 'Which languages do you speak?', required: false, options: ['Thai', 'English', 'Japanese'] },
  { id: 'q_scale', kind: 'scale', title: 'How likely are you to recommend it?', required: false, scaleMin: 1, scaleMax: 5, scaleMinLabel: 'Not at all', scaleMaxLabel: 'Very' },
  { id: 'q_note', kind: 'paragraph', title: 'Anything else?', required: false },
  { id: 'q_when', kind: 'date', title: 'When did you visit?', required: false },
]

async function main() {
  section('Setup')
  const adminUid = await signUpVerified('surveyadmin@example.com')
  await call('bootstrapAdmin')({ key: 'dev', displayName: 'Survey Admin' })
  await auth.currentUser.getIdToken(true)
  ok('admin ready', (await auth.currentUser.getIdTokenResult()).claims.role === 'admin', adminUid)

  const booths = (await getDocs(query(collection(db, 'booths'), orderBy('sortOrder')))).docs
  const b1 = booths[0].id, b2 = booths[1].id
  ok('two seeded booths', !!b1 && !!b2, `${b1}, ${b2}`)

  section('Only the booth’s own organizer may build its survey')
  await signOut(auth)
  const orgUid = await signUpVerified('organizer1@example.com')
  await setClaims(orgUid, { role: 'organizer', boothId: b1 })
  await auth.currentUser.getIdToken(true)

  await throws('a half-built survey cannot be published',
    () => call('saveSurvey')({ title: 'Feedback', questions: [], active: true }), 'at least one question')
  await throws('a question with one option is refused',
    () => call('saveSurvey')({ title: 'Feedback', active: true, questions: [{ id: 'a', kind: 'choice', title: 'Pick', options: ['only'] }] }),
    'at least two options')
  await throws('an unknown question type is refused',
    () => call('saveSurvey')({ title: 'F', active: true, questions: [{ id: 'a', kind: 'ranking', title: 'x' }] }), 'Unknown question type')
  await throws('two questions cannot share an id',
    () => call('saveSurvey')({ title: 'F', active: true, questions: [
      { id: 'same', kind: 'short', title: 'a' }, { id: 'same', kind: 'short', title: 'b' }] }), 'share the id')

  await call('saveSurvey')({ title: 'Tell us about your visit', description: '30 seconds.', questions: QUESTIONS, active: true })
  const s1 = (await getDoc(doc(db, 'surveys', b1))).data()
  ok('survey saved against the organizer’s own booth', s1?.boothId === b1)
  ok('it is live', s1?.active === true)
  ok('all six questions stored', s1?.questions?.length === 6)
  ok('response count starts at zero', s1?.responseCount === 0)
  // The organizer never names a booth; the claim decides. An attempt to name another one is ignored.
  await call('saveSurvey')({ boothId: b2, title: 'Tell us about your visit', questions: QUESTIONS, active: true })
  ok('an organizer cannot write another booth’s survey', !(await getDoc(doc(db, 'surveys', b2))).exists())

  section('A visitor answers')
  await signOut(auth)
  const visitorUid = await signUpVerified('visitor1@example.com')
  await call('join')({ displayName: 'Survey Visitor', visitorType: 'student', institution: 'MFU', countryCode: 'TH', consent: true })
  // join sets the `visitor` claim, and scan reads it off the token — refresh or the next call
  // comes back not_registered.
  await auth.currentUser.getIdToken(true)

  await throws('cannot answer a booth you have not visited',
    () => call('submitSurveyResponse')({ boothId: b1, answers: { q_rate: 5 } }), 'stamp first')

  // Collect the stamp the normal way, then record the passport exactly as it stands.
  const secret = await secretOf(b1)
  const period = await livePeriod()
  const counter = Math.floor(Date.now() / 1000 / period)
  const scan = await call('scan')({ payload: boothToken(secret, b1, counter) })
  ok('stamp collected', scan.status === 'success', JSON.stringify(scan))
  if (scan.status !== 'success') throw new Error(`cannot continue without a stamp: ${JSON.stringify(scan)}`)
  const before = await settled(
    async () => (await getDoc(doc(db, 'users', visitorUid))).data(),
    (u) => u?.points === scan.points && u?.stampCount === scan.stampCount,
  )
  ok('the scan\'s own points have landed before we start', before.points === scan.points, `${before.points} of ${scan.points}`)
  const scanBefore = (await getDoc(doc(db, 'scans', `${visitorUid}_${b1}`))).data()

  const offer = await call('surveyForBooth')({ boothId: b1 })
  ok('the survey is offered', offer.status === 'ok', offer.status)
  ok('offer carries the questions', offer.questions?.length === 6)
  ok('a booth with no survey offers nothing', (await call('surveyForBooth')({ boothId: b2 })).status === 'none')

  await throws('a required question cannot be skipped',
    () => call('submitSurveyResponse')({ boothId: b1, answers: { q_how: 'Poster' } }), 'required')

  // Submitted eight times at once, not once: the "already answered" read cannot be the guard,
  // because a batch takes no read lock and every one of these would find the marker absent.
  // A response carries no identity by design, so a duplicate could never be cleaned up after
  // the fact — exactly one must be stored. The assertions further down (one response for this
  // booth, responseCount of 1) are what hold the line; they now mean something.
  const burst = await Promise.allSettled(Array.from({ length: 8 }, () =>
    call('submitSurveyResponse')({ boothId: b1, answers: {
      q_rate: 4,
      q_how: 'Poster',
      q_langs: ['Thai', 'English', 'Thai'],
      q_scale: 5,
      q_note: '  Loved the origami.  ',
      q_when: '2026-09-17',
      q_ghost: 'not a question on this form',
    } })))
  const accepted = burst.filter((r) => r.status === 'fulfilled')
  ok('exactly one of eight simultaneous submissions is accepted', accepted.length === 1,
    `${accepted.length} accepted, ${burst.length - accepted.length} refused`)
  ok('the rest are refused as already answered',
    burst.filter((r) => r.status === 'rejected').every((r) => /already answered/i.test(r.reason?.message ?? '')),
    burst.filter((r) => r.status === 'rejected').map((r) => r.reason?.message).join(' | ').slice(0, 160))
  // A visitor cannot list surveyResponses, and should not be able to. That exactly one row
  // was stored is asserted below, where the organizer who owns the booth reads them.

  section('The passport is untouched')
  // Given a moment in which a stray trigger could have fired, then compared.
  await new Promise((r) => setTimeout(r, 600))
  const after = (await getDoc(doc(db, 'users', visitorUid))).data()
  ok('points unchanged by answering', after.points === before.points, `${before.points} -> ${after.points}`)
  ok('stamp count unchanged by answering', after.stampCount === before.stampCount, `${before.stampCount} -> ${after.stampCount}`)
  ok('the stamp document is unchanged', JSON.stringify((await getDoc(doc(db, 'scans', `${visitorUid}_${b1}`))).data()) === JSON.stringify(scanBefore))

  section('Answers are stored, cleaned, and cannot be repeated')
  ok('marked as answered', (await call('surveyForBooth')({ boothId: b1 })).status === 'done')
  await throws('the same visitor cannot answer twice',
    () => call('submitSurveyResponse')({ boothId: b1, answers: { q_rate: 1 } }), 'already answered')
  ok('the visitor can read their own marker', (await getDoc(doc(db, 'surveyTaken', `${visitorUid}_${b1}`))).exists())

  section('A response carries no identity')
  await signOut(auth)
  await signInWithEmailAndPassword(auth, 'organizer1@example.com', 'passw0rd!')
  await auth.currentUser.getIdToken(true)
  const mine = await getDocs(query(collection(db, 'surveyResponses'), where('boothId', '==', b1), orderBy('submittedAt', 'desc')))
  ok('the organizer can read their booth’s answers', mine.size === 1, `${mine.size} response(s)`)
  const r = mine.docs[0]
  const asText = JSON.stringify(r.data())
  ok('no visitor uid in any field', !asText.includes(visitorUid), asText.slice(0, 120))
  ok('no visitor uid in the document id', !r.id.includes(visitorUid), r.id)
  ok('fields are exactly boothId, eventId, answers, submittedAt',
    JSON.stringify(Object.keys(r.data()).sort()) === JSON.stringify(['answers', 'boothId', 'eventId', 'submittedAt']),
    Object.keys(r.data()).sort().join(','))

  const a = r.data().answers
  ok('rating kept', a.q_rate === 4)
  ok('choice kept', a.q_how === 'Poster')
  ok('checkboxes de-duplicated', JSON.stringify(a.q_langs) === JSON.stringify(['Thai', 'English']), JSON.stringify(a.q_langs))
  ok('scale kept', a.q_scale === 5)
  ok('free text trimmed', a.q_note === 'Loved the origami.', JSON.stringify(a.q_note))
  ok('date kept', a.q_when === '2026-09-17')
  ok('an answer to a question that does not exist is dropped', !('q_ghost' in a))
  ok('response count incremented', (await getDoc(doc(db, 'surveys', b1))).data().responseCount === 1)
  await throws('the organizer cannot read the answered-marker collection',
    () => getDoc(doc(db, 'surveyTaken', `${visitorUid}_${b1}`)))

  section('An organizer cannot read another booth’s answers')
  await signOut(auth)
  const org2 = await signUpVerified('organizer2@example.com')
  await setClaims(org2, { role: 'organizer', boothId: b2 })
  await auth.currentUser.getIdToken(true)
  await throws('the rules refuse a query for a booth that is not theirs',
    () => getDocs(query(collection(db, 'surveyResponses'), where('boothId', '==', b1), orderBy('submittedAt', 'desc'))))

  section('Taking it down keeps the answers')
  await signOut(auth)
  await signInWithEmailAndPassword(auth, 'organizer1@example.com', 'passw0rd!')
  await auth.currentUser.getIdToken(true)
  await call('setSurveyActive')({ active: false })
  ok('unpublished', (await getDoc(doc(db, 'surveys', b1))).data().active === false)
  await call('deleteSurvey')({})
  const cleared = (await getDoc(doc(db, 'surveys', b1))).data()
  ok('questions removed', (cleared.questions ?? []).length === 0)
  ok('the response survives', (await getDocs(query(collection(db, 'surveyResponses'), where('boothId', '==', b1)))).size === 1)
  ok('and so does the count', cleared.responseCount === 1)

  section('A visitor is not offered a survey that is down')
  await signOut(auth)
  await signInWithEmailAndPassword(auth, 'visitor1@example.com', 'passw0rd!')
  await auth.currentUser.getIdToken(true)
  ok('nothing offered once it is unpublished', (await call('surveyForBooth')({ boothId: b1 })).status === 'none')
  await throws('and nothing can be submitted to it',
    () => call('submitSurveyResponse')({ boothId: b1, answers: {} }), 'not collecting answers')
  await throws('a visitor cannot build a survey',
    () => call('saveSurvey')({ title: 'mine', questions: QUESTIONS, active: true }), 'organizer')

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
}

main().then(() => process.exit(fail === 0 ? 0 : 1)).catch((e) => { console.error(e); process.exit(1) })
