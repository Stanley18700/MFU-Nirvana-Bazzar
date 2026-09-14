/**
 * End-to-end smoke test of the FESTIVAL feedback survey against the local emulators.
 *
 * `e2e-survey.mjs` covers the booth survey and therefore most of the shared machinery. This
 * covers the four things that are true only of the festival survey, none of which a reading of
 * the code can settle:
 *
 *   1. It is reachable by stamp count, not by having visited a booth — a visitor with no stamp
 *      is refused, a visitor with one is offered it.
 *   2. Its reserved id keeps it out of every organizer's reach. `surveyResponses` may be read by
 *      the organizer of the booth a response belongs to; no organizer's `boothId` claim can be
 *      `__festival__`, so that rule must admit nobody here. This is the whole security argument
 *      for the reserved id, and it lives in a rules file, not in TypeScript.
 *   3. The standard question set is accepted by the server exactly as `shared/model.ts` ships it.
 *   4. Answering still cannot touch the passport, and still carries no identity.
 *
 *   Terminal 1:  npm run emulators
 *   Terminal 2:  npm run e2e:festival
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'

/*
 * The constants come from the compiled functions build rather than `../shared/model.ts`, so
 * this test asserts against the very bytes the deployed server uses — and so it does not
 * depend on Node's TypeScript stripping being on. `npm run e2e:festival` builds functions
 * first, which is also what refreshes functions/src/shared from shared/.
 */
const require = createRequire(import.meta.url)
const { EVENT_SURVEY_ID, FESTIVAL_SURVEY } = require('../functions/lib/shared/model.js')

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
    // The emulator answers a denied read with the rules trace ('false for list @ L71') rather
    // than Firestore's own 'Missing or insufficient permissions', so match the error CODE too —
    // 'permission-denied' is the canonical signal and does not vary by emulator build.
    const seen = `${e.code ?? ''} ${e.message ?? ''}`
    ok(name, !wanted || seen.toLowerCase().includes(wanted.toLowerCase()), `${e.code ?? '?'} — ${e.message ?? ''}`)
  }
}
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }

/** Points and stamps are written by `onScanCreate`, not by `scan`, so a baseline has to wait. */
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

/** A complete, valid answer for every question the standard set holds. */
function fullAnswers() {
  const a = {}
  for (const q of FESTIVAL_SURVEY.questions) {
    if (q.kind === 'scale') a[q.id] = q.scaleMax ?? 5
    else if (q.kind === 'rating') a[q.id] = q.stars ?? 5
    else if (q.kind === 'choice' || q.kind === 'dropdown') a[q.id] = q.options[0]
    else if (q.kind === 'checkboxes') a[q.id] = [q.options[0]]
    else if (q.kind === 'date') a[q.id] = '2026-09-17'
    else a[q.id] = `answer for ${q.id}`
  }
  return a
}

