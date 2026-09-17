/**
 * Set a prize tier's per-session allowance and its audit pool to an exact pair of figures.
 *
 *   node scripts/set-prize-allowance.mjs                      # dry run: prints the change, writes nothing
 *   node scripts/set-prize-allowance.mjs --commit             # apply
 *   node scripts/set-prize-allowance.mjs --per-session=25 --total=50 --commit
 *
 * Needs application-default credentials (SETUP.md §4) and `functions/lib` built
 * (`npm --prefix functions run build`), like the seed, cleanup and scoring scripts.
 *
 * WHY THIS EXISTS RATHER THAN A BUTTON. Three callables touch stock and none of them can do
 * this (functions/src/admin.ts):
 *
 *   savePrizePolicy       writes stockTotal only when the tier is being CREATED (`if (!prev)`),
 *                         so it silently ignores the figure on a live tier — and it rebuilds
 *                         every tierUnlock as a side effect, which is not something to set off
 *                         mid-event.
 *   setSessionAllowance   derives the pool from the allowance: `delta = (new - old) * days *
 *                         sessions`. With three event days and two sessions that is six windows,
 *                         so asking for 25 per session moves a 300 pool to 150 — never to 50.
 *   adjustStock           moves the pool by a delta but insists on an OPEN session, and refuses
 *                         to take the current one below zero.
 *
 * The organisers' figure for 2026-09-18 is 25 per session over the day's two windows — am and
 * pm — which is 50 gifts. `stockPerSession` is the only number the desk actually spends against
 * (`sessionStockRemaining`, shared/model.ts); `stockTotal`/`stockRemaining` are the audit pair
 * the admin dashboard divides for its "x of y left" reading, so they are set to match rather
 * than left describing a six-window event that is not happening.
 *
 * `sessionRemaining` is DELETED, never set to `{}`: an absent key is how "this window is
 * untouched, therefore full" is written everywhere else (see `resetTierStock` in
 * functions/src/event.ts), and a merge with an empty map would leave stale keys behind.
 *
 * ⚠ Run this AFTER `cleanup-test-data.mjs`, not before. That script also clears
 * `sessionRemaining`, so running it afterwards would not undo this — but it resets
 * `stockRemaining` to `stockTotal`, and doing that to the OLD total would put the pool back to
 * 300. Order: clean up, then set the allowance, then read the tier back.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
if (args.includes('--emulator')) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'

const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.slice(name.length + 3)) : fallback
}
const TIER = args.find((a) => a.startsWith('--tier='))?.slice('--tier='.length) ?? 'global-passport'
const PER_SESSION = flag('per-session', 25)
const TOTAL = flag('total', 50)

if (!Number.isInteger(PER_SESSION) || PER_SESSION < 0) throw new Error('--per-session must be a whole number ≥ 0')
if (!Number.isInteger(TOTAL) || TOTAL < 0) throw new Error('--total must be a whole number ≥ 0')

const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db, FieldValue } = await import('../functions/lib/lib.js')
const { DEFAULT_PRIZE_SESSIONS } = await import('../functions/lib/shared/model.js')

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'SETTING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  const ref = db.doc(`prizeTiers/${TIER}`)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`prizeTiers/${TIER} does not exist — check --tier.`)
  const t = snap.data()

  // The windows the desk will actually open, so the numbers below can be checked by eye rather
  // than taken on trust.
  const events = await db.collection('events').where('status', '==', 'live').get()
  const ev = events.docs[0]?.data()
  const sessions = ev?.prizeSessions?.length ? ev.prizeSessions : DEFAULT_PRIZE_SESSIONS
  const days = ev?.days ?? []

  console.log(`tier            ${TIER}  "${t.name ?? t.reward ?? ''}"`)
  console.log(`threshold       ${t.thresholdPoints} points`)
  console.log(`event days      ${JSON.stringify(days)}`)
  console.log(`prize sessions  ${sessions.map((s) => `${s.id} ${String(Math.floor(s.startMinute / 60)).padStart(2, '0')}:${String(s.startMinute % 60).padStart(2, '0')}-${String(Math.floor(s.endMinute / 60)).padStart(2, '0')}:${String(s.endMinute % 60).padStart(2, '0')}`).join(', ')}`)
  console.log()
  console.log(`  stockPerSession    ${t.stockPerSession ?? '(unset)'}  ->  ${PER_SESSION}`)
  console.log(`  stockTotal         ${t.stockTotal ?? 0}  ->  ${TOTAL}`)
  console.log(`  stockRemaining     ${t.stockRemaining ?? 0}  ->  ${TOTAL}`)
  console.log(`  sessionRemaining   ${JSON.stringify(t.sessionRemaining ?? {})}  ->  (deleted: every window full)`)
  console.log()

  const perDay = PER_SESSION * sessions.length
  console.log(`So on any one event day the desk can hand over ${sessions.length} x ${PER_SESSION} = ${perDay} gifts.`)
  if (perDay !== TOTAL) {
    console.log(`⚠ That is not the same as the ${TOTAL} the pool claims. The pool is only an audit figure —`)
    console.log(`  the desk spends against the per-session allowance — but the /admin reading will look odd.`)
    console.log(`  Pass --total=${perDay} if a single event day is what you mean.`)
  }

  if (!COMMIT) {
    console.log('\nDry run — nothing was written. Re-run with --commit to apply.')
    return
  }

  await ref.set({
    stockPerSession: PER_SESSION,
    stockTotal: TOTAL,
    stockRemaining: TOTAL,
    sessionRemaining: FieldValue.delete(),
  }, { merge: true })

  const after = (await ref.get()).data()
  console.log('written. reading back:')
  console.log(`  stockPerSession ${after.stockPerSession} · stockTotal ${after.stockTotal} · stockRemaining ${after.stockRemaining} · sessionRemaining ${JSON.stringify(after.sessionRemaining ?? '(absent)')}`)
  console.log('\nDone. Check /admin/prizes — the row should read the new pair, and every session full.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
