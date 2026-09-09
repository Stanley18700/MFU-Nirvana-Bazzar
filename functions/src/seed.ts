/**
 * Seed the event, 12 booths (with secrets), the default prize policy and reference data.
 *
 *   npm run seed                 -> against the real project (needs `gcloud auth application-default login`
 *                                   or GOOGLE_APPLICATION_CREDENTIALS)
 *   npm run seed:emulator        -> against the local emulator
 *   node lib/seed.js --admin UID -> also make an existing auth user admin
 *
 * Idempotent: existing booths/tiers keep their secrets and stock.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'
import { ACCENTS, DEFAULT_PASSPORT_PREFIX, EVENT_DAYS, EVENT_ID, ZONE_POINTS, Zone } from './shared/model'

const args = process.argv.slice(2)
if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? readFirebaserc()
initializeApp({ projectId })
const db = getFirestore()

function readFirebaserc(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rc = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', '..', '.firebaserc'), 'utf8')
    return JSON.parse(rc).projects.default
  } catch {
    return 'mfu-passport'
  }
}

const BOOTHS: Array<{ id: string; nameEn: string; nameTh: string; short: string; host: string; location: string; zone: Zone; prize?: boolean; days?: string[] }> = [
  { id: 'booth-01', nameEn: 'Applied Digital Technology', nameTh: 'เทคโนโลยีดิจิทัลประยุกต์', short: 'ADT', host: 'School of Applied Digital Technology', location: 'Hall A · Entrance', zone: 'entrance', prize: true },
  { id: 'booth-02', nameEn: 'Liberal Arts', nameTh: 'ศิลปศาสตร์', short: 'LA', host: 'School of Liberal Arts', location: 'Hall A · Entrance', zone: 'entrance' },
  { id: 'booth-03', nameEn: 'Management', nameTh: 'การจัดการ', short: 'MGT', host: 'School of Management', location: 'Hall A · Entrance', zone: 'entrance' },
  { id: 'booth-04', nameEn: 'Sinology', nameTh: 'จีนวิทยา', short: 'SINO', host: 'School of Sinology', location: 'Hall A · Middle', zone: 'middle' },
  { id: 'booth-05', nameEn: 'Law', nameTh: 'นิติศาสตร์', short: 'LAW', host: 'School of Law', location: 'Hall A · Middle', zone: 'middle' },
  { id: 'booth-06', nameEn: 'Cosmetic Science', nameTh: 'วิทยาศาสตร์เครื่องสำอาง', short: 'COS', host: 'School of Cosmetic Science', location: 'Hall A · Middle', zone: 'middle' },
  { id: 'booth-07', nameEn: 'Health Science', nameTh: 'วิทยาศาสตร์สุขภาพ', short: 'HS', host: 'School of Health Science', location: 'Hall A · Middle', zone: 'middle' },
  { id: 'booth-08', nameEn: 'Agro-Industry', nameTh: 'อุตสาหกรรมเกษตร', short: 'AGRO', host: 'School of Agro-Industry', location: 'Hall B · Far corner', zone: 'far', days: [EVENT_DAYS[0], EVENT_DAYS[1]] },
  { id: 'booth-09', nameEn: 'Nursing', nameTh: 'พยาบาลศาสตร์', short: 'NUR', host: 'School of Nursing', location: 'Hall B · Far corner', zone: 'far' },
  { id: 'booth-10', nameEn: 'Integrative Medicine', nameTh: 'การแพทย์บูรณาการ', short: 'IM', host: 'School of Integrative Medicine', location: 'Hall B · Far corner', zone: 'far' },
  { id: 'booth-11', nameEn: 'Social Innovation', nameTh: 'นวัตกรรมสังคม', short: 'SI', host: 'School of Social Innovation', location: 'Hall B · Far corner', zone: 'far', days: [EVENT_DAYS[1], EVENT_DAYS[2]] },
  { id: 'booth-12', nameEn: 'Office of International Affairs', nameTh: 'ส่วนพัฒนาความสัมพันธ์ระหว่างประเทศ', short: 'OIA', host: 'Office of International Affairs', location: 'Hall B · Stage', zone: 'far' },
]

const TIERS = [
  { id: 'explorer', name: 'Explorer', thresholdPoints: 50, reward: 'A souvenir on the spot', stockTotal: 600, grantsDrawEntry: false },
  { id: 'voyager', name: 'Voyager', thresholdPoints: 100, reward: 'A larger souvenir', stockTotal: 250, grantsDrawEntry: false },
  { id: 'globetrotter', name: 'Globetrotter', thresholdPoints: 150, reward: 'Special souvenir + entry to the closing stage draw', stockTotal: 120, grantsDrawEntry: true },
]

async function main() {
  console.log(`Seeding project ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ''}`)

  await db.doc(`events/${EVENT_ID}`).set({
    nameTh: 'เทศกาลนานาชาติ MFU 2026', nameEn: 'MFU International Festival 2026',
    startsAt: Timestamp.fromDate(new Date('2026-09-16T09:00:00+07:00')),
    endsAt: Timestamp.fromDate(new Date('2026-09-18T16:00:00+07:00')),
    qrPeriodSeconds: 20, active: true, boothCount: BOOTHS.length, createdAt: FieldValue.serverTimestamp(),
    // The event is data, not a constant, so an admin can archive it and create the next one
    // from /admin/event without a redeploy.
    days: [...EVENT_DAYS], passportPrefix: DEFAULT_PASSPORT_PREFIX, zonePoints: { ...ZONE_POINTS }, status: 'live',
  }, { merge: true })

  for (const [i, b] of BOOTHS.entries()) {
    const ref = db.doc(`booths/${b.id}`)
    const exists = (await ref.get()).exists
    await ref.set({
      eventId: EVENT_ID, nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.short, hostUnit: b.host, location: b.location,
      descriptionEn: `Visit the ${b.nameEn} booth to join a short activity and collect this stamp.`, descriptionTh: '',
      accentColor: ACCENTS[i % ACCENTS.length], points: ZONE_POINTS[b.zone], zone: b.zone,
      badgeUrl: null, badgeThumbUrl: null, photoUrl: null, photoThumbUrl: null,
      activeDays: b.days ?? [...EVENT_DAYS], isPrizeDesk: !!b.prize, active: true, sortOrder: i + 1,
      ...(exists ? {} : { organizerUid: null, createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    const sRef = db.doc(`boothSecrets/${b.id}`)
    if (!(await sRef.get()).exists) {
      await sRef.set({ secret: randomBytes(32).toString('base64'), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: 'seed' })
    }
    await db.doc(`stats/booths/items/${b.id}`).set({ boothId: b.id, stamps: FieldValue.increment(0), byVisitorType: {}, byDay: {}, byHour: {} }, { merge: true })
  }

  for (const [i, t] of TIERS.entries()) {
    const ref = db.doc(`prizeTiers/${t.id}`)
    const exists = (await ref.get()).exists
    await ref.set({
      eventId: EVENT_ID, name: t.name, thresholdPoints: t.thresholdPoints, reward: t.reward, grantsDrawEntry: t.grantsDrawEntry,
      active: true, sortOrder: i + 1, outOfStockNoteEn: 'This prize has run out — please ask at the Office of International Affairs booth.', outOfStockNoteTh: '',
      ...(exists ? {} : { stockTotal: t.stockTotal, stockRemaining: t.stockTotal }),
    }, { merge: true })
    if (!exists) {
      await db.collection('stockAdjustments').add({ tierId: t.id, delta: t.stockTotal, reason: 'load-in (seed)', actorUid: 'seed', kind: 'load-in', createdAt: FieldValue.serverTimestamp() })
    }
  }

  await db.doc('refData/institutions').set({ list: [
    'MFU', 'Chiang Rai Rajabhat University', 'Rajamangala University of Technology Lanna (Chiang Rai)', 'Chiang Mai University',
    'Chulalongkorn University', 'Mahidol University', 'Thammasat University', 'Kasetsart University', 'Khon Kaen University',
    'Prince of Songkla University', 'Naresuan University', 'University of Phayao', 'Yunnan University', 'Kunming University of Science and Technology',
    'National University of Laos', 'University of Yangon', 'Royal University of Phnom Penh', 'Vietnam National University', 'Tribhuvan University', 'Other',
  ] })
  await db.doc('refData/mfuSchools').set({ list: [
    'School of Agro-Industry', 'School of Applied Digital Technology', 'School of Cosmetic Science', 'School of Dentistry', 'School of Health Science',
    'School of Integrative Medicine', 'School of Law', 'School of Liberal Arts', 'School of Management', 'School of Medicine', 'School of Nursing',
    'School of Science', 'School of Sinology', 'School of Social Innovation', 'Staff / Office', 'Other',
  ] })
  // §4.1 — a starting point, to be reviewed by the Office of International Affairs. Alphabetical, not by population.
  await db.doc('refData/ethnicGroups').set({
    MM: ['Bamar', 'Chin', 'Chinese-Myanmar', 'Danu', 'Indian-Myanmar', 'Kachin', 'Karen (Kayin)', 'Kayah', 'Mon', 'Pa-O', 'Palaung (Ta\'ang)', 'Rakhine', 'Rohingya', 'Shan', 'Wa'],
    TH: ['Akha', 'Central Thai', 'Hmong', 'Isan', 'Karen', 'Lahu', 'Lisu', 'Mien (Yao)', 'Northern Thai (Lanna)', 'Southern Thai', 'Tai Lue', 'Tai Yai (Shan)', 'Thai Malay', 'Thai-Chinese'],
    CN: ['Dai', 'Han', 'Hui', 'Miao', 'Tibetan', 'Uyghur', 'Yi', 'Zhuang'],
    LA: ['Hmong', 'Khmu', 'Lao Loum', 'Lao Soung', 'Lao Theung'],
    NP: ['Bahun', 'Chhetri', 'Gurung', 'Magar', 'Newar', 'Rai', 'Sherpa', 'Tamang', 'Tharu'],
    IN: ['Assamese', 'Bengali', 'Gujarati', 'Hindi-speaking', 'Kannada', 'Malayali', 'Marathi', 'Punjabi', 'Tamil', 'Telugu'],
    BT: ['Lhotshampa', 'Ngalop', 'Sharchop'],
    KH: ['Cham', 'Chinese-Cambodian', 'Khmer', 'Vietnamese-Cambodian'],
    VN: ['Hmong', 'Khmer Krom', 'Kinh', 'Muong', 'Nung', 'Tay', 'Thai'],
  })

  const adminIdx = args.indexOf('--admin')
  if (adminIdx >= 0 && args[adminIdx + 1]) {
    const uid = args[adminIdx + 1]
    await getAuth().setCustomUserClaims(uid, { role: 'admin' })
    await db.doc(`users/${uid}`).set({
      role: 'admin', displayName: 'Admin', contact: `admin-${uid}`, visitorType: 'staff', institution: 'MFU', countryCode: 'TH', isInternational: false,
      stampCount: 0, points: 0, stampedBoothIds: [], daysAttended: [], createdAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    console.log(`Made ${uid} an admin`)
  }
  console.log(`Seeded ${BOOTHS.length} booths, ${TIERS.length} tiers, reference data.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
