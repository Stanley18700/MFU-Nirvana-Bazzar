/**
 * A rehearsal for the quiet-booth boost, against a disposable emulator.
 *
 *   npm run demo:points
 *
 * It lays down the real 76 booths, invents a lopsided half hour of visits — a handful of booths
 * mobbed, most steady, a few nearly ignored — then runs the same two callables the admin page
 * runs, and prints what the organisers would see and what it would change.
 *
 * Why this exists: the adjustment only looks at booths scheduled for TODAY, and the festival is
 * in the future, so on the live project before the 16th a preview can only ever answer "not
 * enough recent participation". This is how to watch it work before the day.
 */
const assert = require('node:assert/strict')
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Run through `npm run demo:points`, which starts a disposable emulator.')
}
const { db, Timestamp, clearEventCache } = require('../functions/lib/lib')
const { previewPointAdjustments, applyPointAdjustments } = require('../functions/lib/points')
const { SEED_BOOTHS } = require('../functions/lib/booths.data')
const { dayOf, DEFAULT_PRIZE_SESSIONS, BOOTH_BASE_POINTS } = require('../functions/lib/shared/model')
const { pointWindow, boostFor, MAX_BOOSTS_PER_GROUP } = require('../functions/lib/shared/points')

const EVENT = 'demo-event'
const req = (data = {}) => ({ data, auth: { uid: 'admin', token: { role: 'admin' } }, rawRequest: { headers: {}, ip: '127.0.0.1' } })
const clock = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))

async function seed(now) {
  const day = dayOf(new Date(now))
  await db.doc(`events/${EVENT}`).set({
    nameEn: 'Point adjustment rehearsal', nameTh: '', status: 'live', active: true, days: [day],
    startsAt: Timestamp.fromMillis(now - 7200_000), endsAt: Timestamp.fromMillis(now + 7200_000),
    qrPeriodSeconds: 20, passportPrefix: 'MFU-GG', prizeSessions: DEFAULT_PRIZE_SESSIONS.map((s) => ({ ...s })),
  })
  let batch = db.batch(); let n = 0
  for (const [i, b] of SEED_BOOTHS.entries()) {
    batch.set(db.doc(`booths/${b.id}`), {
      eventId: EVENT, nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.shortName, hostUnit: b.hostUnit,
      location: b.location, category: b.category, accentColor: b.accentColor, zone: b.zone,
      points: BOOTH_BASE_POINTS, activeDays: [day], isPrizeDesk: !!b.isPrizeDesk, active: true, sortOrder: i + 1,
      createdAt: Timestamp.now(),
    })
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
  }
  await batch.commit()
  await db.doc('prizeTiers/global-passport').set({
    eventId: EVENT, name: 'Global Passport gift', reward: 'The main gift', thresholdPoints: 100,
    active: true, sortOrder: 1, stockPerSession: 50, sessionRemaining: {}, stockTotal: 300, stockRemaining: 300,
  })
  return day
}

/** A lopsided half hour: five booths mobbed, most steady, ten barely visited. */
async function visits(now) {
  const { windowStart, windowEnd } = pointWindow(now)
  const at = Timestamp.fromMillis(windowEnd - 60_000)
  const eligible = SEED_BOOTHS.filter((b) => !b.isPrizeDesk)
  const plan = eligible.map((b, i) => ({ id: b.id, name: b.nameEn, count: i < 5 ? 20 : i >= eligible.length - 10 ? 1 : 6 }))

  let batch = db.batch(); let n = 0
  for (const p of plan) {
    for (let v = 0; v < p.count; v++) {
      batch.set(db.doc(`scans/visitor${v}_${p.id}`), { eventId: EVENT, boothId: p.id, visitorId: `visitor${v}`, scannedAt: at, pointsAwarded: BOOTH_BASE_POINTS })
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
  }
  await batch.commit()
  return { plan, total: n, windowStart, windowEnd }
}

async function main() {
  const now = Date.now()
  const day = await seed(now)
  clearEventCache()
  const { plan, total, windowStart, windowEnd } = await visits(now)
  console.log(`\nRehearsal for ${day}: ${SEED_BOOTHS.length} booths, ${total} visits in the half hour ending ${clock(windowEnd)}.\n`)

  const preview = await previewPointAdjustments.run(req({}))
  console.log(`Window            ${clock(windowStart)} - ${clock(windowEnd)}`)
  console.log(`Visits counted    ${preview.totalScans} across ${preview.rows.length} booths in ${preview.groups.length} group(s)`)
  for (const g of preview.groups) console.log(`Group ${g.label.padEnd(12)} ${g.comparable}/${g.size} open, median ${g.median} visits, ${g.sufficient ? 'judged' : 'too small to judge'}, ${g.offered} boost(s) offered`)
  console.log(`Anything to do?   ${preview.sufficient ? `yes — ${preview.offered} booth(s) offered a boost` : 'NO — it will leave every booth alone'}`)
  console.log(`Points on offer   ${preview.availablePoints} if a visitor walked the whole hall`)
  if (preview.unreachableTiers.length) console.log(`Warning           ${preview.unreachableTiers.map((t) => `${t.name} needs ${t.thresholdPoints}`).join(', ')}`)

  const show = (reason) => {
    const rows = preview.rows.filter((r) => r.reason === reason)
    const sample = rows.slice(0, 3).map((r) => `${r.boothId} "${r.name.slice(0, 26)}" ${r.scans} visits: ${r.basePoints} -> ${r.suggestedPoints}`)
    console.log(`\n${reason.toUpperCase().padEnd(8)} ${rows.length} booths`)
    for (const s of sample) console.log(`   ${s}`)
    if (rows.length > 3) console.log(`   … and ${rows.length - 3} more`)
  }
  show('quiet'); show('capped'); show('typical'); show('no-scans')

  const applied = await applyPointAdjustments.run(req({ previewId: preview.id }))
  console.log(`\nApplied. The boost lasts until ${clock(applied.expiresAt)}; another pass allowed from ${clock(applied.nextApplyAt)}.`)

  const check = async (id) => (await db.doc(`booths/${id}`).get()).data()
  const quiet = preview.rows.find((r) => r.reason === 'quiet')
  const busy = preview.rows.reduce((m, r) => (r.scans > m.scans ? r : m), preview.rows[0])
  const q = await check(quiet.boothId); const b = await check(busy.boothId)
  console.log(`\nWhat a visitor now sees`)
  console.log(`  ${quiet.boothId} (quiet, ${quiet.scans} visits)  base ${q.points}, worth ${q.points + q.boostPoints} (+${q.boostPoints}) until ${clock(q.boostUntil)}`)
  console.log(`  ${busy.boothId} (busiest, ${busy.scans} visits) base ${b.points}, still worth ${b.points} — nothing is ever cut`)

  const median = preview.groups[0].median
  assert.equal(q.boostPoints, boostFor(BOOTH_BASE_POINTS, quiet.scans, median), 'the boost follows the 25–35% scale')
  assert.equal(b.boostPoints ?? null, null, 'a busy booth is left alone')
  assert.equal(q.points, BOOTH_BASE_POINTS, 'the base value must not move')
  assert.equal(q.temporaryPoints ?? null, null, 'the balancer never writes a scheduled value')
  assert.equal(preview.rows.filter((r) => r.reason === 'quiet').length, Math.min(MAX_BOOSTS_PER_GROUP, 10), 'at most three boosts per group')
  console.log(`\nChecks passed: quiet boosted on the 25–35% scale, busy untouched, base and scheduled values untouched.`)
  console.log(`Booths near their group's median: left exactly as they were.\n`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
