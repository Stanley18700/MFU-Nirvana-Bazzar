/**
 * One-off tidy of the live project before the festival: wipe every trace of the rehearsals and
 * put every counter back to zero, leaving the configuration (event, booths, secrets, prize policy,
 * reference lists, staff accounts, surveys, invites) exactly as it is.
 *
 *   node scripts/cleanup-test-data.mjs             # dry run: prints what it would do, writes nothing
 *   node scripts/cleanup-test-data.mjs --commit    # apply
 *   node scripts/cleanup-test-data.mjs --keep=a@b.com,MFU-GG-0025   # spare these visitors
 *
 * Needs application-default credentials on the machine that runs it (SETUP.md §4) — the same as
 * `npm run seed` — and `functions/lib` built (`npm --prefix functions run build`).
 *
 * The scope is deliberately the same list the app's own `purgeEventData` calls "working data"
 * (functions/src/event.ts), plus the collections written since it was last touched — ratings,
 * surveys, erasure requests and the point-adjustment residue, none of which have a purge scope.
 *
 * What goes:
 *   users (role visitor) + their Auth accounts      every registered visitor, test or real (see below)
 *   scans, countedScans                              the stamps and the trigger's "already counted" markers —
 *                                                    always together, or a re-scan after the wipe would be
 *                                                    taken for a redelivery and award nothing
 *   tierUnlocks                                      prize eligibility rows
 *   draws                                            the rehearsal prize draws — they show in /admin history
 *   boothRatings, boothRated, stats/ratings/items    the 1–5 star ratings and their counters
 *   surveyResponses, surveyTaken                     festival + booth survey answers and "already answered" markers
 *   stockAdjustments (kind redeem/void, or for a     the ledger rows from rehearsal hand-overs and from tiers
 *     tier that no longer exists)                    that were retired (explorer / voyager / globetrotter)
 *   rateLimits                                       fixed-window counters (join_*, scan_*, rate_*)
 *   erasureRequests                                  PDPA requests from test accounts
 *   pointAdjustmentPreviews, pointAdjustmentState    stale proposals and the apply-cooldown/revision state
 *   stats/buckets/items                              the 5-minute timeline
 *   stats/event, stats/event/shards/*,               the live counters — recreated from zero by the triggers
 *     stats/demographics/shards/*
 *   counters/passport                                so numbering restarts at MFU-GG-0001
 *
 * What is reset in place:
 *   stats/booths/items/*                             stamps 0, rank cleared, breakdowns emptied
 *   booths/* boostPoints, boostUntil                 only if a rehearsal boost left them set; no other booth
 *                                                    field is written. NEVER temporaryPoints/pointsExpireAt:
 *                                                    those are the planner's scheduled morning values
 *                                                    (scripts/apply-scoring.mjs), not rehearsal residue.
 *   prizeTiers/*                                     stockRemaining = stockTotal, sessionRemaining removed
 *                                                    (an absent key is what "untouched, therefore full" is
 *                                                    written as everywhere else — see confirmRedemption)
 *   surveys/*                                        responseCount 0
 *
 * What is deliberately untouched: events, booths' configuration, boothSecrets, prizeTiers' policy
 * fields, refData, surveys' questions and version history, invites, staffRequests, auditLog,
 * archives, and every account whose role is not visitor — deleting the admin you are signed in as
 * is not a recoverable mistake.
 *
 * ⚠ Visitor accounts are deleted, not reset. Some real people (GRD and client staff trying the app
 * on 13–14 Sep) registered as visitors; they will have to register again on the day, which takes a
 * minute. Their Auth account goes too, or the address could not be reused. The dry run lists them,
 * and --keep spares anyone you name.
 *
 * ⚠ Ordering matters, and it is the reason the shards are cleared last, in a drain loop. Deleting a
 * visitor fires `onUserWrite`, which decrements a RANDOMLY CHOSEN event shard and demographics shard
 * (triggers.ts). Those trigger runs land seconds to minutes after the delete, so clearing the shards
 * in the middle of the run leaves them to be re-created afterwards holding negative counts — the
 * dashboard would read "-24 visitors" instead of zero. So: visitors first, shards last, then poll
 * until two consecutive passes find the shards still gone.
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

/** --keep=a@b.com,MFU-GG-0025,<uid> — matched against contact, passportNo and uid, case-insensitively. */
const KEEP = new Set(
  (args.find((a) => a.startsWith('--keep='))?.slice('--keep='.length) ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
)

const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

// Same reason as migrate-booths.mjs: firebase-admin lives under functions/, and the import has
// to come after the env vars above or --emulator would point at the live project.
const { db, auth, FieldValue } = await import('../functions/lib/lib.js')
// The shard count is a shared constant; hard-coding 10 here would silently miss shards if it changed.
const { STATS_SHARDS } = await import('../functions/lib/shared/model.js')

/** The event that should be the only live one. Everything else marked live gets demoted. */
const KEEP_EVENT = process.env.KEEP_EVENT ?? 'mfu-go-global-2026'

const BATCH = 400
/** How long to let the delete triggers drain before re-checking the shards. */
const DRAIN_WAIT_MS = Number(process.env.DRAIN_WAIT_MS ?? 10_000)
const DRAIN_ROUNDS = Number(process.env.DRAIN_ROUNDS ?? 12)

const pad = (n) => String(n).padStart(5, ' ')
const act = (verb) => (COMMIT ? verb : `would ${verb}`).padEnd(12)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Delete every document in a collection, a page at a time so a large collection cannot exhaust memory. */
async function wipe(label, path) {
  const total = (await db.collection(path).count().get()).data().count
  console.log(`  ${act('delete')} ${pad(total)}  ${label}`)
  if (COMMIT && total) {
    for (;;) {
      const snap = await db.collection(path).limit(BATCH).get()
      if (snap.empty) break
      const b = db.batch()
      snap.docs.forEach((d) => b.delete(d.ref))
      await b.commit()
    }
  }
  return total
}

/** Delete the given docs in batches. */
async function deleteDocs(docs) {
  for (let i = 0; i < docs.length; i += BATCH) {
    const b = db.batch()
    docs.slice(i, i + BATCH).forEach((d) => b.delete(d.ref ?? d))
    await b.commit()
  }
}

/**
 * Clear the event and demographics shards, then keep clearing them until they stay gone.
 *
 * `onUserWrite` runs once per deleted visitor and writes a decrement into a random shard. A single
 * delete pass races those runs: whatever lands afterwards re-creates the shard with a negative
 * count, and the dashboard sums shards without clamping (src/lib/data.ts). Two consecutive clean
 * passes, DRAIN_WAIT_MS apart, is the signal that the backlog has drained.
 */
async function clearShardsUntilStable() {
  const refs = []
  for (let i = 0; i < STATS_SHARDS; i++) {
    refs.push(db.doc(`stats/event/shards/${i}`), db.doc(`stats/demographics/shards/${i}`))
  }
  let clean = 0
  for (let round = 1; round <= DRAIN_ROUNDS; round++) {
    const present = (await db.getAll(...refs)).filter((s) => s.exists)
    if (present.length) {
      await deleteDocs(present)
      clean = 0
      console.log(`  round ${round}: deleted ${present.length} shard doc(s) — delete triggers were still landing`)
    } else if (++clean >= 2) {
      console.log(`  round ${round}: shards clean twice running — the trigger backlog has drained`)
      return true
    } else {
      console.log(`  round ${round}: shards clean (1 of 2)`)
    }
    if (round < DRAIN_ROUNDS) await sleep(DRAIN_WAIT_MS)
  }
  return false
}

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'CLEANING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  // ---- 1. one live event ----
  const events = await db.collection('events').where('status', '==', 'live').get()
  const strays = events.docs.filter((d) => d.id !== KEEP_EVENT)
  if (!events.docs.some((d) => d.id === KEEP_EVENT)) {
    throw new Error(`${KEEP_EVENT} is not marked live — refusing to touch anything. Check KEEP_EVENT.`)
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

  // ---- 2. people ----
  // First, because every delete here queues an onUserWrite run that writes to a shard, and the
  // shards are cleared at the very end once those runs have drained.
  const users = await db.collection('users').get()
  const allVisitors = users.docs.filter((d) => d.data().role === 'visitor')
  const staff = users.docs.filter((d) => d.data().role !== 'visitor')
  const kept = allVisitors.filter((d) => {
    const u = d.data()
    return KEEP.has(d.id.toLowerCase())
      || KEEP.has(String(u.contact ?? '').toLowerCase())
      || KEEP.has(String(u.passportNo ?? '').toLowerCase())
  })
  const visitors = allVisitors.filter((d) => !kept.includes(d))

  console.log(`\nvisitor accounts (${visitors.length}) — every one of these is deleted, Firestore + Auth:`)
  for (const d of visitors) {
    const u = d.data()
    const when = u.createdAt?.toDate?.()?.toISOString().slice(0, 10) ?? '?'
    console.log(`  ${(u.passportNo ?? '').padEnd(12)} ${String(u.displayName ?? '').slice(0, 28).padEnd(28)} ${String(u.contact ?? '').slice(0, 34).padEnd(34)} ${when}  ${u.points ?? 0} pts`)
  }
  if (kept.length) {
    console.log(`\nvisitors spared by --keep (${kept.length}): ${kept.map((d) => d.data().passportNo ?? d.id.slice(0, 6)).join(', ')}`)
    console.log('  note: their scans, unlocks and survey answers are still deleted below, and the shards')
    console.log('  are zeroed, so they will read 0 points until they scan again.')
  }
  console.log(`\nstaff accounts kept (${staff.length}): ${staff.map((d) => `${(d.data().displayName ?? d.id.slice(0, 6))}(${d.data().role})`).join(', ')}`)

  if (COMMIT && visitors.length) {
    await deleteDocs(visitors)
    // Auth in chunks of 1000 (the API's ceiling), so the address can be used to register again.
    for (let i = 0; i < visitors.length; i += 1000) {
      const res = await auth.deleteUsers(visitors.slice(i, i + 1000).map((d) => d.id)).catch((e) => { console.error('deleteUsers', e.message); return null })
      if (res?.failureCount) console.error(`  ${res.failureCount} Auth accounts could not be deleted:`, res.errors.map((e) => e.error.message).join('; '))
    }
  }

  // ---- 3. everything the rehearsals wrote ----
  console.log('\nrehearsal data:')
  await wipe('scans', 'scans')
  await wipe('countedScans (trigger markers — must go with the scans)', 'countedScans')
  await wipe('tierUnlocks', 'tierUnlocks')
  await wipe('draws (rehearsal prize draws — they show in /admin history)', 'draws')
  await wipe('boothRatings', 'boothRatings')
  await wipe('boothRated', 'boothRated')
  await wipe('stats/ratings/items', 'stats/ratings/items')
  await wipe('surveyResponses (festival + booth surveys)', 'surveyResponses')
  await wipe('surveyTaken', 'surveyTaken')
  await wipe('rateLimits', 'rateLimits')
  await wipe('erasureRequests', 'erasureRequests')
  await wipe('pointAdjustmentPreviews (stale proposals)', 'pointAdjustmentPreviews')
  await wipe('pointAdjustmentState (apply cooldown + revision)', 'pointAdjustmentState')
  await wipe('stats/buckets/items (5-minute timeline)', 'stats/buckets/items')

  // The stock ledger: keep the load-in / restock / allowance rows for tiers that still exist —
  // they are what the closing figures reconcile against — and drop rehearsal hand-overs, voids,
  // and every row for a tier that has since been retired (explorer / voyager / globetrotter).
  const tiers = await db.collection('prizeTiers').get()
  const tierIds = new Set(tiers.docs.map((d) => d.id))
  const ledger = await db.collection('stockAdjustments').get()
  const stale = ledger.docs.filter((d) => {
    const r = d.data()
    return r.kind === 'redeem' || r.kind === 'void' || !tierIds.has(r.tierId)
  })
  console.log(`  ${act('delete')} ${pad(stale.length)}  stockAdjustments (redeem/void rows and retired tiers; ${ledger.size - stale.length} kept)`)
  for (const d of stale) {
    const r = d.data()
    console.log(`              ${String(r.kind).padEnd(8)} ${String(r.tierId).padEnd(18)} ${r.delta ?? ''}`)
  }
  if (COMMIT) await deleteDocs(stale)

  // ---- 4. reset in place ----
  console.log('\nreset in place:')
  const boothStats = await db.collection('stats/booths/items').get()
  const surveys = await db.collection('surveys').get()
  const booths = await db.collection('booths').get()
  const adjusted = booths.docs.filter((d) => d.data().boostPoints != null || d.data().boostUntil != null)

  console.log(`  ${act('reset')} ${pad(boothStats.size)}  stats/booths/items/* -> 0 stamps, rank cleared`)
  console.log(`  ${act('reset')} ${pad(adjusted.length)}  booths/* -> boostPoints and boostUntil cleared${adjusted.length ? '' : ' (none set)'}; scheduled values kept`)
  for (const t of tiers.docs) {
    const d = t.data()
    console.log(`  ${act('reset')} ${pad(1)}  prizeTiers/${t.id} -> stockRemaining ${d.stockRemaining} -> ${d.stockTotal}, sessionRemaining ${JSON.stringify(d.sessionRemaining ?? {})} -> (absent)`)
  }
  for (const s of surveys.docs) {
    console.log(`  ${act('reset')} ${pad(1)}  surveys/${s.id} -> responseCount ${s.data().responseCount ?? 0} -> 0`)
  }

  if (COMMIT) {
    const batch = db.batch()
    for (const t of tiers.docs) {
      batch.set(t.ref, { stockRemaining: t.data().stockTotal ?? 0, sessionRemaining: FieldValue.delete() }, { merge: true })
    }
    for (const s of surveys.docs) batch.set(s.ref, { responseCount: 0 }, { merge: true })
    for (const b of adjusted) batch.set(b.ref, { boostPoints: null, boostUntil: null }, { merge: true })
    await batch.commit()
    for (let i = 0; i < boothStats.docs.length; i += BATCH) {
      const b = db.batch()
      boothStats.docs.slice(i, i + BATCH).forEach((d) => b.set(d.ref, { stamps: 0, rank: null, byVisitorType: {}, byDay: {}, byHour: {}, lastStampAt: null }, { merge: true }))
      await b.commit()
    }
  }

  // ---- 5. counters, last ----
  console.log('\ncounters:')
  console.log(`  ${act('delete')} ${pad(1)}  counters/passport (numbering restarts at 0001)`)
  console.log(`  ${act('delete')} ${pad(1)}  stats/event (activeLast15m — the sweeper rewrites it within a minute)`)
  console.log(`  ${act('delete')} ${pad(STATS_SHARDS * 2)}  stats/event/shards/* and stats/demographics/shards/*`)

  if (COMMIT) {
    const batch = db.batch()
    batch.delete(db.doc('counters/passport'))
    batch.delete(db.doc('stats/event'))
    await batch.commit()

    console.log(`\ndraining the delete triggers before the shards are cleared for good`)
    console.log(`  (${visitors.length} visitor deletes each queue an onUserWrite that decrements a random shard)`)
    const stable = await clearShardsUntilStable()
    if (!stable) {
      console.error(`\n⚠ The shards were still being re-created after ${DRAIN_ROUNDS} rounds.`)
      console.error('  Re-run this script (dry run is fine to look, --commit to clear them) in a few minutes,')
      console.error('  or delete stats/event/shards/* and stats/demographics/shards/* by hand. Until then the')
      console.error('  dashboard may show negative visitor counts.')
      process.exitCode = 2
    }
  } else {
    console.log(`\n  on --commit these are cleared last and re-checked every ${DRAIN_WAIT_MS / 1000}s until two passes running`)
    console.log('  find them gone, because each visitor delete queues a trigger that writes a shard back.')
  }

  console.log(COMMIT
    ? '\nDone. Open /admin — every counter should read 0 and the readiness card should still show 76 booths and 1 tier.'
    : '\nDry run — nothing was written. Re-run with --commit to apply.')
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
