/**
 * Apply the event planner's scoring configuration (ชุดข้อมูลสำหรับตั้งค่าคะแนน, 16 Sep 2026).
 *
 *   node scripts/apply-scoring.mjs            # dry run: prints every change, writes nothing
 *   node scripts/apply-scoring.mjs --commit   # apply (idempotent — safe to re-run)
 *   node scripts/apply-scoring.mjs --commit --days   # …and also set the event's day list
 *
 * WHICH DAYS SCORE IS NOT THIS SCRIPT'S BUSINESS unless you pass --days. A booth only pays its
 * morning value on a day the event covers, so a run that silently reset the day list would undo
 * whatever `set-event-days.mjs` was last told — it nearly did on 16 Sep, while the 16th was
 * added for a rehearsal demo. Without --days the booths inherit the event's current days.
 *
 * Needs `npm --prefix functions run build` first (firebase-admin lives under functions/) and
 * application-default credentials, like the seed, cleanup and reconcile scripts.
 *
 * WHAT THE PLANNER ASKED FOR (scoring document, 16 Sep) — per-booth values:
 *   Morning  09:00–12:00  activity booths 27, Plang Plang 28
 *   Afternoon 13:00–19:00 activity booths 15 (ED5, ED7, ED12, ED13 and the second Eco-printing
 *                         booth ED15 at 16), food booths 12
 *   First Aid is not a scoring point (it no longer has a booth number at all).
 *   Redemption threshold 500 points.
 *
 * ROSTER since the planner's sheet of 16 Sep evening ("Booths Details_Latest_06092026", applied by
 * apply-sheet-latest.mjs): 38 activity booths (ED1–19, CL20–25, OPEN1–13) and 39 food booths
 * (FD26–63 + OPEN14 A Taste of India). Plang Plang is OPEN11 now. That is one activity booth and
 * one food booth MORE than the scoring document counted, so the session totals are 1,027 morning
 * and 1,043 afternoon rather than the document's 1,000 — Stanley's decision 16 Sep: keep the
 * per-booth values, let the totals drift; the 500 threshold is unaffected.
 *
 * HOW THE SAME BOOTH IS WORTH TWO DIFFERENT AMOUNTS
 *   The app already carries a scheduled value change per booth: `effectivePoints` returns
 *   `temporaryPoints` while `pointsExpireAt` is still in the future, and `points` after it. So
 *   every activity booth gets its MORNING value as `temporaryPoints`, its AFTERNOON value as
 *   `points`, and an expiry of Friday 12:00 ICT. The switch happens on the clock with nobody
 *   pressing anything, and because a scan freezes its own value (visitor.ts), a stamp collected
 *   at 11:59 keeps 27 for good.
 *
 *   Food booths are 12 points all day — they have no morning value because they do not open
 *   until 13:00, and with the rotating QR a booth that is not running shows no code to scan.
 *
 * Since 16 Sep the balancer ("Balance booth visits") writes its boosts to `boostPoints`/`boostUntil`
 * — separate fields, added ON TOP of the value set here — and its reset clears only those. Before
 * that it shared these fields and one press of "Reset to base points" wiped a morning's values;
 * if you ever see the activity booths at 15/16 on the 17th or 18th before noon, re-run this
 * script with --commit. It is idempotent.
 *
 * WHAT IT TOUCHES: booths/{id}.points, .temporaryPoints, .pointsExpireAt, .activeDays, and
 * .active (every scoring booth is switched on); events/{live}.startsAt/.endsAt (.days only with --days); prizeTiers/{id}.thresholdPoints.
 * It never touches secrets, organizers, scans, stats, stock or the prize sessions.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
/** Only with --days does this script decide which days the event runs on (see the note above). */
const WRITE_DAYS = args.includes('--days')
if (args.includes('--emulator')) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db, FieldValue } = await import('../functions/lib/lib.js')

// ---- the configuration, straight from the planner's tables ----

/** Bangkok is UTC+7 and never changes, so an ISO instant is unambiguous. */
const SWITCH_TO_AFTERNOON = Date.parse('2026-09-18T12:00:00+07:00')
const REHEARSAL_DAY = '2026-09-17'
const EVENT_DAY = '2026-09-18'
const DAYS = [REHEARSAL_DAY, EVENT_DAY]
const EVENT_STARTS = Date.parse('2026-09-18T09:00:00+07:00')
const EVENT_ENDS = Date.parse('2026-09-18T19:00:00+07:00')
const THRESHOLD = 500

/** Worth 16 in the afternoon instead of 15 (planner's table §3.2; ED15 = second Eco-printing booth, Stanley 16 Sep). */
const AFTERNOON_16 = new Set(['ED5', 'ED7', 'ED12', 'ED13', 'ED15'])
/** Worth 28 in the morning instead of 27 — Plang Plang, which the latest sheet numbers Open Space 11. */
const MORNING_28 = new Set(['OPEN11'])

