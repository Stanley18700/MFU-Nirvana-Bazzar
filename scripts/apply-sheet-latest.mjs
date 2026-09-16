/**
 * Bring the live booths into line with the planner's sheet tab "Booths Details_Latest_06092026"
 * (received from Stanley 16 Sep 2026 evening).
 *
 *   node scripts/apply-sheet-latest.mjs            # dry run: prints every change, writes nothing
 *   node scripts/apply-sheet-latest.mjs --commit   # apply, ONCE (marker refuses a second run)
 *
 * Then ALWAYS:  node scripts/apply-scoring.mjs --commit   (points for the moved / new booths)
 *
 * Needs `npm --prefix functions run build` first and application-default credentials, like the
 * seed, cleanup and scoring scripts.
 *
 * SOURCES
 *   Planner's latest roster (names, numbers, the new Consulate booth):
 *     https://docs.google.com/spreadsheets/d/1vYn7cKg2Qu3RdZ-G0nmh3Zu6gknp23X3TGTpYs2ifhA/edit?gid=1830728977
 *   Dish column for the GRD Myanmar tables (same numbering as the tab above, read 16 Sep 19:30 ICT):
 *     https://docs.google.com/spreadsheets/d/1YSl-NRrnJCRqgCQE8EtN3X-JazTP4krxe18n5mFaVK0/edit?gid=0
 *
 * WHAT CHANGED IN THE SHEET, against the live app of 16 Sep 18:30
 *   New booth        Open Space 14  "A Taste of India" (Consulate of India in Chiang Mai) — food
 *   Second booth     ED15 is a second "Eco-printing & Vegan Leather Workshop" (School of Science)
 *   Renamed          ED10 "Health Beyond Borders" → "Borderless Health: Play Safe, Stay Sure"
 *                    FD50 "A Sip of India"        → "Global Table — India"
 *   Renumbered       Lifelong Journey ED14 → OPEN1;  MFU Nursing Go Global ED9 → ED14;
 *                    Global Compass ED15 → ED9;  Green Table OPEN1 → OPEN12;  M-Store OPEN2 → OPEN13;
 *                    youth booths OPEN3..12 → OPEN2..11 (Plang Plang now OPEN11);
 *                    Liberal Arts food FD37..42 ↔ GRD Myanmar tables FD58..63 (blocks swapped)
 *   Gone             First Aid has no number any more (OPEN13 was First Aid; now M-Store)
 *
 * HOW: document ids stay what the floor number says; the CONTENT moves. For every booth whose
 * number changed, this script copies the descriptive fields (names, host, descriptions, category,
 * artwork) from the document that held that booth yesterday onto the document with its new
 * number, carries the organizer with the booth (users/{uid}.boothId, Auth claim, open invites),
 * then applies the four literal edits and creates OPEN14 the way createBooth does (booth, secret,
 * stats row, boothCount).
 *
 * WHAT IT NEVER TOUCHES: points / temporaryPoints / pointsExpireAt / boost fields (apply-scoring
 * owns them — run it right after), active/activeDays except OPEN13 (switched on) and OPEN14 (new),
 * boothSecrets of existing booths, scans, stats, prize sessions.
 *
 * SAFETY: refuses to run twice (meta/sheetLatest-2026-09-16). Refuses while scans exist unless
 * --test-scans-ok is passed — every scan so far is rehearsal data (Stanley, 16 Sep) and Friday's
 * cleanup wipes them, but a stamp's boothId would name the wrong booth after this permutation.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const TEST_SCANS_OK = args.includes('--test-scans-ok')
if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}
const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db, auth, FieldValue, randomSecretB64 } = await import('../functions/lib/lib.js')

const MARKER = db.doc('meta/sheetLatest-2026-09-16')

/** The fields that ARE the booth's identity to a visitor; they travel with the booth. */
const CONTENT = ['nameEn', 'nameTh', 'shortName', 'hostUnit', 'location', 'descriptionEn', 'descriptionTh',
  'category', 'accentColor', 'badgeUrl', 'badgeThumbUrl', 'photoUrl', 'photoThumbUrl']

