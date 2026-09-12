/**
 * One-off tidy of the live project before the festival, after the booth migration.
 *
 *   node scripts/cleanup-test-data.mjs            # dry run: prints what it would do
 *   node scripts/cleanup-test-data.mjs --commit
 *
 * Two jobs:
 *
 * 1. Demote any live event that is not the real one. The project had two marked `live` at
 *    once, from before goLive became a transaction, and `getActiveEvent` takes the first by
 *    document id — so the right event was being chosen by luck. Demoted directly rather than
 *    through `archiveEvent`, whose snapshot reads are not event-scoped: archiving the test
 *    event would have frozen the REAL event's booths and counters into a document labelled
 *    with the test event's name. There is nothing to freeze here anyway.
 *
 * 2. Clear the rehearsal data: scans, tier unlocks and visitor accounts. Staff accounts are
 *    left alone — deleting the admin you are signed in as is not a recoverable mistake — and
 *    so is every non-visitor role.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}

const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

// Same reason as migrate-booths.mjs: firebase-admin lives under functions/, and the import has
// to come after the env vars above or --emulator would point at the live project.
const { db, auth } = await import('../functions/lib/lib.js')

/** The event that should be the only live one. Everything else marked live gets demoted. */
const KEEP_EVENT = process.env.KEEP_EVENT ?? 'mfu-go-global-2026'

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'CLEANING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  // ---- 1. one live event ----
  const events = await db.collection('events').where('status', '==', 'live').get()
  const strays = events.docs.filter((d) => d.id !== KEEP_EVENT)
  if (!events.docs.some((d) => d.id === KEEP_EVENT)) {
    throw new Error(`${KEEP_EVENT} is not marked live — refusing to demote anything. Check KEEP_EVENT.`)
  }
  console.log(`events marked live: ${events.size} (${events.docs.map((d) => d.id).join(', ')})`)
  for (const d of strays) {
    const booths = await db.collection('booths').where('eventId', '==', d.id).get()
    console.log(`  demote  events/${d.id}  -> archived, and ${booths.size} of its booths -> inactive`)
    if (COMMIT) {
      const batch = db.batch()
      batch.set(d.ref, { status: 'archived', active: false, archivedAt: new Date() }, { merge: true })
      booths.docs.forEach((b) => batch.set(b.ref, { active: false }, { merge: true }))
      await batch.commit()
    }
  }
  if (!strays.length) console.log('  nothing to demote')

  // ---- 2. rehearsal data ----
  const users = await db.collection('users').get()
  const visitors = users.docs.filter((d) => d.data().role === 'visitor')
  const staff = users.docs.filter((d) => d.data().role !== 'visitor')
  const scans = await db.collection('scans').get()
  const unlocks = await db.collection('tierUnlocks').get()

  console.log(`\nrehearsal data:`)
  console.log(`  delete  ${scans.size} scans`)
  console.log(`  delete  ${unlocks.size} tierUnlocks`)
  console.log(`  delete  ${visitors.length} visitor accounts (Firestore + Auth)`)
  console.log(`  keep    ${staff.length} staff accounts: ${staff.map((d) => `${d.id.slice(0, 6)}…(${d.data().role})`).join(', ')}`)

  if (COMMIT) {
    for (const group of [scans.docs, unlocks.docs, visitors]) {
      for (let i = 0; i < group.length; i += 400) {
        const batch = db.batch()
        group.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    }
    // The Auth account too, or the address cannot be reused and the person can still sign in.
    if (visitors.length) await auth.deleteUsers(visitors.map((d) => d.id)).catch((e) => console.error('deleteUsers', e.message))
  }

  // ---- counters that would otherwise describe people who are gone ----
  if (COMMIT) {
    const batch = db.batch()
    for (let i = 0; i < 10; i++) {
      batch.delete(db.doc(`stats/event/shards/${i}`))
      batch.delete(db.doc(`stats/demographics/shards/${i}`))
    }
    await batch.commit()
    const boothStats = await db.collection('stats/booths/items').get()
    for (let i = 0; i < boothStats.docs.length; i += 400) {
      const b = db.batch()
      boothStats.docs.slice(i, i + 400).forEach((d) => b.set(d.ref, { stamps: 0, rank: null, byVisitorType: {}, byDay: {}, byHour: {}, lastStampAt: null }, { merge: true }))
      await b.commit()
    }
    console.log(`  reset   event counters and ${boothStats.size} booth counters`)
  } else {
    console.log(`  reset   the event counters and every booth counter`)
  }

  console.log(COMMIT ? '\nDone.' : '\nDry run — nothing was written. Re-run with --commit to apply.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
