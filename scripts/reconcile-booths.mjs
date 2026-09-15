/**
 * Bring the live booths into line with the organisers' booth sheet AFTER it was renumbered.
 *
 *   node scripts/reconcile-booths.mjs            # dry run: prints every change, writes nothing
 *   node scripts/reconcile-booths.mjs --commit   # apply, once
 *
 * Needs `npm --prefix functions run build` first (firebase-admin lives under functions/) and
 * application-default credentials, like the seed and the cleanup script.
 *
 * SOURCE — the official booth list, the same sheet booths.data.ts was generated from:
 *   https://docs.google.com/spreadsheets/d/1YSl-NRrnJCRqgCQE8EtN3X-JazTP4krxe18n5mFaVK0/edit?gid=0
 *   csv: https://docs.google.com/spreadsheets/d/1YSl-NRrnJCRqgCQE8EtN3X-JazTP4krxe18n5mFaVK0/export?format=csv&gid=0
 * Columns: Booth No. | Host | Booth Type | Booth Name | Details | Tables | Chairs | Podium.
 * NOT the "Booth Exhibitor" sheet (1vYn7cKg…), which is a contact list with no booth numbers.
 * Verify before running:  curl -sL "<csv url>" | grep -E '^"?(ED5|ED7|ED10|FD50),'
 * should show ED5 = Taiwan Education Center, ED7 = GRD "MFU Go Global", ED10 = hospital
 * "Health Beyond Borders", FD50 = "A Sip of India". Roster below read from it 15 Sep 2026 08:20 ICT.
 *
 * What happened. The booths were seeded on 12 Sep 2026 with that sheet's codes as document ids.
 * By 15 Sep the sheet had been renumbered from ED5 onward (Taiwan EC is now ED5, the GRD prize
 * desk is ED7, not ED8, the SDA booths each moved one place) and about twenty booths renamed
 * (the Agro-Industry food tables now carry team names, "Waiting" became the School of
 * Medicine's real title, the hospital is "Health Beyond Borders", A Sip of India moved to FD50).
 *
 * Why this and not `npm run seed`. The seed writes every booth's fields onto the document with
 * the same id, so re-running it against a regenerated roster would silently put Taiwan EC's
 * name on the TOEFL organizer's booth, move the prize-desk flag off the screen GRD is already
 * running, and leave every organizer claim pointing at somebody else's table. This script does
 * the same field update but ALSO carries each booth's organizer to the document it moved to,
 * rewrites those people's custom claims, and re-points pending invitations — in one pass, from
 * one table, with a marker so it cannot run twice.
 *
 * What it touches: booths/{id} name/host/description/category/location/sortOrder/isPrizeDesk/
 * organizerUid; users/{uid}.boothId + Auth claims for affected organizers; invites with status
 * sent/opened. What it never touches: boothSecrets (a secret belongs to its document id, and the
 * booth screen fetches by id, so the codes keep working), points, active, activeDays, badges,
 * scans, stats.
 *
 * Safe today because the rehearsal data was wiped: zero scans reference a booth id. Do not run
 * this once real stamps exist — a stamp's boothId would then name the wrong booth.
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

const { db, auth, FieldValue } = await import('../functions/lib/lib.js')

const MARKER = db.doc('meta/boothReconcile-2026-09-15')

/**
 * The roster as the sheet reads on 15 Sep 2026. `movedFrom` is the document that held this
 * booth before the renumbering (its own id when it did not move; null for a brand-new entry,
 * FD32 "MANIFEST", which inherits nobody's organizer). Same table as functions/src/booths.data.ts.
 */
