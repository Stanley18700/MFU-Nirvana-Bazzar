/**
 * Give an admin an email and password they can actually sign in with.
 *
 *   npm run rescue:admin -- --email you@mfu.ac.th --password '<a long one>'
 *   npm run rescue:admin -- --email you@mfu.ac.th --password '...' --uid <uid>
 *   npm run rescue:admin -- --list
 *
 * Why this exists. Until now `/setup` promoted the *anonymous* account of whichever browser
 * used the one-shot bootstrap key, so admin access lived in one browser's local storage. Every
 * account on the live project is anonymous, the admin among them. Anonymous sign-in is now off
 * and the app requires a confirmed address, which would leave that admin with no way in and
 * `bootstrapAdmin` refusing to help because an admin already exists.
 *
 * This attaches an email credential to the account that already holds the claim. The uid, the
 * custom claim and users/{uid} are untouched, so nothing else has to move — the admin simply
 * gains a way to sign in. `emailVerified` is set here because the person running this has
 * project-owner credentials and is vouching for the address out of band; without it the app
 * would send them straight to /verify-email.
 *
 * Runs through the Admin SDK, so it needs application-default credentials rather than
 * `firebase login` (SETUP.md §4) and works no matter which client build is deployed.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

if (argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}

function projectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT
  try {
    return JSON.parse(readFileSync(resolve(__dirname, '..', '..', '.firebaserc'), 'utf8')).projects.default
  } catch {
    return 'mfu-passport'
  }
}

initializeApp({ projectId: projectId() })
const db = getFirestore()
const auth = getAuth()

async function admins() {
  const q = await db.collection('users').where('role', '==', 'admin').get()
  return Promise.all(q.docs.map(async (d) => {
    const rec = await auth.getUser(d.id).catch(() => null)
    return {
      uid: d.id,
      displayName: (d.data().displayName as string | undefined) ?? '(no name)',
      contact: (d.data().contact as string | undefined) ?? '(none)',
      email: rec?.email ?? null,
      anonymous: !rec?.email && !rec?.providerData.length,
      providers: rec?.providerData.map((p) => p.providerId).join(', ') || 'none',
    }
  }))
}

async function main() {
  const list = await admins()
  if (!list.length) {
    console.error('No admin found. Nothing to rescue — use /setup with the bootstrap key instead.')
    process.exit(1)
  }

  if (argv.includes('--list') || (!flag('email') && !flag('password'))) {
    console.log(`\nAdmins on ${projectId()}:\n`)
    for (const a of list) {
      console.log(`  ${a.uid}`)
      console.log(`    name       ${a.displayName}`)
      console.log(`    contact    ${a.contact}`)
      console.log(`    sign-in    ${a.providers}${a.anonymous ? '   <- anonymous, cannot sign in once Anonymous is disabled' : ''}`)
    }
    console.log(`\nRe-run with:  npm run rescue:admin -- --email <address> --password '<at least 10 characters>'`)
    if (list.length > 1) console.log(`Several admins exist, so add --uid <uid> to say which one.`)
    return
  }

  const email = flag('email')!.trim().toLowerCase()
  const password = flag('password')!
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`Not an email address: ${email}`)
  if (password.length < 10) throw new Error('Password must be at least 10 characters')

  const uid = flag('uid') ?? (list.length === 1 ? list[0].uid : undefined)
  if (!uid) throw new Error(`${list.length} admins exist — pass --uid to choose. Run with --list to see them.`)
  const target = list.find((a) => a.uid === uid)
  if (!target) throw new Error(`${uid} is not an admin. Run with --list to see them.`)

  // An address already on another account would silently move the login somewhere else.
  const clash = await auth.getUserByEmail(email).catch(() => null)
  if (clash && clash.uid !== uid) {
    throw new Error(`${email} already belongs to ${clash.uid}. Pick another address, or delete that account first.`)
  }

  await auth.updateUser(uid, { email, emailVerified: true, password })
  await db.doc(`users/${uid}`).set({ contact: email, contactVerified: true }, { merge: true })
  // The claim is untouched, but an existing session still carries the old token.
  await auth.revokeRefreshTokens(uid)

  console.log(`\n  ${uid} can now sign in at /signin as ${email}`)
  console.log(`  role and passport untouched; other sessions on this account signed out\n`)
}

main().catch((e) => { console.error(`\n  ${e instanceof Error ? e.message : e}\n`); process.exit(1) })
