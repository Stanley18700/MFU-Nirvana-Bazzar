/**
 * One-off migration: retire the 12 placeholder booths and the 3-tier prize policy seeded on
 * 7 September, so `npm run seed` can lay down the 76 real booths and the single gift.
 *
 *   node scripts/migrate-booths.mjs --emulator          # dry run against the emulator
 *   node scripts/migrate-booths.mjs --emulator --commit
 *   node scripts/migrate-booths.mjs --commit            # against the live project
 *
 * Dry run by default: it prints exactly what it would touch and writes nothing. Read that
 * output before adding --commit.
 *
 * What it removes, and why each one:
 *   booths/booth-NN            the placeholder booths, replaced by ED*/CL*/FD*/OPEN* ids
 *   boothSecrets/booth-NN      their QR secrets — dead once the booth is gone, and a live
 *                              secret for a booth nobody can scan is just a loose key
 *   stats/booths/items/*       their counters, so the dashboard does not rank ghosts
 *   prizeTiers/{explorer,voyager,globetrotter}
 *
 * What it deliberately does NOT remove: scans, users, tierUnlocks. Those are the record of
 * what actually happened during testing. Scans pointing at a deleted booth are harmless — they
 * simply stop resolving to a booth — and keeping them means the migration is recoverable.
 * If you want a genuinely clean slate, use the admin Danger Zone instead, which is built for it.
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
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
function projectFromRc() {
  try {
    return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default
  } catch {
    return 'mfu-passport'
  }
}
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? projectFromRc()
initializeApp({ projectId })
const db = getFirestore()

const OLD_BOOTH_IDS = Array.from({ length: 12 }, (_, i) => `booth-${String(i + 1).padStart(2, '0')}`)
const OLD_TIER_IDS = ['explorer', 'voyager', 'globetrotter']

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'MIGRATING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  const doomed = []
  for (const id of OLD_BOOTH_IDS) {
    for (const path of [`booths/${id}`, `boothSecrets/${id}`, `stats/booths/items/${id}`]) {
      if ((await db.doc(path).get()).exists) doomed.push(path)
    }
  }
  for (const id of OLD_TIER_IDS) {
    const path = `prizeTiers/${id}`
    if ((await db.doc(path).get()).exists) doomed.push(path)
  }

  // Anything that already carries a new-style id means the seed has run — say so rather than
  // letting someone wonder why the migration found nothing.
  const newBooths = await db.collection('booths').where('eventId', '==', 'mfu-go-global-2026').get()
  const alreadySeeded = newBooths.docs.filter((d) => !OLD_BOOTH_IDS.includes(d.id)).length

  if (!doomed.length) {
    console.log('Nothing to remove — the old booths and tiers are already gone.')
  } else {
    for (const p of doomed) console.log(`  delete  ${p}`)
    console.log(`\n${doomed.length} documents.`)
  }
  if (alreadySeeded) console.log(`${alreadySeeded} booths with new-style ids are already present.`)

  const unlocks = await db.collection('tierUnlocks').where('tierId', 'in', OLD_TIER_IDS).count().get()
  const orphanedUnlocks = unlocks.data().count
  if (orphanedUnlocks) {
    console.log(`\nNote: ${orphanedUnlocks} tierUnlocks point at the old tiers. They are left in place` +
      ' (they are test data and deleting them would lose the redemption audit trail), but they will' +
      ' no longer resolve to a prize. Clear them from the admin Danger Zone if you want them gone.')
  }

  if (!COMMIT) {
    console.log('\nDry run — nothing was written. Re-run with --commit to apply.')
    return
  }

  let batch = db.batch()
  let n = 0
  for (const path of doomed) {
    batch.delete(db.doc(path))
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
  }
  if (n % 400) await batch.commit()
  console.log(`\nDeleted ${doomed.length} documents. Now run \`npm run seed\` to lay down the 76 booths.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
