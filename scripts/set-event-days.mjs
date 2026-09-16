/**
 * Set which days the event runs on, and give every booth of that event the same days.
 *
 *   node scripts/set-event-days.mjs 2026-09-16 2026-09-17 2026-09-18            # dry run
 *   node scripts/set-event-days.mjs 2026-09-16 2026-09-17 2026-09-18 --commit   # apply
 *   node scripts/set-event-days.mjs 2026-09-17 2026-09-18 --commit              # revert
 *
 * Needs `npm --prefix functions run build` first and application-default credentials,
 * like the seed, cleanup and reconcile scripts. Idempotent, and reversible by re-running
 * with a different list.
 *
 * WHY A DAY MATTERS
 *   `effectivePoints` only returns a booth's scheduled value (`temporaryPoints`, the morning
 *   rate) when the booth's `activeDays` contains today in Bangkok. Outside those days a booth
 *   falls back to `points` — its afternoon rate — which is why /admin/booths reads 15 on a day
 *   the event does not cover. Adding today makes the cards read the morning value immediately.
 *
 * WHAT IT DOES NOT CHANGE
 *   Scanning: the scan path checks `booth.active`, never the day list, so booths are scannable
 *   on any date regardless. Adding a day changes what a scan is WORTH (the morning rate rather
 *   than the afternoon one), not whether it is allowed.
 *   `startsAt`/`endsAt` are left alone, so the passport cover keeps reading "18 September".
 *
 * WHAT ELSE A DAY BRINGS
 *   Prize sessions are generated per event day (functions/src/admin.ts), so each added day gets
 *   its own redemption window.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const COMMIT = argv.includes('--commit')
if (argv.includes('--emulator')) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
const DAYS = argv.filter((a) => !a.startsWith('--'))
if (!DAYS.length) { console.error('Give at least one day, e.g. 2026-09-17 2026-09-18'); process.exit(1) }
for (const d of DAYS) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { console.error(`Not a YYYY-MM-DD day: ${d}`); process.exit(1) }
DAYS.sort()

const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db, FieldValue } = await import('../functions/lib/lib.js')
const { effectivePoints } = await import('../functions/lib/shared/points.js')

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'APPLYING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  const evSnap = await db.collection('events').where('status', '==', 'live').limit(1).get()
  if (evSnap.empty) throw new Error('no live event')
  const ev = evSnap.docs[0]
  const before = ev.data().days ?? []
  console.log('event')
  console.log(`  days  ${JSON.stringify(before)} → ${JSON.stringify(DAYS)}`)
  console.log(`  startsAt/endsAt untouched — the cover still reads its own dates\n`)

  const batch = db.batch()
  let changed = 0
  if (JSON.stringify(before) !== JSON.stringify(DAYS)) {
    changed++
    batch.set(ev.ref, { days: DAYS }, { merge: true })
  }

  const booths = await db.collection('booths').where('eventId', '==', ev.id).get()
  let touched = 0
  for (const b of booths.docs) {
    const cur = b.data().activeDays ?? []
    if (JSON.stringify(cur) === JSON.stringify(DAYS)) continue
    touched++; changed++
    batch.set(b.ref, { activeDays: DAYS }, { merge: true })
  }
  console.log(`booths (eventId ${ev.id})`)
  console.log(`  ${touched} of ${booths.size} booth(s) get activeDays ${JSON.stringify(DAYS)}`)
  const other = (await db.collection('booths').get()).size - booths.size
  if (other) console.log(`  ${other} booth(s) belong to another event and are left alone`)

  // Show the effect on a real booth, at noon on each day being set.
  const sample = booths.docs.find((d) => d.data().temporaryPoints != null)
  if (sample) {
    const s = { ...sample.data(), activeDays: DAYS }
    console.log(`\neffect on ${sample.id} ("${sample.data().nameEn}")`)
    for (const d of DAYS) {
      const t = Date.parse(`${d}T10:00:00+07:00`)
      console.log(`  ${d} 10:00 → ${effectivePoints(s, t)} points`)
    }
  }

  if (!COMMIT) { console.log('\nDry run — nothing was written. Re-run with --commit to apply.'); return }
  if (!changed) { console.log('\nNothing to do.'); return }
  await batch.commit()
  await db.collection('auditLog').add({
    actorUid: 'script:set-event-days', action: 'setEventDays', targetType: 'event', targetId: ev.id,
    before: { days: before }, after: { days: DAYS, booths: touched },
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log(`\nDone. ${changed} document(s) updated.`)
  console.log('Reload /admin/booths — an activity booth should now read its morning value.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