async function main() {
  section('Setup')
  const adminUid = await signUpVerified('festivaladmin@example.com')
  await call('bootstrapAdmin')({ key: 'dev', displayName: 'Festival Admin' })
  await auth.currentUser.getIdToken(true)
  ok('admin ready', (await auth.currentUser.getIdTokenResult()).claims.role === 'admin', adminUid)

  const booths = (await getDocs(query(collection(db, 'booths'), orderBy('sortOrder')))).docs
  const b1 = booths[0].id
  ok('a seeded booth to stamp', !!b1, b1)

  section('The admin installs the standard question set')
  ok('the reserved id is not a booth', !(await getDoc(doc(db, 'booths', EVENT_SURVEY_ID))).exists(), EVENT_SURVEY_ID)

  await call('saveSurvey')({
    boothId: EVENT_SURVEY_ID,
    title: FESTIVAL_SURVEY.title,
    description: FESTIVAL_SURVEY.description,
    questions: FESTIVAL_SURVEY.questions,
    active: false,
  })
  const saved = (await getDoc(doc(db, 'surveys', EVENT_SURVEY_ID))).data()
  ok('the server accepted the shipped question set', !!saved,
    `${saved?.questions?.length} of ${FESTIVAL_SURVEY.questions.length} questions`)
  ok('every question survived the server\'s cleaning',
    saved?.questions?.length === FESTIVAL_SURVEY.questions.length)
  ok('ids are unchanged',
    JSON.stringify(saved?.questions?.map((q) => q.id)) === JSON.stringify(FESTIVAL_SURVEY.questions.map((q) => q.id)))
  ok('installing does not publish', saved?.active === false)

  section('A visitor with no stamp cannot answer')
  await signOut(auth)
  const visitorUid = await signUpVerified('festivalvisitor@example.com')
  await call('join')({ displayName: 'Festival Visitor', visitorType: 'student', institution: 'MFU', countryCode: 'TH', consent: true })
  await auth.currentUser.getIdToken(true)

  ok('an unpublished survey is offered to nobody',
    (await call('surveyForBooth')({ boothId: EVENT_SURVEY_ID })).status === 'none')

  // Publish, as the admin, before testing the stamp gate — otherwise 'not collecting answers'
  // would mask it and the gate would go untested.
  await signOut(auth)
  await signInWithEmailAndPassword(auth, 'festivaladmin@example.com', 'passw0rd!')
  await auth.currentUser.getIdToken(true)
  await call('setSurveyActive')({ boothId: EVENT_SURVEY_ID, active: true })
  ok('published', (await getDoc(doc(db, 'surveys', EVENT_SURVEY_ID))).data()?.active === true)

  await signOut(auth)
  await signInWithEmailAndPassword(auth, 'festivalvisitor@example.com', 'passw0rd!')
  await auth.currentUser.getIdToken(true)
  await throws('a visitor with no stamp is refused',
    () => call('submitSurveyResponse')({ boothId: EVENT_SURVEY_ID, answers: fullAnswers() }), 'stamp first')

  section('One stamp is the whole entry requirement')
  const secret = await secretOf(b1)
  const period = await livePeriod()
  const scan = await call('scan')({ payload: boothToken(secret, b1, Math.floor(Date.now() / 1000 / period)) })
  ok('stamp collected', scan.status === 'success', JSON.stringify(scan))
  if (scan.status !== 'success') throw new Error(`cannot continue without a stamp: ${JSON.stringify(scan)}`)

  const before = await settled(
    async () => (await getDoc(doc(db, 'users', visitorUid))).data(),
    (u) => u?.points === scan.points && u?.stampCount === scan.stampCount,
  )
  ok('the scan\'s own points have landed before we start', before.points === scan.points, `${before.points} of ${scan.points}`)
  const scanBefore = (await getDoc(doc(db, 'scans', `${visitorUid}_${b1}`))).data()

  const offer = await call('surveyForBooth')({ boothId: EVENT_SURVEY_ID })
  ok('now offered', offer.status === 'ok', offer.status)
  ok('with the whole question set', offer.questions?.length === FESTIVAL_SURVEY.questions.length)

  await throws('a required question cannot be skipped',
    () => call('submitSurveyResponse')({ boothId: EVENT_SURVEY_ID, answers: {} }), 'required')

  // Sent at once rather than in turn: the "already answered" read is a courtesy, and `create`
  // on the marker is the actual guard. A response carries no identity, so a duplicate could
  // never be cleaned up afterwards — exactly one must be stored.
  const burst = await Promise.allSettled(Array.from({ length: 6 }, () =>
    call('submitSurveyResponse')({ boothId: EVENT_SURVEY_ID, answers: fullAnswers() })))
  const accepted = burst.filter((r) => r.status === 'fulfilled')
  ok('exactly one of six simultaneous submissions is accepted', accepted.length === 1,
    `${accepted.length} accepted`)
  ok('marked as answered', (await call('surveyForBooth')({ boothId: EVENT_SURVEY_ID })).status === 'done')
  ok('the visitor can read their own marker',
    (await getDoc(doc(db, 'surveyTaken', `${visitorUid}_${EVENT_SURVEY_ID}`))).exists())

  section('The passport is untouched')
  await new Promise((r) => setTimeout(r, 600))
  const after = (await getDoc(doc(db, 'users', visitorUid))).data()
  ok('points unchanged', after.points === before.points, `${before.points} -> ${after.points}`)
  ok('stamp count unchanged', after.stampCount === before.stampCount, `${before.stampCount} -> ${after.stampCount}`)
  ok('the stamp document is unchanged',
    JSON.stringify((await getDoc(doc(db, 'scans', `${visitorUid}_${b1}`))).data()) === JSON.stringify(scanBefore))

  section('No organizer can reach festival answers')
  await signOut(auth)
  const orgUid = await signUpVerified('festivalorganizer@example.com')
  await setClaims(orgUid, { role: 'organizer', boothId: b1 })
  await auth.currentUser.getIdToken(true)
  // The rule lets an organizer read responses whose boothId matches their claim. No claim can
  // be the reserved id, so this query must be refused outright rather than return nothing.
  await throws('an organizer querying festival responses is refused',
    () => getDocs(query(collection(db, 'surveyResponses'), where('boothId', '==', EVENT_SURVEY_ID))),
    'permission')
  await throws('an organizer cannot read the festival survey\'s answers via their own booth filter',
    () => getDocs(query(collection(db, 'surveyResponses'))), 'permission')

  section('The admin can, and the answers name nobody')
  await signOut(auth)
  await signInWithEmailAndPassword(auth, 'festivaladmin@example.com', 'passw0rd!')
  await auth.currentUser.getIdToken(true)
  const rows = (await getDocs(query(collection(db, 'surveyResponses'), where('boothId', '==', EVENT_SURVEY_ID)))).docs
  ok('exactly one response stored', rows.length === 1, `${rows.length} rows`)
  const row = rows[0]
  const blob = JSON.stringify(row.data())
  ok('no visitor uid in any field', !blob.includes(visitorUid))
  ok('no visitor uid in the document id', !row.id.includes(visitorUid), row.id)
  ok('it is tagged as the festival survey', row.data().boothId === EVENT_SURVEY_ID)
  ok('every question was answered',
    Object.keys(row.data().answers ?? {}).length === FESTIVAL_SURVEY.questions.length,
    `${Object.keys(row.data().answers ?? {}).length} answers`)
  ok('the response count is 1',
    (await getDoc(doc(db, 'surveys', EVENT_SURVEY_ID))).data()?.responseCount === 1)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