const activityIds = [
  ...Array.from({ length: 19 }, (_, i) => `ED${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `CL${i + 20}`),
  ...Array.from({ length: 13 }, (_, i) => `OPEN${i + 1}`),
]
/** FD26–FD63 plus the Consulate of India's Open Space 14. */
const foodIds = [...Array.from({ length: 38 }, (_, i) => `FD${i + 26}`), 'OPEN14']

/** boothId -> { morning, afternoon } as the planner's tables specify. */
const PLAN = new Map()
for (const id of activityIds) {
  PLAN.set(id, { morning: MORNING_28.has(id) ? 28 : 27, afternoon: AFTERNOON_16.has(id) ? 16 : 15 })
}
for (const id of foodIds) PLAN.set(id, { morning: null, afternoon: 12 })

// ---- arithmetic, checked here rather than trusted ----
const morningTotal = activityIds.reduce((s, id) => s + PLAN.get(id).morning, 0)
const afternoonActivity = activityIds.reduce((s, id) => s + PLAN.get(id).afternoon, 0)
const afternoonFood = foodIds.length * 12
const afternoonTotal = afternoonActivity + afternoonFood

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'APPLYING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  console.log('planned totals')
  console.log(`  morning   ${activityIds.length} booths = ${morningTotal} points  (scoring document said 1000 for 37 booths)`)
  console.log(`  afternoon ${activityIds.length + foodIds.length} booths = ${afternoonTotal} points`)
  console.log(`            = ${afternoonActivity} activity + ${afternoonFood} food  (scoring document said 1000 for 74 booths)`)
  if (morningTotal !== 1000 || afternoonTotal !== 1000) {
    console.log('  ⚠ totals differ from the scoring document because the latest booth sheet has more booths than it')
    console.log('    counted (38 activity + 39 food). Per-booth values are the document\'s; the 500 threshold is unaffected.')
  }
  if (THRESHOLD > afternoonTotal) throw new Error('threshold is above the afternoon maximum')

  const snap = await db.collection('booths').get()
  const booths = new Map(snap.docs.map((d) => [d.id, d.data()]))
  const missing = [...PLAN.keys()].filter((id) => !booths.has(id))
  if (missing.length) throw new Error(`booth documents missing: ${missing.join(', ')}${missing.includes('OPEN14') ? ' — run apply-sheet-latest.mjs --commit first' : ''}`)
  const extra = [...booths.keys()].filter((id) => !PLAN.has(id))
  if (extra.length) console.log(`\nnote: ${extra.length} booth(s) not in the planner's tables are left alone: ${extra.join(', ')}`)

  // Read the live event first: without --days the booths keep the days the event already
  // runs on, so repairing point values never changes which days score.
  const evSnap = await db.collection('events').where('status', '==', 'live').limit(1).get()
  if (evSnap.empty) throw new Error('no live event')
  const evRef = evSnap.docs[0].ref
  const ev = evSnap.docs[0].data()
  const ACTIVE_DAYS = WRITE_DAYS || !Array.isArray(ev.days) || !ev.days.length ? DAYS : ev.days

  const batch = db.batch()
  let changed = 0

  console.log('\nbooths')
  for (const [id, plan] of PLAN) {
    const cur = booths.get(id)
    const patch = {
      points: plan.afternoon,
      temporaryPoints: plan.morning,
      pointsExpireAt: plan.morning === null ? null : SWITCH_TO_AFTERNOON,
      activeDays: ACTIVE_DAYS,
      // A booth the planner scores must be scannable, whatever it was before.
      active: true,
    }
    const diff = Object.entries(patch).filter(([k, v]) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(v ?? null))
    if (!diff.length) continue
    changed++
    const shape = plan.morning === null ? `${plan.afternoon} all day` : `${plan.morning} → ${plan.afternoon} at 12:00`
    console.log(`  ${id.padEnd(7)} ${String(cur.points ?? '?').padStart(3)} → ${shape.padEnd(22)} ${cur.nameEn}${cur.active === false ? '  (was inactive → active)' : ''}`)
    batch.set(db.doc(`booths/${id}`), patch, { merge: true })
  }

  // ---- event ----
  console.log('\nevent')
  if (WRITE_DAYS) console.log(`  days        ${JSON.stringify(ev.days)} → ${JSON.stringify(DAYS)}   (${REHEARSAL_DAY} = rehearsal)`)
  else console.log(`  days        ${JSON.stringify(ev.days)} left alone; booths get these   (--days to set ${JSON.stringify(DAYS)})`)
  console.log(`  startsAt    → ${new Date(EVENT_STARTS).toISOString()}  (cover reads "18 September 2026 · 09:00–19:00")`)
  console.log(`  endsAt      → ${new Date(EVENT_ENDS).toISOString()}`)
  batch.set(evRef, {
    ...(WRITE_DAYS ? { days: DAYS } : {}),
    startsAt: new Date(EVENT_STARTS),
    endsAt: new Date(EVENT_ENDS),
  }, { merge: true })

  // ---- redemption threshold ----
  const tiers = await db.collection('prizeTiers').get()
  console.log('\nprize tiers')
  for (const t of tiers.docs) {
    const d = t.data()
    if (!d.active) continue
    if (d.thresholdPoints === THRESHOLD) { console.log(`  ${t.id}: already ${THRESHOLD}`); continue }
    changed++
    console.log(`  ${t.id}: ${d.thresholdPoints} → ${THRESHOLD} points   ("${d.name}")`)
    batch.set(t.ref, { thresholdPoints: THRESHOLD }, { merge: true })
  }

  if (!COMMIT) { console.log('\nDry run — nothing was written. Re-run with --commit to apply.'); return }
  await batch.commit()
  await db.collection('auditLog').add({
    actorUid: 'script:apply-scoring', action: 'applyScoring', targetType: 'event', targetId: evSnap.docs[0].id,
    before: null,
    after: { morningTotal, afternoonTotal, threshold: THRESHOLD, days: DAYS, switchAt: SWITCH_TO_AFTERNOON },
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log(`\nDone. ${changed} document(s) updated.`)
  console.log('Check /admin/booths: an activity booth should read its MORNING value until Friday 12:00.')
  console.log('Boosts from "Balance booth visits" sit on top of these values in their own fields and never replace them.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
