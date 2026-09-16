/**
 * Give every booth a Thai name (where the organisers' sheet has one) and a Thai description,
 * so a visitor who switches the app to ไทย no longer reads the English text through `pick()`.
 *
 *   node scripts/set-thai-booth-text.mjs            # dry run: prints every change, writes nothing
 *   node scripts/set-thai-booth-text.mjs --commit   # apply (idempotent — safe to re-run)
 *
 * Needs `npm --prefix functions run build` first (firebase-admin lives under functions/) and
 * application-default credentials, like the seed, cleanup and reconcile scripts.
 *
 * SOURCE — the Thai columns of the official booth sheet (Booths tab, gid=0, read 15 Sep 2026
 * evening) and the Thai programme posters of 15 Sep 2026. Where the sheet has no Thai title the
 * English name is kept (nameTh untouched) and only descriptionTh is written.
 *
 * What it touches: booths/{id}.nameTh and booths/{id}.descriptionTh — nothing else. It never
 * changes ids, English text, points, activeDays, organizers or secrets, so it is safe to run
 * during the event. Food booths (FD26–FD63) get the sheet's own generic Thai line plus the
 * "opens 13:00" note that their English descriptions carry; no menus, per GRD's wish.
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

const FOOD_NOTE = 'เปิด 13.00 น. (ช่วงบ่ายเท่านั้น) · '
const AGRO = FOOD_NOTE + 'บูธเรียนรู้วัฒนธรรมนานาชาติผ่านอาหารเพื่อสุขภาพ โดยสำนักวิชาอุตสาหกรรมเกษตร'
const LIBARTS = FOOD_NOTE + 'บูธเรียนรู้วัฒนธรรมนานาชาติผ่านอาหารนานาชาติ โดยสำนักวิชาศิลปศาสตร์'
const GRD_TABLE = FOOD_NOTE + 'บูธเรียนรู้วัฒนธรรมนานาชาติผ่านอาหารนานาชาติ โดยส่วนพัฒนาความสัมพันธ์ระหว่างประเทศ'
const YOUTH = ' (บูธเยาวชน)'
const gt = (th, en) => `โต๊ะอาหารนานาชาติ — ${th} (Global Table — ${en})`

/** [id, nameTh or null to keep, descriptionTh] */
const TEXT = [
  ['ED1', null, 'ข้อมูลทุนการศึกษาและโอกาสศึกษาต่อประเทศออสเตรเลีย (Australia Awards) โดย Mekong-Australia Partnership Support Unit'],
  ['ED2', null, 'ข้อมูลทุนการศึกษาและโอกาสศึกษาต่อสหราชอาณาจักร โดย British Council Thailand'],
  ['ED3', null, 'ข้อมูลทุนและโอกาสศึกษาต่อประเทศฝรั่งเศส โดย Campus France Thailand หน่วยงานแนะแนวการศึกษาต่อฝรั่งเศสของรัฐบาลฝรั่งเศส'],
  ['ED4', null, 'ข้อมูลทุนการศึกษาและโอกาสศึกษาต่อสหรัฐอเมริกา โดย Fulbright Thailand'],
  ['ED5', 'ศูนย์แนะแนวการศึกษาไต้หวัน ประจำประเทศไทย (Taiwan Education Center)', 'ข้อมูลทุนการศึกษาและโอกาสศึกษาต่อไต้หวัน'],
  ['ED6', 'ศูนย์สอบ TOEFL/IELTS โดยมหาวิทยาลัยราชภัฏเชียงราย', 'ประชาสัมพันธ์ศูนย์สอบ TOEFL และ IELTS ของมหาวิทยาลัยราชภัฏเชียงราย'],
  ['ED7', 'MFU Go Global (ส่วนพัฒนาความสัมพันธ์ระหว่างประเทศ)', 'ข้อมูลทุนและโครงการแลกเปลี่ยนในต่างประเทศสำหรับนักศึกษา มฟล.'],
  ['ED8', 'ฝึกงานให้ไกล ไปให้ทั่วโลก (Match the International Internship)', 'ข้อมูลทุนและโอกาสฝึกงานในต่างประเทศของนักศึกษา มฟล. โดยส่วนจัดหางานและฝึกงานของนักศึกษา'],
  ['ED9', 'พยาบาล มฟล. สู่สากล (MFU Nursing | Go Global)', 'การศึกษาพยาบาลนานาชาติ การแลกเปลี่ยนนักศึกษา งานวิจัย และความร่วมมือระหว่างประเทศ โดยสำนักวิชาพยาบาลศาสตร์'],
  ['ED10', 'สุขภาพไร้พรมแดน (Health Beyond Borders)', 'บริการสุขภาพและสุขภาวะ โดยโรงพยาบาลศูนย์การแพทย์มหาวิทยาลัยแม่ฟ้าหลวง'],
  ['ED11', null, 'งานวิจัยโรคมะเร็งจากห้องปฏิบัติการสู่การดูแลผู้ป่วย โดยสำนักวิชาแพทยศาสตร์'],
  ['ED12', 'เวิร์กช็อป Eco-printing และหนังวีแกน (Vegan Leather)', 'เวิร์กช็อปการสร้างสรรค์นวัตกรรม Eco-printing และหนังวีแกน โดยสำนักวิชาวิทยาศาสตร์'],
  ['ED13', 'กิจกรรมฝึกปฏิบัติ CPR (MFU Nursing | CPR Experience)', 'เรียนรู้การช่วยฟื้นคืนชีพ (CPR) ผ่านเกม การฝึกปฏิบัติจริง และการเรียนรู้ด้วย Simulation โดยสำนักวิชาพยาบาลศาสตร์'],
  ['ED14', 'การเรียนรู้ตลอดชีวิต (Lifelong Journey)', 'คอร์สออนไลน์ภาษาจีนและ Anatomy, MFU Lifelong English, E-book ภาษาจีน และนวัตกรรม VR พร้อมเกมในบูธ โดยสถาบันนวัตกรรมการเรียนรู้ มฟล.'],
  ['ED15', 'เข็มทิศพลเมืองโลก (Global Compass)', 'เกมสร้างแนวคิดว่าเสรีภาพของพลเมืองโลกต้องเดินเคียงคู่กับความรับผิดชอบและการเคารพสิทธิผู้อื่น โดยส่วนพัฒนานักศึกษา'],
  ['ED16', 'โลกเรา เราดูแล (Act for Earth)', 'เกมสร้างความรับรู้และความตระหนักในการรักษ์สิ่งแวดล้อม โดยส่วนพัฒนานักศึกษา'],
  ['ED17', 'สัมผัสเพื่อเชื่อมโลก (Touch to Connect)', 'กิจกรรมเขียนชื่อเป็นอักษรเบรลล์ ไทย จีน อังกฤษ บนสติกเกอร์ โดยส่วนพัฒนานักศึกษา'],
  ['ED18', 'ทุนสร้างฝัน (Fund & Friends)', 'ข้อมูลและคำแนะนำเรื่องสวัสดิการนักศึกษาต่างชาติ เช่น ทุนการศึกษา พร้อมเกมลุ้นของรางวัล โดยส่วนพัฒนานักศึกษา'],
  ['ED19', 'ค้นหาสีไหนที่ใช่สำหรับเรา (Find Your Personal Color)', 'วิเคราะห์โทนสีประจำตัวที่เหมาะกับสีผิว สีผม สีตา และอันเดอร์โทนของแต่ละคน โดยสำนักวิชาวิทยาศาสตร์เครื่องสำอาง'],
  ['CL20', 'แต่งกายสไตล์จีน วิถีซีรีส์แนวตั้ง (Dress Like Chinese)', 'เรียนรู้วัฒนธรรมจีนผ่านการแต่งชุดจีนโบราณ โดยสำนักวิชาจีนวิทยา'],
  ['CL21', 'ถักเชือกมงคลจีน (Chinese Connection Knot)', 'เรียนรู้วัฒนธรรมจีนผ่านการถักเชือกแบบจีน โดยสำนักวิชาจีนวิทยา'],
  ['CL22', 'แต้มหมึก แต้มศิลป์ (Chinese Ink & Art)', 'เรียนรู้วัฒนธรรมจีนผ่านการวาดภาพด้วยพู่กันจีน โดยสมาคมพัฒนาการศึกษาไทย-จีน'],
  ['CL23', 'เกม บทเพลง และวัฒนธรรมอินโดนีเซีย (Dolanan Anak)', 'เรียนรู้วัฒนธรรมอินโดนีเซีย (ชวากลาง) ผ่านเกมและบทเพลงพื้นบ้าน โดยสำนักวิชาเวชศาสตร์ชะลอวัยและฟื้นฟูสุขภาพ'],
  ['CL24', 'ถักทอตุงใยล้านนา (Lanna Spiderweb Flag Craft)', 'เรียนรู้วัฒนธรรมล้านนาผ่านการทำตุงใยแมงมุม โดยสถาบันศิลปวัฒนธรรมและอารยธรรมลุ่มน้ำโขง'],
  ['CL25', 'มรดกภูมิปัญญาที่มีชีวิต: อังกะลุงและการเต้นรำอินดัง (Living Heritage in Action)', 'เรียนรู้วัฒนธรรมอินโดนีเซียผ่านดนตรีอังกะลุงและการเต้น Tari Indang (สุมาตราตะวันตก) โดยสำนักวิชานวัตกรรมสังคม'],
  ['FD26', 'จิบโลกในแก้วเดียว (Global Sips)', FOOD_NOTE + 'เรียนรู้วัฒนธรรมนานาชาติผ่านอาหารและเครื่องดื่ม โดยสถาบันชาและกาแฟ'],
  ['FD27', null, AGRO], ['FD28', null, AGRO], ['FD29', null, AGRO], ['FD30', null, AGRO], ['FD31', null, AGRO],
  ['FD32', null, AGRO], ['FD33', null, AGRO], ['FD34', null, AGRO], ['FD35', null, AGRO], ['FD36', null, AGRO],
  ['FD37', null, LIBARTS], ['FD38', null, LIBARTS], ['FD39', null, LIBARTS], ['FD40', null, LIBARTS], ['FD41', null, LIBARTS], ['FD42', null, LIBARTS],
  ['FD43', gt('เกาหลี', 'Korea'), GRD_TABLE],
  ['FD44', gt('ญี่ปุ่น', 'Japan'), GRD_TABLE],
  ['FD45', gt('เยอรมนี', 'Germany'), GRD_TABLE],
  ['FD46', gt('อินโดนีเซีย', 'Indonesia'), GRD_TABLE],
  ['FD47', gt('เม็กซิโก', 'Mexico'), GRD_TABLE],
  ['FD48', gt('เช็ก', 'Czechia'), GRD_TABLE],
  ['FD49', gt('ภูฏาน', 'Bhutan'), GRD_TABLE],
  ['FD50', 'A Sip of India โดยกงสุลอินเดีย เชียงใหม่', FOOD_NOTE + 'เรียนรู้วัฒนธรรมนานาชาติผ่านอาหารอินเดีย โดยสถานกงสุลอินเดีย ประจำจังหวัดเชียงใหม่'],
  ['FD51', 'เทศกาลอาหารฝรั่งเศส (French Food Fair)', FOOD_NOTE + 'อาหารฝรั่งเศส โดยหน่วยความร่วมมือทางวิชาการฝรั่งเศส–อนุภูมิภาคลุ่มน้ำโขง (French-GMS Centre)'],
  ['FD52', gt('ไทย', 'Thailand'), GRD_TABLE],
  ['FD53', gt('จีน', 'China'), GRD_TABLE],
  ['FD54', gt('เมียนมา: Glass Noodle Soup', 'Myanmar: Glass Noodle Soup'), GRD_TABLE],
  ['FD55', gt('เมียนมา: Mandalay Noodle Salad', 'Myanmar: Mandalay Noodle Salad'), GRD_TABLE],
  ['FD56', gt('เมียนมา: Assorted Noodle Salad', 'Myanmar: Assorted Noodle Salad'), GRD_TABLE],
  ['FD57', gt('เมียนมา: Yellow Sticky Rice', 'Myanmar: Yellow Sticky Rice'), GRD_TABLE],
  ['FD58', gt('เมียนมา: Pyay Rice Salad', 'Myanmar: Pyay Rice Salad'), GRD_TABLE],
  ['FD59', gt('เมียนมา: Tea Leaf Salad', 'Myanmar: Tea Leaf Salad & Stuffed Tomatoes'), GRD_TABLE],
  ['FD60', gt('เมียนมา: Assorted Fritters', 'Myanmar: Assorted Fritters'), GRD_TABLE],
  ['FD61', gt('เมียนมา: Desserts', 'Myanmar: Desserts'), GRD_TABLE],
  ['FD62', gt('เมียนมา: Rice Drop Dessert', 'Myanmar: Rice Drop Dessert'), GRD_TABLE],
  ['FD63', gt('เมียนมา: Rakhine Table', 'Myanmar: Rakhine Table'), GRD_TABLE],
  ['OPEN1', 'รักษ์โลกเริ่มจากจานเรา (Green Table)', 'จานและชามจากเยื่อพืชธรรมชาติของ Gracz ทำจากเยื่อชานอ้อย 100% โดย M-Store x Zero Waste'],
  ['OPEN2', null, 'ผลิตภัณฑ์ของมหาวิทยาลัยแม่ฟ้าหลวง จาก M-Store'],
  ['OPEN3', null, 'เวิร์กช็อปทำกำไลข้อมือและต่างหูด้วยตัวเอง พร้อมงานศิลปะให้เลือกชมและช็อป' + YOUTH],
  ['OPEN4', null, 'จำหน่ายอุปกรณ์ทำกระเป๋าพร้อมสอนทำ และปิ่นปักผมพร้อมทำผมให้ฟรี' + YOUTH],
  ['OPEN5', null, 'เกม Lotería บิงโกภาพแบบเม็กซิกัน เรียนรู้วัฒนธรรมเม็กซิโกพร้อมลุ้นรางวัลเล็ก ๆ' + YOUTH],
  ['OPEN6', 'โครเชต์และงานปัก (Crochet and Embroidery)', 'ผลงานโครเชต์และงานปักของนักศึกษา พร้อมจำหน่าย' + YOUTH],
  ['OPEN7', 'Model United Nations (MFUMUN)', 'กิจกรรมและการนำเสนอของชมรม Model United Nations มฟล.' + YOUTH],
  ['OPEN8', 'ชมรมนักศึกษาเพื่อสิทธิมนุษยชน มฟล. (MFU Human Rights Club)', 'กิจกรรมสำรวจตัวเองผ่าน 4 สถานี ว่าด้วยตัวตน ความหลากหลาย การอยู่ร่วมกัน และสิ่งแวดล้อม' + YOUTH],
  ['OPEN9', null, 'กิจกรรมของกลุ่มนักศึกษา Maxim' + YOUTH],
  ['OPEN10', null, 'เกมของนักศึกษา Bounce & Win โดย ISC' + YOUTH],
  ['OPEN11', 'เซียมซีจีน (Chinese Fortune Stick)', 'เกมวัฒนธรรมเซียมซีจีน โดย ISC' + YOUTH],
  ['OPEN12', 'ปลัง ปลัง (Plang Plang)', 'ผงโรยข้าวใบผักปลังอบกรอบ จากวิสาหกิจชุมชนแม่ช่วย จ.เชียงราย โครงการออมสินยุวพัฒน์ โดย MFii'],
  ['OPEN13', 'จุดปฐมพยาบาล (First Aid Service)', 'จุดปฐมพยาบาล โดยโรงพยาบาลศูนย์การแพทย์มหาวิทยาลัยแม่ฟ้าหลวง'],
]