/** newId -> the id that held this booth's content until now. Only booths whose number changed. */
const MOVES = {
  ED9: 'ED15',    // Global Compass
  ED14: 'ED9',    // MFU Nursing | Go Global
  ED15: 'ED12',   // second Eco-printing booth — a copy of ED12's content
  OPEN1: 'ED14',  // Lifelong Journey
  OPEN2: 'OPEN3', OPEN3: 'OPEN4', OPEN4: 'OPEN5', OPEN5: 'OPEN6', OPEN6: 'OPEN7',   // youth booths shift down one
  OPEN7: 'OPEN8', OPEN8: 'OPEN9', OPEN9: 'OPEN10', OPEN10: 'OPEN11', OPEN11: 'OPEN12', // …Plang Plang now OPEN11
  OPEN12: 'OPEN1', // Green Table
  OPEN13: 'OPEN2', // M-Store (OPEN13 was the inactive First Aid entry)
  FD37: 'FD58', FD38: 'FD59', FD39: 'FD60', FD40: 'FD61', FD41: 'FD62', FD42: 'FD63', // GRD Myanmar tables
  FD58: 'FD37', FD59: 'FD38', FD60: 'FD39', FD61: 'FD40', FD62: 'FD41', FD63: 'FD42', // Liberal Arts food
}

/** Literal edits after the moves, straight from the sheet. */
const EDITS = {
  ED10: { nameEn: 'Borderless Health: Play Safe, Stay Sure', nameTh: 'สุขภาพไร้พรมแดน (Borderless Health: Play Safe, Stay Sure)' },
  ED15: { hostUnit: 'School of Science (booth 2)', shortName: 'Eco-print 2' },
  FD50: { nameEn: 'Global Table — India', nameTh: 'โต๊ะอาหารนานาชาติ — อินเดีย (Global Table — India)', hostUnit: 'GRD' },
  OPEN13: { active: true },
}

/** The one genuinely new booth. Points/activeDays come from apply-scoring right after. */
const NEW = {
  OPEN14: {
    nameEn: 'A Taste of India', nameTh: 'A Taste of India โดยกงสุลอินเดีย เชียงใหม่', shortName: 'India',
    hostUnit: 'Consulate of India in Chiang Mai', category: 'food',
    descriptionEn: 'Opens 13:00 (afternoon only) · Panipuri, the famous Indian street food, by the Consulate of India in Chiang Mai',
    descriptionTh: 'เปิด 13:00 (ช่วงบ่ายเท่านั้น) · ปานีปูรี อาหารข้างทางชื่อดังของอินเดีย โดยสถานกงสุลอินเดีย ประจำจังหวัดเชียงใหม่',
    zone: 'entrance', location: 'Entrance row', isPrizeDesk: false, active: true, points: 12, adjustmentExcluded: false,
  },
}

