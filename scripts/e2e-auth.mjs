/**
 * The access model, asserted end to end against the real rules and the real callables.
 *
 * The rule the whole festival rests on: **a guest signs themselves up, and staff are invited.**
 * Anyone can create an account with Google or an email address and become a `visitor` — nothing
 * gates that. Nobody can become an `organizer` or an `admin` without either an invitation issued
 * by an admin, an admin promoting them, or the one-shot bootstrap key.
 *
 * So the escalation attempts below are the point of this file, not an afterthought: every path
 * that hands out a role is tried by someone not entitled to use it.
 *
 *   npm run e2e:auth
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
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
async function denied(name, fn, wanted) {
  try { await fn(); ok(name, false, 'IT WAS ALLOWED') } catch (e) {
    ok(name, !wanted || `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase().includes(wanted.toLowerCase()), e.message ?? e.code)
  }
}
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }
const idt = (b) => fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/mfu-passport/accounts:update', { method: 'POST', headers: OWNER, body: JSON.stringify(b) })

/** A brand-new account with a confirmed address — what /signup produces. */
async function signUp(email, { verify = true } = {}) {
  await createUserWithEmailAndPassword(auth, email, 'passw0rd!')
  const uid = auth.currentUser.uid
  if (verify) await idt({ localId: uid, emailVerified: true })
  await auth.currentUser.getIdToken(true)
  return uid
}
const signIn = async (email) => {
  await signInWithEmailAndPassword(auth, email, 'passw0rd!')
  await auth.currentUser.getIdToken(true)
}
const claims = async () => (await auth.currentUser.getIdTokenResult(true)).claims
/** join sets the visitor claim; the token has to be refreshed before anything reads it. */
const joinAs = async (name) => {
  const r = await call('join')({ displayName: name, visitorType: 'student', institution: 'MFU', school: 'ADT', countryCode: 'TH', consent: true })
  await auth.currentUser.getIdToken(true)
  return r
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const tok = (secret, booth, counter) => {
  const mac = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${booth}:${counter}`).digest()
  let bits = '', o = ''
  for (const b of mac) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < 6; i++) o += B32[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]
  return o
}
const secretOf = async (booth) => (await (await fetch(`http://127.0.0.1:8080/v1/projects/mfu-passport/databases/(default)/documents/boothSecrets/${booth}`, { headers: OWNER })).json()).fields.secret.stringValue
const clearRateLimits = async () => {
  const r = await fetch('http://127.0.0.1:8080/v1/projects/mfu-passport/databases/(default)/documents/rateLimits', { headers: OWNER })
  for (const d of (await r.json()).documents ?? []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: OWNER }).catch(() => {})
}

async function main() {
  section('A guest signs themselves up — nothing gates it')
  await clearRateLimits()
  const guestUid = await signUp('guest1@example.com')
  ok('an account can be created with no invitation', !!guestUid)
  ok('a fresh account carries no role at all', (await claims()).role === undefined, String((await claims()).role))
  await denied('and cannot scan before registering', async () => {
    const r = await call('scan')({ payload: 'ABC234' })
    if (r.status !== 'not_registered') throw new Error(`got ${r.status}`)
    throw new Error('not_registered')
  }, 'not_registered')

  const joined = await joinAs('Guest One')
  ok('join issues a passport', !!joined.passportNo, joined.passportNo)
  ok('and the role is visitor, never anything else', (await claims()).role === 'visitor')
  ok('with no booth attached', (await claims()).boothId === undefined)
  const guestDoc = (await getDoc(doc(db, 'users', guestUid))).data()
  ok('the stored role is visitor too', guestDoc.role === 'visitor')
  ok('the contact is the verified address, not something typed in', guestDoc.contact === 'guest1@example.com')

  section('An unverified address cannot register')
  await signOut(auth)
  await signUp('unverified@example.com', { verify: false })
  await denied('join refuses an unconfirmed email', () => joinAs('Nope'), 'Confirm your email')

  section('A guest cannot promote themselves')
  await signOut(auth); await signIn('guest1@example.com')
  await denied('cannot set their own role', () => call('setUserRole')({ uid: guestUid, role: 'admin' }), 'Requires role: admin')
  await denied('cannot create a user', () => call('createUser')({ displayName: 'X', contact: 'x@example.com', role: 'admin' }), 'Requires role: admin')
  await denied('cannot issue an invitation', () => call('inviteOrganizer')({ invites: [{ name: 'X', email: 'x@example.com', boothId: 'ED1' }] }), 'Requires role: admin')
  await denied('cannot accept an invitation that does not exist', () => call('acceptInvite')({ token: 'made-up' }), 'Invalid invitation')
  await denied('cannot bootstrap an admin without the key', () => call('bootstrapAdmin')({ key: 'wrong' }), 'Bad bootstrap key')
  await denied('cannot open a booth screen', () => call('boothSession')({}), 'Requires role')
  await denied('cannot build a survey', () => call('saveSurvey')({ title: 'x', questions: [{ id: 'a', kind: 'short', title: 'a' }], active: true }), 'Requires role')
  await denied('cannot read the audit log', () => getDocs(collection(db, 'auditLog')))
  await denied('cannot read the invitations', () => getDocs(collection(db, 'invites')))
  await denied('cannot read another visitor’s user document', () => getDoc(doc(db, 'users', 'someone-else')))
  await denied('cannot read a booth secret', () => getDoc(doc(db, 'boothSecrets', 'ED1')))

  section('The first admin comes from the bootstrap key, once')
  await signOut(auth)
  const adminUid = await signUp('admin1@example.com')
  await call('bootstrapAdmin')({ key: 'dev', displayName: 'The Admin' })
  await auth.currentUser.getIdToken(true)
  ok('the key promotes the caller', (await claims()).role === 'admin', adminUid)
  await signOut(auth)
  await signUp('admin2@example.com')
  await denied('and refuses once an admin exists', () => call('bootstrapAdmin')({ key: 'dev' }), 'already exists')
  ok('the second caller is left with no role', (await claims()).role === undefined)

  section('Staff arrive only by invitation')
  await signOut(auth); await signIn('admin1@example.com')
  const inv = await call('inviteOrganizer')({ invites: [{ name: 'Booth Staff', email: 'staff1@example.com', boothId: 'ED1', role: 'organizer' }] })
  const link = inv.results[0].link
  ok('an admin can invite an organizer', !!inv.results[0].inviteId)
  ok('and gets a link back when mail is off', !!link, link ? 'yes' : 'no link')
  const token = link.split('/invite/')[1]

  // The invitation is bound to the address it was sent to, not to whoever holds the link.
  await signOut(auth); await signIn('guest1@example.com')
  await denied('the link is useless to a different account', () => call('acceptInvite')({ token }), 'different address')
  ok('and that account is still just a visitor', (await claims()).role === 'visitor')

  await signOut(auth)
  await signUp('staff1@example.com')
  const acc = await call('acceptInvite')({ token })
  await auth.currentUser.getIdToken(true)
  ok('the invited address may accept', acc.role === 'organizer')
  ok('the claim carries the booth it was issued for', (await claims()).boothId === 'ED1')
  ok('and the organizer can open that booth', (await call('boothSession')({})).boothId === 'ED1')
  await denied('the same link cannot be used twice', () => call('acceptInvite')({ token }), 'already been used')

  section('An organizer stays inside their own booth')
  const b2Survey = await call('saveSurvey')({ boothId: 'ED2', title: 'Mine', questions: [{ id: 'a', kind: 'short', title: 'a' }], active: true })
  ok('saveSurvey ignores a booth they do not own', !!b2Survey.ok)
  ok('the survey landed on their own booth', (await getDoc(doc(db, 'surveys', 'ED1'))).exists())
  ok('and not on the other one', !(await getDoc(doc(db, 'surveys', 'ED2'))).exists())
  await denied('cannot promote anyone', () => call('setUserRole')({ uid: guestUid, role: 'admin' }), 'Requires role: admin')
  await denied('cannot invite anyone', () => call('inviteOrganizer')({ invites: [{ name: 'X', email: 'y@example.com', boothId: 'ED1' }] }), 'Requires role: admin')
  await denied('cannot read the audit log', () => getDocs(collection(db, 'auditLog')))
  await denied('cannot read every visitor’s prize unlocks', () => getDocs(collection(db, 'tierUnlocks')))
  await denied('cannot read a booth secret directly', () => getDoc(doc(db, 'boothSecrets', 'ED1')))

  section('Accepting an invitation keeps the passport that was already there')
  // A visitor with real progress, then invited to run a booth — the afternoon-shift case.
  await signOut(auth); await clearRateLimits()
  const dualUid = await signUp('dual@example.com')
  const dualJoin = await joinAs('Both Hats')
  const secret = await secretOf('ED3')
  const scan = await call('scan')({ payload: tok(secret, 'ED3', Math.floor(Date.now() / 1000 / 20)) })
  ok('they collected a stamp as a visitor', scan.status === 'success', `+${scan.pointsAwarded}`)
  for (let i = 0; i < 40; i++) {
    const u = (await getDoc(doc(db, 'users', dualUid))).data()
    if (u.points === scan.points) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const beforePromote = (await getDoc(doc(db, 'users', dualUid))).data()
  ok('their points have landed', beforePromote.points === scan.points, `${beforePromote.points}`)

  await signOut(auth); await signIn('admin1@example.com')
  const inv2 = await call('inviteOrganizer')({ invites: [{ name: 'Typed By Admin', email: 'dual@example.com', boothId: 'ED4', role: 'organizer' }] })
  const token2 = inv2.results[0].link.split('/invite/')[1]
  await signOut(auth); await signIn('dual@example.com')
  await call('acceptInvite')({ token: token2 })
  await auth.currentUser.getIdToken(true)
  const afterPromote = (await getDoc(doc(db, 'users', dualUid))).data()
  ok('they are now an organizer', (await claims()).role === 'organizer')
  ok('points survived the promotion', afterPromote.points === beforePromote.points, `${beforePromote.points} -> ${afterPromote.points}`)
  ok('stamps survived', afterPromote.stampCount === beforePromote.stampCount, `${beforePromote.stampCount} -> ${afterPromote.stampCount}`)
  ok('the booths they visited survived', (afterPromote.stampedBoothIds ?? []).length === (beforePromote.stampedBoothIds ?? []).length)
  ok('their passport number is untouched', afterPromote.passportNo === dualJoin.passportNo, afterPromote.passportNo)
  ok('their own name was kept, not the one the admin typed', afterPromote.displayName === 'Both Hats', afterPromote.displayName)
  ok('their own answers about themselves were kept', afterPromote.school === 'ADT' && afterPromote.visitorType === 'student', `${afterPromote.visitorType}/${afterPromote.school}`)
  ok('the booth from the invitation is attached', afterPromote.boothId === 'ED4')

  section('An admin can still promote and demote directly')
  await signOut(auth); await signIn('admin1@example.com')
  await call('setUserRole')({ uid: guestUid, role: 'organizer', boothId: 'ED5' })
  await signOut(auth); await signIn('guest1@example.com')
  ok('a promoted visitor gets the organizer claim', (await claims()).role === 'organizer', String((await claims()).boothId))
  await signOut(auth); await signIn('admin1@example.com')
  await call('setUserRole')({ uid: guestUid, role: 'visitor' })
  await signOut(auth); await signIn('guest1@example.com')
  ok('and can be put back to visitor', (await claims()).role === 'visitor')
  ok('with the booth claim cleared', (await claims()).boothId === undefined || (await claims()).boothId === null)

  section('Signed out, the world is closed')
  await signOut(auth)
  ok('the live event is public — the landing page needs it', !(await getDocs(collection(db, 'events'))).empty)
  ok('the reference lists are public — the form needs them', !!(await getDoc(doc(db, 'refData', 'institutions'))))
  await denied('booths are not', () => getDocs(collection(db, 'booths')))
  await denied('users are not', () => getDocs(collection(db, 'users')))
  await denied('surveys are not', () => getDoc(doc(db, 'surveys', 'ED1')))
  await denied('and join needs an account', () => joinAs('Anonymous'), 'unauthenticated')

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
  // Explicit: the Firestore client keeps a connection open, so the process would otherwise sit
  // there after the last assertion and the suite would look like it had hung.
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
