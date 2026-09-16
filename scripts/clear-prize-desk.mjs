/**
 * Take the prize-desk role off ED7 and stop the live copy naming it as the gift point.
 *
 *   node scripts/clear-prize-desk.mjs            # dry run: prints every change, writes nothing
 *   node scripts/clear-prize-desk.mjs --commit   # apply (idempotent — safe to re-run)
 *
 * Needs `npm --prefix functions run build` first (firebase-admin lives under functions/) and
 * application-default credentials, like the seed, cleanup and reconcile scripts.
 *
 * WHY
 *   `isPrizeDesk` is not a label: `assertPrizeDesk` (functions/src/organizer.ts) is what lets an
 *   organizer account run `lookupVisitor` and `redeemTier`, and the Redeem screen and its nav
 *   entry appear only for a booth that carries it. ED7 was the only booth with the flag. The
 *   organisers have not said which booth hands out gifts this year, so it is left unassigned
 *   rather than guessed at.
 *
 * WHAT THAT COSTS WHILE NO BOOTH HAS IT
 *   Redemption still works, but only from an ADMIN account — `assertPrizeDesk` returns early for
 *   admins and the Redeem screen's organizer gate is skipped for them. No organizer account can
 *   hand out a gift until a booth is given the flag again (/admin/booths, or re-run this with the
 *   booth id once it is decided).
 *
 * WHAT IT TOUCHES: booths/ED7.isPrizeDesk and .descriptionTh, prizeTiers/*.reward. It leaves
 * ED7's points, activeDays, organizer and English name alone — ED7 stays a scoring booth worth
 * 27 in the morning and 16 after noon.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
if (args.includes('--emulator')) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db, FieldValue } = await import('../functions/lib/lib.js')

/** The Thai suffix that made ED7's own description advertise the gift counter. */
const GIFT_SUFFIX = ' · จุดรับของรางวัล Global Passport Gift'
/** Booth-free wording, so the tier stops sending visitors to a booth that is not the desk. */
const REWARD = 'The MFU Go Global gift, collected at the prize desk'

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'APPLYING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  const snap = await db.collection('booths').get()
  const desks = snap.docs.filter((d) => d.data().isPrizeDesk)
  console.log(`prize desks now: ${desks.length ? desks.map((d) => `${d.id} "${d.data().nameEn}"`).join(', ') : 'none'}`)

  const batch = db.batch()
  let changed = 0

  console.log('\nbooths')
  for (const d of desks) {
    changed++
    console.log(`  ${d.id.padEnd(7)} isPrizeDesk true → false   ("${d.data().nameEn}")`)
    batch.set(d.ref, { isPrizeDesk: false }, { merge: true })
  }
  for (const d of snap.docs) {
    const th = d.data().descriptionTh
    if (typeof th !== 'string' || !th.includes(GIFT_SUFFIX)) continue
    changed++
    console.log(`  ${d.id.padEnd(7)} descriptionTh drops "${GIFT_SUFFIX.trim()}"`)
    batch.set(d.ref, { descriptionTh: th.replace(GIFT_SUFFIX, '') }, { merge: true })
  }
  if (!changed) console.log('  (nothing to change)')

  console.log('\nprize tiers')
  const tiers = await db.collection('prizeTiers').get()
  for (const t of tiers.docs) {
    const cur = t.data().reward
    if (cur === REWARD) { console.log(`  ${t.id}: already booth-free`); continue }
    changed++
    console.log(`  ${t.id}: reward`)
    console.log(`    ${JSON.stringify(cur ?? null)}`)
    console.log(`    → ${JSON.stringify(REWARD)}`)
    batch.set(t.ref, { reward: REWARD }, { merge: true })
  }

  if (!COMMIT) { console.log('\nDry run — nothing was written. Re-run with --commit to apply.'); return }
  if (!changed) { console.log('\nNothing to do.'); return }
  await batch.commit()
  await db.collection('auditLog').add({
    actorUid: 'script:clear-prize-desk', action: 'clearPrizeDesk', targetType: 'booths', targetId: 'all',
    before: { prizeDesks: desks.map((d) => d.id) },
    after: { prizeDesks: [], reward: REWARD },
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log(`\nDone. ${changed} document(s) updated.`)
  console.log('No booth is a prize desk now — only an ADMIN account can redeem a gift.')
  console.log('Give a booth the flag on /admin/booths once the organisers decide which desk it is.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