const ROSTER = [
 {
  "id": "ED1",
  "movedFrom": "ED1",
  "nameEn": "Australia Awards Mekong-Australia Partnership Scholarships (AA-MAP)",
  "nameTh": "Australia Awards Mekong-Australia Partnership Scholarships (AA-MAP)",
  "shortName": "AA-MAP",
  "hostUnit": "MAP SU, Australia Embassy",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Information on Australian education funding and opportunities",
  "isPrizeDesk": false,
  "sortOrder": 1
 },
 {
  "id": "ED2",
  "movedFrom": "ED2",
  "nameEn": "British Council Thailand",
  "nameTh": "British Council Thailand",
  "shortName": "British Council",
  "hostUnit": "British Council Thailand",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Information on UK education funding and opportunities",
  "isPrizeDesk": false,
  "sortOrder": 2
 },
 {
  "id": "ED3",
  "movedFrom": "ED3",
  "nameEn": "Campus France Thailand",
  "nameTh": "Campus France Thailand",
  "shortName": "Campus France",
  "hostUnit": "French Embassy",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Information on French education funding by Campus France Thailand",
  "isPrizeDesk": false,
  "sortOrder": 3
 },
 {
  "id": "ED4",
  "movedFrom": "ED4",
  "nameEn": "Fulbright Thailand",
  "nameTh": "Fulbright Thailand",
  "shortName": "Fulbright",
  "hostUnit": "Fulbright Thailand",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Information on U.S. education funding and opportunities (Thailand-U.S. Educational Foundation)",
  "isPrizeDesk": false,
  "sortOrder": 4
 },
 {
  "id": "ED5",
  "movedFrom": "ED6",
  "nameEn": "Taiwan Education Center, Thailand",
  "nameTh": "Taiwan Education Center, Thailand",
  "shortName": "Taiwan EC",
  "hostUnit": "Taiwan Education Center Thailand",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Information on Taiwan education funding and opportunities",
  "isPrizeDesk": false,
  "sortOrder": 5
 },
 {
  "id": "ED6",
  "movedFrom": "ED7",
  "nameEn": "TOEFL/IELTS Testing Center",
  "nameTh": "TOEFL/IELTS Testing Center",
  "shortName": "TOEFL/IELTS",
  "hostUnit": "Chiang Rai Rajabhat University",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "TOEFL and IELTS examination information",
  "isPrizeDesk": false,
  "sortOrder": 6
 },
 {
  "id": "ED7",
  "movedFrom": "ED8",
  "nameEn": "MFU Go Global",
  "nameTh": "MFU Go Global",
  "shortName": "MFU Go Global",
  "hostUnit": "GRD",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "International exchange programs and funding for MFU students",
  "isPrizeDesk": true,
  "sortOrder": 7
 },
 {
  "id": "ED8",
  "movedFrom": "ED9",
  "nameEn": "Match the International Internship",
  "nameTh": "Match the International Internship",
  "shortName": "Internships",
  "hostUnit": "Student Employment and Internship Division",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "International internship opportunities for MFU students",
  "isPrizeDesk": false,
  "sortOrder": 8
 },
 {
  "id": "ED9",
  "movedFrom": "ED11",
  "nameEn": "MFU Nursing | Go Global",
  "nameTh": "MFU Nursing | Go Global",
  "shortName": "Nursing Global",
  "hostUnit": "School of Nursing 2",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "International nursing education, student exchange, research, and partnerships",
  "isPrizeDesk": false,
  "sortOrder": 9
 },
 {
  "id": "ED10",
  "movedFrom": "ED12",
  "nameEn": "Health Beyond Borders",
  "nameTh": "Health Beyond Borders",
  "shortName": "Health Beyond",
  "hostUnit": "MFU Medical Center Hospital",
  "category": "wellness",
  "location": "Wellness",
  "descriptionEn": "Health services and wellness from Mae Fah Luang University Medical Center Hospital",
  "isPrizeDesk": false,
  "sortOrder": 10
 },
 {
  "id": "ED11",
  "movedFrom": "ED5",
  "nameEn": "Unlocking Nature, Decoding Cancer: From Bench to Bedside",
  "nameTh": "Unlocking Nature, Decoding Cancer: From Bench to Bedside",
  "shortName": "Decoding Cancer",
  "hostUnit": "School of Medicine",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Cancer research from the laboratory bench to patient care, by the School of Medicine",
  "isPrizeDesk": false,
  "sortOrder": 11
 },
 {
  "id": "ED12",
  "movedFrom": "ED10",
  "nameEn": "Eco-printing & Vegan Leather Workshop",
  "nameTh": "Eco-printing & Vegan Leather Workshop",
  "shortName": "Eco-printing",
  "hostUnit": "School of Science",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Innovation workshops on eco-printing and vegan leather",
  "isPrizeDesk": false,
  "sortOrder": 12
 },
 {
  "id": "ED13",
  "movedFrom": "ED13",
  "nameEn": "MFU Nursing | CPR Experience",
  "nameTh": "MFU Nursing | CPR Experience",
  "shortName": "CPR Experience",
  "hostUnit": "School of Nursing 1",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "CPR training through games, simulations, and hands-on practice",
  "isPrizeDesk": false,
  "sortOrder": 13
 },
 {
  "id": "ED14",
  "movedFrom": "ED15",
  "nameEn": "Lifelong Journey",
  "nameTh": "Lifelong Journey",
  "shortName": "Lifelong Journey",
  "hostUnit": "MLII",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Online courses in Chinese and Anatomy; VR innovation demonstrations",
  "isPrizeDesk": false,
  "sortOrder": 14
 },
 {
  "id": "ED15",
  "movedFrom": "ED16",
  "nameEn": "Global Compass",
  "nameTh": "Global Compass",
  "shortName": "Global Compass",
  "hostUnit": "Student Development Affairs 1",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Game-based activity exploring freedom with responsibility and respect",
  "isPrizeDesk": false,
  "sortOrder": 15
 },
 {
  "id": "ED16",
  "movedFrom": "ED17",
  "nameEn": "Act for Earth",
  "nameTh": "Act for Earth",
  "shortName": "Act for Earth",
  "hostUnit": "Student Development Affairs 2",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Game activity promoting environmental awareness and conservation",
  "isPrizeDesk": false,
  "sortOrder": 16
 },
 {
  "id": "ED17",
  "movedFrom": "ED18",
  "nameEn": "Touch to Connect",
  "nameTh": "Touch to Connect",
  "shortName": "Touch to Connect",
  "hostUnit": "Student Development Affairs 3",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Braille writing activity in Thai, Chinese, and English on stickers",
  "isPrizeDesk": false,
  "sortOrder": 17
 },
 {
  "id": "ED18",
  "movedFrom": "ED19",
  "nameEn": "Fund & Friends",
  "nameTh": "Fund & Friends",
  "shortName": "Fund & Friends",
  "hostUnit": "Student Development Affairs 4",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Information on international student welfare and scholarships with games",
  "isPrizeDesk": false,
  "sortOrder": 18
 },
 {
  "id": "ED19",
  "movedFrom": "ED14",
  "nameEn": "Find Your Personal Color",
  "nameTh": "Find Your Personal Color",
  "shortName": "Personal Color",
  "hostUnit": "School of Cosmetic Science",
  "category": "educational",
  "location": "Educational & Study Abroad",
  "descriptionEn": "Personal color analysis based on skin, hair, eye tone and undertone",
  "isPrizeDesk": false,
  "sortOrder": 19
 },
 {
  "id": "CL20",
  "movedFrom": "CL20",
  "nameEn": "Dress Like Chinese",
  "nameTh": "Dress Like Chinese",
  "shortName": "Dress Like Chinese",
  "hostUnit": "School of Sinology 1",
  "category": "cultural",
  "location": "Cultural",
  "descriptionEn": "Chinese culture learning through traditional clothing",
  "isPrizeDesk": false,
  "sortOrder": 20
 },
 {
  "id": "CL21",
  "movedFrom": "CL21",
  "nameEn": "Chinese Connection Knot",
  "nameTh": "Chinese Connection Knot",
  "shortName": "Chinese Knot",
  "hostUnit": "School of Sinology 2",
  "category": "cultural",
  "location": "Cultural",
  "descriptionEn": "Chinese culture learning through traditional knot-tying",
  "isPrizeDesk": false,
  "sortOrder": 21
 },
 {
  "id": "CL22",
  "movedFrom": "CL22",
  "nameEn": "Chinese Ink & Art",
  "nameTh": "Chinese Ink & Art",
  "shortName": "Chinese Ink & Art",
  "hostUnit": "Thai-Chinese Education Association",
  "category": "cultural",
  "location": "Cultural",
  "descriptionEn": "Chinese culture learning through brush painting",
  "isPrizeDesk": false,
  "sortOrder": 22
 },
 {
  "id": "CL23",
  "movedFrom": "CL23",
  "nameEn": "Dolanan Anak: Games, Songs & Traditions",
  "nameTh": "Dolanan Anak: Games, Songs & Traditions",
  "shortName": "Dolanan Anak",
  "hostUnit": "Anti-Aging and Regenerative Medicine",
  "category": "cultural",
  "location": "Cultural",
  "descriptionEn": "Indonesian (Central Java) culture learning through games and traditions",
  "isPrizeDesk": false,
  "sortOrder": 23
 },
 {
  "id": "CL24",
  "movedFrom": "CL24",
  "nameEn": "Lanna Spiderweb Flag Craft",
  "nameTh": "Lanna Spiderweb Flag Craft",
  "shortName": "Lanna Tung",
  "hostUnit": "Institute for Mekong Civilization, Art, Culture",
  "category": "cultural",
  "location": "Cultural",
  "descriptionEn": "Northern Thai culture learning through tung (spiderweb flag) weaving",
  "isPrizeDesk": false,
  "sortOrder": 24
 },
 {
  "id": "CL25",
  "movedFrom": "CL25",
  "nameEn": "Living Heritage in Action",
  "nameTh": "Living Heritage in Action",
  "shortName": "Living Heritage",
  "hostUnit": "School of Social Innovation",
  "category": "cultural",
  "location": "Cultural",
  "descriptionEn": "Indonesian culture through Angklung music and Tari Indang dance",
  "isPrizeDesk": false,
  "sortOrder": 25
 },
 {
  "id": "FD26",
  "movedFrom": "FD26",
  "nameEn": "Global Sips",
  "nameTh": "Global Sips",
  "shortName": "Global Sips",
  "hostUnit": "Tea and Coffee Institution",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "International culture learning through food and beverages",
  "isPrizeDesk": false,
  "sortOrder": 26
 },
 {
  "id": "FD27",
  "movedFrom": "FD27",
  "nameEn": "Izakaya – Japan",
  "nameTh": "Izakaya – Japan",
  "shortName": "Izakaya",
  "hostUnit": "School of Agricultural Industry 1",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Japanese healthy local cuisine (Izakaya)",
  "isPrizeDesk": false,
  "sortOrder": 27
 },
 {
  "id": "FD28",
  "movedFrom": "FD28",
  "nameEn": "Green Heritage – Myanmar",
  "nameTh": "Green Heritage – Myanmar",
  "shortName": "Green Heritage",
  "hostUnit": "School of Agricultural Industry 2",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Myanmar healthy local cuisine",
  "isPrizeDesk": false,
  "sortOrder": 28
 },
 {
  "id": "FD29",
  "movedFrom": "FD29",
  "nameEn": "Yellow Star – Vietnam",
  "nameTh": "Yellow Star – Vietnam",
  "shortName": "Yellow Star",
  "hostUnit": "School of Agricultural Industry 3",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Vietnamese healthy local cuisine (Noodle)",
  "isPrizeDesk": false,
  "sortOrder": 29
 },
 {
  "id": "FD30",
  "movedFrom": "FD30",
  "nameEn": "Khatulistiwa – Indonesia",
  "nameTh": "Khatulistiwa – Indonesia",
  "shortName": "Khatulistiwa",
  "hostUnit": "School of Agricultural Industry 4",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Indonesian healthy local cuisine (Nasi Liwet and Ayam Serundeng)",
  "isPrizeDesk": false,
  "sortOrder": 30
 },
 {
  "id": "FD31",
  "movedFrom": "FD31",
  "nameEn": "Team India – India",
  "nameTh": "Team India – India",
  "shortName": "Team India",
  "hostUnit": "School of Agricultural Industry 5",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Indian healthy local cuisine",
  "isPrizeDesk": false,
  "sortOrder": 31
 },
 {
  "id": "FD32",
  "movedFrom": null,
  "nameEn": "MANIFEST – Thailand",
  "nameTh": "MANIFEST – Thailand",
  "shortName": "MANIFEST",
  "hostUnit": "School of Agricultural Industry 6",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Thai healthy local cuisine",
  "isPrizeDesk": false,
  "sortOrder": 32
 },
 {
  "id": "FD33",
  "movedFrom": "FD33",
  "nameEn": "3nergy – Thailand",
  "nameTh": "3nergy – Thailand",
  "shortName": "3nergy",
  "hostUnit": "School of Agricultural Industry 7",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Thai healthy local cuisine",
  "isPrizeDesk": false,
  "sortOrder": 33
 },
 {
  "id": "FD34",
  "movedFrom": "FD34",
  "nameEn": "Plang Borderless – Thailand · Myanmar · Laos",
  "nameTh": "Plang Borderless – Thailand · Myanmar · Laos",
  "shortName": "Plang Borderless",
  "hostUnit": "School of Agricultural Industry 8",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Healthy local cuisine across Thailand, Myanmar and Laos",
  "isPrizeDesk": false,
  "sortOrder": 34
 },
 {
  "id": "FD35",
  "movedFrom": "FD35",
  "nameEn": "IndoIndy – Indonesia",
  "nameTh": "IndoIndy – Indonesia",
  "shortName": "IndoIndy",
  "hostUnit": "School of Agricultural Industry 9",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Indonesian healthy local cuisine",
  "isPrizeDesk": false,
  "sortOrder": 35
 },
 {
  "id": "FD36",
  "movedFrom": "FD36",
  "nameEn": "Agro-Industry Table 10 (to be confirmed)",
  "nameTh": "Agro-Industry Table 10 (to be confirmed)",
  "shortName": "Agro Table 10",
  "hostUnit": "School of Agricultural Industry 10",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Healthy local cuisine — team to be confirmed",
  "isPrizeDesk": false,
  "sortOrder": 36
 },
 {
  "id": "FD37",
  "movedFrom": "FD37",
  "nameEn": "Siam Spice",
  "nameTh": "Siam Spice",
  "shortName": "Siam Spice",
  "hostUnit": "School of Liberal Arts 1",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Thai international cuisine (Hor Mok Talay)",
  "isPrizeDesk": false,
  "sortOrder": 37
 },
 {
  "id": "FD38",
  "movedFrom": "FD38",
  "nameEn": "Flavors of Japan",
  "nameTh": "Flavors of Japan",
  "shortName": "Flavors of Japan",
  "hostUnit": "School of Liberal Arts 2",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Japanese international cuisine (Chirashi Sushi)",
  "isPrizeDesk": false,
  "sortOrder": 38
 },
 {
  "id": "FD39",
  "movedFrom": "FD39",
  "nameEn": "Nusantara Delights",
  "nameTh": "Nusantara Delights",
  "shortName": "Nusantara",
  "hostUnit": "School of Liberal Arts 3",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Indonesian international cuisine (Ayam Rendang)",
  "isPrizeDesk": false,
  "sortOrder": 39
 },
 {
  "id": "FD40",
  "movedFrom": "FD40",
  "nameEn": "Seoul TteokBokki",
  "nameTh": "Seoul TteokBokki",
  "shortName": "Seoul Tteokbokki",
  "hostUnit": "School of Liberal Arts 4",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Korean international cuisine (Spicy Rice Cakes)",
  "isPrizeDesk": false,
  "sortOrder": 40
 },
 {
  "id": "FD41",
  "movedFrom": "FD41",
  "nameEn": "The American Melting Pot",
  "nameTh": "The American Melting Pot",
  "shortName": "Melting Pot",
  "hostUnit": "School of Liberal Arts 5",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "American international cuisine (Cheesesteak Rolls, Caesar Salad)",
  "isPrizeDesk": false,
  "sortOrder": 41
 },
 {
  "id": "FD42",
  "movedFrom": "FD42",
  "nameEn": "Assorted Burmese Fritters",
  "nameTh": "Assorted Burmese Fritters",
  "shortName": "Burmese Fritters",
  "hostUnit": "School of Liberal Arts 6",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Burmese international cuisine (Dok Hto sticks)",
  "isPrizeDesk": false,
  "sortOrder": 42
 },
 {
  "id": "FD43",
  "movedFrom": "FD43",
  "nameEn": "Global Table — Korea",
  "nameTh": "Global Table — Korea",
  "shortName": "Korea",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Korean cuisine (hotteok, kimchi soup, fried chicken, tteokbokki)",
  "isPrizeDesk": false,
  "sortOrder": 43
 },
 {
  "id": "FD44",
  "movedFrom": "FD44",
  "nameEn": "Global Table — Japan",
  "nameTh": "Global Table — Japan",
  "shortName": "Japan",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Japanese cuisine (yakitori, mochi, yakisoba, sushi)",
  "isPrizeDesk": false,
  "sortOrder": 44
 },
 {
  "id": "FD45",
  "movedFrom": "FD45",
  "nameEn": "Global Table — Germany",
  "nameTh": "Global Table — Germany",
  "shortName": "Germany",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "German cuisine (potato salad, apple pastries)",
  "isPrizeDesk": false,
  "sortOrder": 45
 },
 {
  "id": "FD46",
  "movedFrom": "FD46",
  "nameEn": "Global Table — Indonesia",
  "nameTh": "Global Table — Indonesia",
  "shortName": "Indonesia",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Indonesian cuisine (Siomay steamed dumplings)",
  "isPrizeDesk": false,
  "sortOrder": 46
 },
 {
  "id": "FD47",
  "movedFrom": "FD47",
  "nameEn": "Global Table — Mexico",
  "nameTh": "Global Table — Mexico",
  "shortName": "Mexico",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Mexican cuisine (nachos, tacos, salsa)",
  "isPrizeDesk": false,
  "sortOrder": 47
 },
 {
  "id": "FD48",
  "movedFrom": "FD48",
  "nameEn": "Global Table — Czechia",
  "nameTh": "Global Table — Czechia",
  "shortName": "Czechia",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Czech cuisine (Bramborák potato pancakes)",
  "isPrizeDesk": false,
  "sortOrder": 48
 },
 {
  "id": "FD49",
  "movedFrom": "FD49",
  "nameEn": "Global Table — Bhutan",
  "nameTh": "Global Table — Bhutan",
  "shortName": "Bhutan",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Bhutanese cuisine (chili cheese stew with rice)",
  "isPrizeDesk": false,
  "sortOrder": 49
 },
 {
  "id": "FD50",
  "movedFrom": "FD32",
  "nameEn": "A Sip of India",
  "nameTh": "A Sip of India",
  "shortName": "A Sip of India",
  "hostUnit": "Consulate of India in Chiang Mai",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "International culture learning through Indian food",
  "isPrizeDesk": false,
  "sortOrder": 50
 },
 {
  "id": "FD51",
  "movedFrom": "FD51",
  "nameEn": "French Food Fair",
  "nameTh": "French Food Fair",
  "shortName": "French Food Fair",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "French cuisine (Poulet Basquaise, Crêpes)",
  "isPrizeDesk": false,
  "sortOrder": 51
 },
 {
  "id": "FD52",
  "movedFrom": "FD52",
  "nameEn": "Global Table — Thailand",
  "nameTh": "Global Table — Thailand",
  "shortName": "Thailand",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Thai cuisine",
  "isPrizeDesk": false,
  "sortOrder": 52
 },
 {
  "id": "FD53",
  "movedFrom": "FD53",
  "nameEn": "Global Table — China",
  "nameTh": "Global Table — China",
  "shortName": "China",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Chinese cuisine",
  "isPrizeDesk": false,
  "sortOrder": 53
 },
 {
  "id": "FD54",
  "movedFrom": "FD54",
  "nameEn": "Global Table — Myanmar: Assorted Noodle Salad",
  "nameTh": "Global Table — Myanmar: Assorted Noodle Salad",
  "shortName": "Noodle Salad",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Burmese assorted noodle salad street food",
  "isPrizeDesk": false,
  "sortOrder": 54
 },
 {
  "id": "FD55",
  "movedFrom": "FD55",
  "nameEn": "Global Table — Myanmar: Turmeric Sticky Rice",
  "nameTh": "Global Table — Myanmar: Turmeric Sticky Rice",
  "shortName": "Sticky Rice",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Burmese yellow sticky rice with turmeric",
  "isPrizeDesk": false,
  "sortOrder": 55
 },
 {
  "id": "FD56",
  "movedFrom": "FD56",
  "nameEn": "Global Table — Myanmar: Pyay Rice Salad",
  "nameTh": "Global Table — Myanmar: Pyay Rice Salad",
  "shortName": "Pyay Rice Salad",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Pyay-style rice salad from the Bago region",
  "isPrizeDesk": false,
  "sortOrder": 56
 },
 {
  "id": "FD57",
  "movedFrom": "FD57",
  "nameEn": "Global Table — Myanmar: Shan Table",
  "nameTh": "Global Table — Myanmar: Shan Table",
  "shortName": "Shan Table",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Shan tea leaf salad and Shan-Bamar stuffed tomatoes",
  "isPrizeDesk": false,
  "sortOrder": 57
 },
 {
  "id": "FD58",
  "movedFrom": "FD58",
  "nameEn": "Global Table — Myanmar: Tea Shop Fritters",
  "nameTh": "Global Table — Myanmar: Tea Shop Fritters",
  "shortName": "Tea Shop Fritters",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Burmese vegetable fritters from tea shop culture",
  "isPrizeDesk": false,
  "sortOrder": 58
 },
 {
  "id": "FD59",
  "movedFrom": "FD59",
  "nameEn": "Global Table — Myanmar: Desserts",
  "nameTh": "Global Table — Myanmar: Desserts",
  "shortName": "Myanmar Desserts",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Burmese desserts (sago soup, steamed banana)",
  "isPrizeDesk": false,
  "sortOrder": 59
 },
 {
  "id": "FD60",
  "movedFrom": "FD60",
  "nameEn": "Global Table — Myanmar: Rice Drop Dessert",
  "nameTh": "Global Table — Myanmar: Rice Drop Dessert",
  "shortName": "Rice Drop Dessert",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Burmese rice drop dessert with coconut milk",
  "isPrizeDesk": false,
  "sortOrder": 60
 },
 {
  "id": "FD61",
  "movedFrom": "FD61",
  "nameEn": "Global Table — Myanmar: Shan Rice Cake",
  "nameTh": "Global Table — Myanmar: Shan Rice Cake",
  "shortName": "Shan Rice Cake",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Shan steamed rice cake with garlic and chili oil",
  "isPrizeDesk": false,
  "sortOrder": 61
 },
 {
  "id": "FD62",
  "movedFrom": "FD62",
  "nameEn": "Global Table — Karen Curry",
  "nameTh": "Global Table — Karen Curry",
  "shortName": "Karen Curry",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Karen traditional curry with local herbs",
  "isPrizeDesk": false,
  "sortOrder": 62
 },
 {
  "id": "FD63",
  "movedFrom": "FD63",
  "nameEn": "Global Table — Myanmar: Rakhine Table",
  "nameTh": "Global Table — Myanmar: Rakhine Table",
  "shortName": "Rakhine Table",
  "hostUnit": "GRD",
  "category": "food",
  "location": "International Food & Culture",
  "descriptionEn": "Rakhine soup and anchovy salad from coastal Myanmar",
  "isPrizeDesk": false,
  "sortOrder": 63
 },
 {
  "id": "OPEN1",
  "movedFrom": "OPEN1",
  "nameEn": "Green Table",
  "nameTh": "Green Table",
  "shortName": "Green Table",
  "hostUnit": "M-Store x Zero Waste (Grace) 1",
  "category": "market",
  "location": "Open Space · Market",
  "descriptionEn": "Natural plant fiber plates and bowls from Gracz (100% sugarcane pulp)",
  "isPrizeDesk": false,
  "sortOrder": 64
 },
 {
  "id": "OPEN2",
  "movedFrom": "OPEN2",
  "nameEn": "M-Store",
  "nameTh": "M-Store",
  "shortName": "M-Store",
  "hostUnit": "M-Store x Zero Waste (Grace) 2",
  "category": "market",
  "location": "Open Space · Market",
  "descriptionEn": "MFU university products",
  "isPrizeDesk": false,
  "sortOrder": 65
 },
 {
  "id": "OPEN3",
  "movedFrom": "OPEN3",
  "nameEn": "ปะ ดิ มา กำ",
  "nameTh": "ปะ ดิ มา กำ",
  "shortName": "ปะ ดิ มา กำ",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Student workshops on entrepreneurship and creative crafts",
  "isPrizeDesk": false,
  "sortOrder": 66
 },
 {
  "id": "OPEN4",
  "movedFrom": "OPEN4",
  "nameEn": "Daisy Belle X Nadtasin MFU",
  "nameTh": "Daisy Belle X Nadtasin MFU",
  "shortName": "Daisy Belle",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Bag-making supplies, instruction, and hair accessories",
  "isPrizeDesk": false,
  "sortOrder": 67
 },
 {
  "id": "OPEN5",
  "movedFrom": "OPEN5",
  "nameEn": "¡LOTERÍA! — A Taste of Mexico",
  "nameTh": "¡LOTERÍA! — A Taste of Mexico",
  "shortName": "¡LOTERÍA!",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Traditional Mexican Lotería game with cultural education",
  "isPrizeDesk": false,
  "sortOrder": 68
 },
 {
  "id": "OPEN6",
  "movedFrom": "OPEN6",
  "nameEn": "Crochet and Embroidery",
  "nameTh": "Crochet and Embroidery",
  "shortName": "Crochet",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Student crochet and embroidery projects and sales",
  "isPrizeDesk": false,
  "sortOrder": 69
 },
 {
  "id": "OPEN7",
  "movedFrom": "OPEN7",
  "nameEn": "Model United Nations",
  "nameTh": "Model United Nations",
  "shortName": "MUN",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "MUN student activities and presentations",
  "isPrizeDesk": false,
  "sortOrder": 70
 },
 {
  "id": "OPEN8",
  "movedFrom": "OPEN8",
  "nameEn": "MFU Human Rights Club",
  "nameTh": "MFU Human Rights Club",
  "shortName": "Human Rights Club",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "MFU Human Rights Club activities",
  "isPrizeDesk": false,
  "sortOrder": 71
 },
 {
  "id": "OPEN9",
  "movedFrom": "OPEN9",
  "nameEn": "Maxim",
  "nameTh": "Maxim",
  "shortName": "Maxim",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Maxim student organization activities",
  "isPrizeDesk": false,
  "sortOrder": 72
 },
 {
  "id": "OPEN10",
  "movedFrom": "OPEN10",
  "nameEn": "Bounce & Win",
  "nameTh": "Bounce & Win",
  "shortName": "Bounce & Win",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Student game booth",
  "isPrizeDesk": false,
  "sortOrder": 73
 },
 {
  "id": "OPEN11",
  "movedFrom": "OPEN11",
  "nameEn": "Chinese Fortune Stick",
  "nameTh": "Chinese Fortune Stick",
  "shortName": "Fortune Stick",
  "hostUnit": "GRD",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Chinese fortune-stick (kau chim) cultural game",
  "isPrizeDesk": false,
  "sortOrder": 74
 },
 {
  "id": "OPEN12",
  "movedFrom": "OPEN12",
  "nameEn": "Plang Plang (ปลัง ปลัง)",
  "nameTh": "Plang Plang (ปลัง ปลัง)",
  "shortName": "Plang Plang",
  "hostUnit": "MFii",
  "category": "youth",
  "location": "Open Space · Youth",
  "descriptionEn": "Crispy Malabar-spinach rice topping by the Youth Savings project (Plang Plang)",
  "isPrizeDesk": false,
  "sortOrder": 75
 },
 {
  "id": "OPEN13",
  "movedFrom": "OPEN13",
  "nameEn": "First Aid Service",
  "nameTh": "First Aid Service",
  "shortName": "First Aid",
  "hostUnit": "MFU Medical Center Hospital",
  "category": "wellness",
  "location": "Wellness",
  "descriptionEn": "Medical first aid service station",
  "isPrizeDesk": false,
  "sortOrder": 76
 }
]

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'RECONCILING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)

  if ((await MARKER.get()).exists) {
    throw new Error('Already applied on this project (meta/boothReconcile-2026-09-15 exists). Refusing to run twice — the organizer moves are not idempotent.')
  }
  const scans = await db.collection('scans').count().get()
  if (scans.data().count > 0) {
    throw new Error(`${scans.data().count} scans exist. Their boothId would point at the wrong booth after a renumbering — stop.`)
  }

  const snap = await db.collection('booths').get()
  const before = new Map(snap.docs.map((d) => [d.id, d.data()]))
  const missing = ROSTER.filter((b) => !before.has(b.id))
  if (missing.length) throw new Error(`Booth documents missing: ${missing.map((b) => b.id).join(', ')} — seed first.`)
  const extra = [...before.keys()].filter((id) => !ROSTER.some((b) => b.id === id))
  if (extra.length) console.log(`note: ${extra.length} booth(s) not in the roster are left untouched: ${extra.join(', ')}`)

  // ---- 1. booth documents ----
  console.log('booths:')
  const batch = db.batch()
  let changed = 0
  for (const b of ROSTER) {
    const cur = before.get(b.id)
    const src = b.movedFrom ? before.get(b.movedFrom) : null
    const organizerUid = src?.organizerUid ?? null
    const patch = {
      nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.shortName, hostUnit: b.hostUnit,
      category: b.category, location: b.location, descriptionEn: b.descriptionEn,
      isPrizeDesk: b.isPrizeDesk, sortOrder: b.sortOrder, organizerUid,
    }
    const diff = Object.entries(patch).filter(([k, v]) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(v ?? null))
    if (!diff.length) continue
    changed++
    const moved = b.movedFrom && b.movedFrom !== b.id ? ` (was ${b.movedFrom}: "${src.nameEn}")` : b.movedFrom ? '' : ' (new entry)'
    console.log(`  ${b.id.padEnd(6)} "${cur.nameEn}" -> "${b.nameEn}"${moved}`)
    for (const [k, v] of diff) if (k !== 'nameEn' && k !== 'nameTh') console.log(`         ${k}: ${JSON.stringify(cur[k] ?? null)} -> ${JSON.stringify(v)}`)
    batch.set(db.doc(`booths/${b.id}`), patch, { merge: true })
  }
  console.log(`  ${changed} of ${ROSTER.length} booth documents change`)

  // ---- 2. organizers follow their booth ----
  console.log('\norganizers:')
  const organizers = await db.collection('users').where('role', '==', 'organizer').get()
  const newIdFor = (oldId) => ROSTER.find((b) => b.movedFrom === oldId)?.id ?? null
  const claimUpdates = []
  for (const u of organizers.docs) {
    const oldId = u.data().boothId
    if (!oldId) { console.log(`  ${u.id.slice(0, 8)}… ${u.data().displayName ?? ''}: no booth — untouched`); continue }
    const newId = newIdFor(oldId)
    if (!newId) { console.log(`  ⚠ ${u.id.slice(0, 8)}… ${u.data().displayName ?? ''}: booth ${oldId} has no place in the new roster — left as is, check by hand`); continue }
    if (newId === oldId) { console.log(`  ${u.id.slice(0, 8)}… ${u.data().displayName ?? ''}: ${oldId} stays ${oldId}`); continue }
    console.log(`  ${u.id.slice(0, 8)}… ${u.data().displayName ?? ''}: ${oldId} -> ${newId} ("${before.get(oldId).nameEn}")`)
    batch.set(u.ref, { boothId: newId }, { merge: true })
    claimUpdates.push({ uid: u.id, newId })
  }

  // ---- 3. pending invitations name the new id ----
  console.log('\ninvitations (sent/opened):')
  const invites = await db.collection('invites').where('status', 'in', ['sent', 'opened']).get()
  let inv = 0
  for (const d of invites.docs) {
    const oldId = d.data().boothId
    if (!oldId) continue
    const newId = newIdFor(oldId)
    if (!newId || newId === oldId) continue
    console.log(`  ${d.data().email}: ${oldId} -> ${newId}`)
    batch.set(d.ref, { boothId: newId }, { merge: true })
    inv++
  }
  if (!inv) console.log('  none to change')

  if (!COMMIT) { console.log('\nDry run — nothing was written. Re-run with --commit to apply.'); return }

  await batch.commit()
  for (const { uid, newId } of claimUpdates) {
    await auth.setCustomUserClaims(uid, { role: 'organizer', boothId: newId })
  }
  await MARKER.set({ appliedAt: FieldValue.serverTimestamp(), booths: changed, organizers: claimUpdates.length, invites: inv })
  await db.collection('auditLog').add({
    actorUid: 'script:reconcile-booths', action: 'reconcileBooths', targetType: 'booths', targetId: 'all',
    before: null, after: { booths: changed, organizers: claimUpdates.map((c) => c.uid), invites: inv }, createdAt: FieldValue.serverTimestamp(),
  })
  console.log(`\nDone. ${changed} booths updated, ${claimUpdates.length} organizer(s) moved, ${inv} invitation(s) re-pointed.`)
  console.log('Organizers whose booth moved must sign out and back in (or wait up to 15 min) for the new claim to reach their screen.')
  console.log('Check /admin/booths: the prize desk should be ED7 "MFU Go Global".')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