async function main() {
  const live = !process.env.FIRESTORE_EMULATOR_HOST
  console.log(`${COMMIT ? 'WRITING' : 'DRY RUN'} — project ${projectId}${live ? ' (LIVE)' : ' (emulator)'}\n`)
  const snap = await db.collection('booths').get()
  const cur = new Map(snap.docs.map((d) => [d.id, d.data()]))
  const missing = TEXT.filter(([id]) => !cur.has(id)).map(([id]) => id)
  if (missing.length) throw new Error(`Booth documents missing: ${missing.join(', ')}`)
  for (const [, , th] of TEXT) if (th.length > 600) throw new Error(`descriptionTh over 600 chars: ${th.slice(0, 40)}…`)

  const batch = db.batch()
  let changed = 0, names = 0
  for (const [id, nameTh, descriptionTh] of TEXT) {
    const b = cur.get(id)
    const patch = {}
    if (nameTh && b.nameTh !== nameTh) { patch.nameTh = nameTh; names++ }
    if (b.descriptionTh !== descriptionTh) patch.descriptionTh = descriptionTh
    if (!Object.keys(patch).length) continue
    changed++
    console.log(`  ${id.padEnd(6)} ${b.nameEn}`)
    if (patch.nameTh) console.log(`         nameTh: ${JSON.stringify(b.nameTh ?? null)} -> ${JSON.stringify(nameTh)}`)
    if ('descriptionTh' in patch) console.log(`         descriptionTh: ${JSON.stringify(b.descriptionTh ?? '')} -> ${JSON.stringify(descriptionTh)}`)
    batch.set(db.doc(`booths/${id}`), patch, { merge: true })
  }
  console.log(`\n${changed} of ${TEXT.length} booths change (${names} Thai names).`)
  if (!COMMIT) { console.log('Dry run — nothing was written. Re-run with --commit to apply.'); return }
  if (!changed) return
  await batch.commit()
  await db.collection('auditLog').add({
    actorUid: 'script:set-thai-booth-text', action: 'setThaiBoothText', targetType: 'booths', targetId: 'all',
    before: null, after: { booths: changed, names }, createdAt: FieldValue.serverTimestamp(),
  })
  console.log('Done. Switch the passport to ไทย and open a booth from the Stamps page to check.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