function show(v) { return JSON.stringify(v ?? null) }

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'APPLYING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  if ((await MARKER.get()).exists) {
    throw new Error('Already applied on this project (meta/sheetLatest-2026-09-16 exists). The moves are a permutation and cannot run twice.')
  }
  const scans = await db.collection('scans').count().get()
  if (scans.data().count > 0) {
    if (!TEST_SCANS_OK) throw new Error(`${scans.data().count} scans exist. After this permutation their boothId names the wrong booth. If they are all rehearsal scans, re-run with --test-scans-ok (Friday's cleanup wipes them anyway).`)
    console.log(`⚠ ${scans.data().count} scan(s) exist — proceeding because --test-scans-ok was passed. Wipe them before Friday 08:00 (cleanup-test-data.mjs --commit).\n`)
  }

  const evSnap = await db.collection('events').where('status', '==', 'live').limit(1).get()
  if (evSnap.empty) throw new Error('no live event')
  const ev = { id: evSnap.docs[0].id, ...evSnap.docs[0].data() }

  const snap = await db.collection('booths').where('eventId', '==', ev.id).get()
  const before = new Map(snap.docs.map((d) => [d.id, d.data()]))
  const needed = new Set([...Object.keys(MOVES), ...Object.values(MOVES), ...Object.keys(EDITS)])
  const missing = [...needed].filter((id) => !before.has(id))
  if (missing.length) throw new Error(`booth documents missing: ${missing.join(', ')}`)
  const clash = Object.keys(NEW).filter((id) => before.has(id))
  if (clash.length) throw new Error(`booth(s) already exist: ${clash.join(', ')} — check the sheet was not applied by hand`)

  const batch = db.batch()
  let changed = 0

  // ---- 1. content moves ----
  console.log('booths (content moves)')
  const patches = new Map()
  for (const [id, from] of Object.entries(MOVES)) {
    const src = before.get(from)
    const patch = Object.fromEntries(CONTENT.map((k) => [k, src[k] ?? null]))
    // ED15 is a copy of ED12, not a move: ED12 keeps its own content and organizer.
    patch.organizerUid = id === 'ED15' ? null : src.organizerUid ?? null
    patches.set(id, patch)
  }
  // ---- 2. literal edits ----
  for (const [id, edit] of Object.entries(EDITS)) patches.set(id, { ...(patches.get(id) ?? {}), ...edit })

  for (const [id, patch] of patches) {
    const cur = before.get(id)
    const diff = Object.entries(patch).filter(([k, v]) => show(cur[k]) !== show(v))
    if (!diff.length) continue
    changed++
    const from = MOVES[id]
    const tag = from ? (id === 'ED15' ? ` (copy of ${from})` : ` (was ${from})`) : ''
    console.log(`  ${id.padEnd(7)} "${cur.nameEn}" → "${patch.nameEn ?? cur.nameEn}"${tag}`)
    for (const [k, v] of diff) if (!['nameEn', 'nameTh', 'descriptionEn', 'descriptionTh'].includes(k)) console.log(`          ${k}: ${show(cur[k])} → ${show(v)}`)
    batch.set(db.doc(`booths/${id}`), patch, { merge: true })
  }

  // ---- 3. the new booth, the way createBooth does it ----
  console.log('\nnew booths')
  for (const [id, b] of Object.entries(NEW)) {
    changed++
    const doc = {
      eventId: ev.id, ...b,
      accentColor: before.get('FD50')?.accentColor ?? '#17414E',
      activeDays: [...(ev.days ?? [])],
      sortOrder: Math.max(0, ...[...before.values()].map((x) => x.sortOrder ?? 0)) + 1,
      organizerUid: null, badgeUrl: null, badgeThumbUrl: null, photoUrl: null, photoThumbUrl: null,
      createdAt: FieldValue.serverTimestamp(),
    }
    console.log(`  ${id.padEnd(7)} "${b.nameEn}" — ${b.hostUnit}, ${b.category}, ${b.points} points, days ${show(doc.activeDays)}`)
    batch.set(db.doc(`booths/${id}`), doc)
    batch.set(db.doc(`boothSecrets/${id}`), { secret: randomSecretB64(), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: 'script:apply-sheet-latest' })
    batch.set(db.doc(`stats/booths/items/${id}`), { boothId: id, stamps: 0, byVisitorType: {}, byDay: {}, byHour: {} }, { merge: true })
    batch.set(db.doc(`events/${ev.id}`), { boothCount: FieldValue.increment(1) }, { merge: true })
  }

  // ---- 4. organizers and invitations follow their booth ----
  console.log('\norganizers')
  const newIdFor = (oldId) => Object.entries(MOVES).find(([id, from]) => from === oldId && id !== 'ED15')?.[0] ?? null
  const organizers = await db.collection('users').where('role', '==', 'organizer').get()
  const claimUpdates = []
  for (const u of organizers.docs) {
    const oldId = u.data().boothId
    if (!oldId) continue
    const newId = newIdFor(oldId)
    if (!newId || newId === oldId) { console.log(`  ${u.data().displayName ?? u.id.slice(0, 8)}: ${oldId} stays`); continue }
    console.log(`  ${u.data().displayName ?? u.id.slice(0, 8)}: ${oldId} → ${newId} ("${before.get(oldId).nameEn}")`)
    batch.set(u.ref, { boothId: newId }, { merge: true })
    claimUpdates.push({ uid: u.id, newId })
  }
  if (!organizers.size) console.log('  none')
  const invites = await db.collection('invites').where('status', 'in', ['sent', 'opened']).get()
  let inv = 0
  for (const d of invites.docs) {
    const oldId = d.data().boothId
    const newId = oldId ? newIdFor(oldId) : null
    if (!newId || newId === oldId) continue
    console.log(`  invite ${d.data().email}: ${oldId} → ${newId}`)
    batch.set(d.ref, { boothId: newId }, { merge: true })
    inv++
  }

  console.log(`\n${changed} booth document(s) change; ${claimUpdates.length} organizer(s) move; ${inv} invitation(s) re-pointed.`)
  if (!COMMIT) { console.log('\nDry run — nothing was written. Re-run with --commit to apply.'); return }

  await batch.commit()
  for (const { uid, newId } of claimUpdates) await auth.setCustomUserClaims(uid, { role: 'organizer', boothId: newId })
  await MARKER.set({ appliedAt: FieldValue.serverTimestamp(), booths: changed, organizers: claimUpdates.length, invites: inv })
  await db.collection('auditLog').add({
    actorUid: 'script:apply-sheet-latest', action: 'applySheetLatest', targetType: 'booths', targetId: 'all',
    before: null, after: { moves: MOVES, edits: Object.keys(EDITS), created: Object.keys(NEW), organizers: claimUpdates.map((c) => c.uid), invites: inv },
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log('\nDone. NOW RUN:  node scripts/apply-scoring.mjs --commit')
  console.log('(it sets 27/15 on OPEN13, 27/16 on ED15, 28 on OPEN11 and 27 on OPEN12, 12 on OPEN14 — until then those five show old values)')
  console.log('Organizers whose booth moved must sign out and in again (or wait up to 15 min) for the new claim.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
