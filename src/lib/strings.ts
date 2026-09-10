/**
 * UI strings for the staff screens — the booth kiosk, its statistics page, the bar they share,
 * and the account page.
 *
 * No i18n library. At this size a typed dictionary buys something react-i18next cannot: `th` is
 * declared `Record<keyof typeof en, string>`, so a missing or misspelt key is a *build* error
 * rather than an English word surfacing in a Thai interface during the festival.
 *
 * `{name}` placeholders are filled by `t('key', { name })`.
 *
 * Scope note: spec §1.4 chose an English interface deliberately, because the visitors this event
 * exists to bring together do not share Thai. Thai is therefore an addition for Thai-speaking
 * staff and visitors, not a replacement — and the admin panel (~230 further strings, mostly
 * reporting vocabulary) stays English.
 */
import { adminEn, adminTh } from './strings.admin'

const staffEn = {
  'lang.label': 'Language',

  // OrganizerBar
  'nav.pages': 'Booth pages',
  'nav.booth': 'Booth screen',
  'nav.stats': 'Stats',
  'nav.survey': 'Survey',
  'nav.desk': 'Prize desk',
  'nav.admin': 'Admin',
  'nav.account': 'Account',
  'nav.profile': 'Profile',
  'nav.myPassport': 'My passport',
  'nav.accountSettings': 'Account settings',
  'nav.menu': 'Menu',
  'nav.signOut': 'Sign out',

  // Booth kiosk
  'booth.worth': '{location} · This badge is worth {points} points',
  'booth.manualCode': 'Manual code',
  'booth.rotatesIn': 'Rotates in',
  'booth.seconds': 's',
  'booth.visitorsHere': 'Visitors here',
  'booth.eventTotal': 'Event total',
  'booth.rankOf': 'Rank of {count} booths',
  'booth.starting': 'Starting booth screen…',
  'booth.failed': 'This screen could not start',
  'booth.retry': 'Try again',
  'booth.fsUnavailable': 'Full screen is not available in this browser — press F11.',
  'booth.fsBlocked': 'Full screen was blocked — press F11 (⌃⌘F on a Mac).',
  // iPhone Safari has no Fullscreen API at all, so the advice is Add to Home Screen instead.
  'booth.fsIos': 'iPhone and iPad cannot go full screen from inside Safari. Tap Share, then “Add to Home Screen”, and open the booth screen from that icon — it runs without the address bar.',
  'booth.fullScreen': 'Full screen',
  // Add to Home Screen. On iOS this is not a nicety — Safari has no Fullscreen API, so the
  // home-screen icon is the only way to run the booth screen without the address bar.
  'install.add': 'Add to Home Screen',
  'install.added': 'Added to the home screen. Open the booth from that icon.',
  'install.title': 'Add this booth screen to the home screen',
  'install.why': 'It opens without the address bar, and the booth is one tap away all day.',
  'install.ios': 'Tap the Share button in Safari, scroll down, then tap “Add to Home Screen”.',
  'install.android': 'Open the ⋮ menu in the browser, then tap “Install app” or “Add to Home screen”.',
  'install.desktop': 'Use the install icon at the right-hand end of the address bar, or the browser’s ⋮ menu → “Install”.',
  'install.dismiss': 'Close',
  'booth.exitFullScreen': 'Exit full screen',
  'booth.printCard': 'Print card',
  'booth.showCode': 'Show code to visitor',
  'booth.closeCode': 'Back to booth screen',
  'booth.switchedOff': 'This booth was switched off by the admin — visitor scans are refused until it is switched back on.',
  'booth.notToday': "Not scheduled today on the visitors' stamp map — codes still work if someone scans.",

  // status
  'status.live': 'Live',
  'status.reconnecting': 'Reconnecting',
  'status.offlineCodes': 'Offline — codes still valid',
  'status.reconnectingCodes': 'Reconnecting — codes still valid',

  // Stats
  'stats.worth': '{location} · worth {points} points',
  'stats.visitorsStamped': 'Visitors stamped',
  'stats.lastAt': 'Last at {time}',
  'stats.noneYet': 'None yet',
  'stats.perHour': 'Visitors per hour · Day {day}',
  'stats.day': 'Day',
  'stats.dayN': 'Day {n}',
  'stats.whoVisited': 'Who visited',
  'stats.byDay': 'By day',
  'stats.loading': 'Loading your booth…',
  'stats.noBooth': 'No booth is linked to this account yet — ask the admin to assign one.',
  'stats.boothGone': 'This booth no longer exists. Ask the admin which booth is yours.',

  // Account
  'account.title': 'Your account',
  'account.signedIn': 'Signed in',
  'account.back': 'Back',

  'acct.email.title': 'Email address',
  'acct.email.note': 'Signing in and every notice go to this address.',
  'acct.email.confirmed': 'Confirmed.',
  'acct.email.unconfirmed': 'Not confirmed yet.',
  'acct.email.ok': 'Confirmed',
  'acct.email.pending': 'Not confirmed',
  'acct.email.change': 'Change my email address',
  'acct.email.new': 'New email',
  'acct.email.sendAgain': 'Send the confirmation link again',
  'acct.email.send': 'Send the confirmation',
  'acct.email.sending': 'Sending…',
  'acct.email.sent': 'Confirmation link sent. Tap it, then reopen this page.',

  'acct.pw.title': 'Password',
  'acct.pw.noteGoogle': 'You sign in with Google. Add a password if you also want to sign in without it.',
  'acct.pw.noteHas': 'Used together with your email to sign in.',
  'acct.pw.add': 'Add a password',
  'acct.pw.change': 'Change my password',
  'acct.pw.current': 'Current password',
  'acct.pw.new': 'New password',
  'acct.pw.confirm': 'Confirm new password',
  'acct.pw.mismatch': 'The two passwords do not match.',
  'acct.pw.forgot': 'Forgotten it? Send a reset link instead',
  'acct.pw.changed': 'Password changed.',
  'acct.pw.added': 'Password added. You can now sign in with your email as well as with Google.',

  'acct.methods.title': 'Sign-in methods',
  'acct.methods.google': 'Google',
  'acct.methods.password': 'Email and password',
  'acct.methods.on': 'Connected',
  'acct.methods.off': 'Not connected',
  'acct.pw.none': 'Not set',

  'acct.leaving.title': 'Leaving',
  'acct.leaving.note': 'Signing out keeps your passport safe on the server. Sign back in on any phone to open it again.',
  'acct.leaving.signOut': 'Sign out',
  'acct.erase.ask': 'Ask for my data to be deleted',
  'acct.erase.request': 'Request erasure',
  'acct.erase.requested': 'Erasure requested{date}. The organisers will delete your account; you can keep using your passport until then.',
  'acct.erase.on': ' on {date}',

  'common.cancel': 'Cancel',
  'common.saving': 'Saving…',
} as const

export const en = { ...staffEn, ...adminEn }

export type StringKey = keyof typeof en

/** A missing key here is a compile error — that is the point of the explicit type. */
const staffTh: Record<keyof typeof staffEn, string> = {
  'lang.label': 'ภาษา',

  'nav.pages': 'หน้าของบูธ',
  'nav.booth': 'หน้าจอบูธ',
  'nav.stats': 'สถิติ',
  'nav.survey': 'แบบสอบถาม',
  'nav.desk': 'จุดแลกของรางวัล',
  'nav.admin': 'ผู้ดูแลระบบ',
  'nav.account': 'บัญชี',
  'nav.profile': 'โปรไฟล์',
  'nav.myPassport': 'พาสปอร์ตของฉัน',
  'nav.accountSettings': 'ตั้งค่าบัญชี',
  'nav.menu': 'เมนู',
  'nav.signOut': 'ออกจากระบบ',

  'booth.worth': '{location} · ตราประทับนี้มีค่า {points} คะแนน',
  'booth.manualCode': 'รหัสสำหรับกรอกเอง',
  'booth.rotatesIn': 'เปลี่ยนรหัสในอีก',
  'booth.seconds': 'วินาที',
  'booth.visitorsHere': 'ผู้เข้าชมบูธนี้',
  'booth.eventTotal': 'รวมทั้งงาน',
  'booth.rankOf': 'อันดับจาก {count} บูธ',
  'booth.starting': 'กำลังเปิดหน้าจอบูธ…',
  'booth.failed': 'ไม่สามารถเปิดหน้าจอนี้ได้',
  'booth.retry': 'ลองอีกครั้ง',
  'booth.fsUnavailable': 'เบราว์เซอร์นี้ไม่รองรับโหมดเต็มหน้าจอ — กด F11',
  'booth.fsBlocked': 'โหมดเต็มหน้าจอถูกปิดกั้น — กด F11 (⌃⌘F บน Mac)',
  'booth.fsIos': 'iPhone และ iPad ไม่สามารถเปิดโหมดเต็มหน้าจอจากใน Safari ได้ ให้กดปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” และเปิดหน้าจอบูธจากไอคอนนั้น — จะไม่มีแถบที่อยู่เว็บ',
  'booth.fullScreen': 'เต็มหน้าจอ',
  'install.add': 'เพิ่มไปยังหน้าจอโฮม',
  'install.added': 'เพิ่มไปยังหน้าจอโฮมแล้ว เปิดหน้าจอบูธจากไอคอนนั้นได้เลย',
  'install.title': 'เพิ่มหน้าจอบูธนี้ไปยังหน้าจอโฮม',
  'install.why': 'จะเปิดโดยไม่มีแถบที่อยู่เว็บ และเข้าถึงบูธได้ในแตะเดียวตลอดทั้งวัน',
  'install.ios': 'แตะปุ่มแชร์ใน Safari เลื่อนลง แล้วแตะ “เพิ่มไปยังหน้าจอโฮม”',
  'install.android': 'เปิดเมนู ⋮ ในเบราว์เซอร์ แล้วแตะ “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอโฮม”',
  'install.desktop': 'ใช้ไอคอนติดตั้งที่ท้ายแถบที่อยู่เว็บ หรือเมนู ⋮ ของเบราว์เซอร์ → “ติดตั้ง”',
  'install.dismiss': 'ปิด',
  'booth.exitFullScreen': 'ออกจากโหมดเต็มหน้าจอ',
  'booth.printCard': 'พิมพ์การ์ดบูธ',
  'booth.showCode': 'แสดงรหัสให้ผู้เข้าชม',
  'booth.closeCode': 'กลับสู่หน้าจอบูธ',
  'booth.switchedOff': 'ผู้ดูแลระบบปิดบูธนี้ไว้ — การสแกนของผู้เข้าชมจะไม่ได้รับตราประทับจนกว่าจะเปิดใช้งานอีกครั้ง',
  'booth.notToday': 'วันนี้ไม่มีกำหนดแสดงบนแผนผังตราประทับของผู้เข้าชม — แต่รหัสยังใช้ได้หากมีผู้สแกน',

  'status.live': 'เชื่อมต่ออยู่',
  'status.reconnecting': 'กำลังเชื่อมต่อใหม่',
  'status.offlineCodes': 'ออฟไลน์ — รหัสยังใช้ได้',
  'status.reconnectingCodes': 'กำลังเชื่อมต่อใหม่ — รหัสยังใช้ได้',

  'stats.worth': '{location} · มีค่า {points} คะแนน',
  'stats.visitorsStamped': 'ผู้เข้าชมที่ได้รับตราประทับ',
  'stats.lastAt': 'ครั้งล่าสุด {time}',
  'stats.noneYet': 'ยังไม่มี',
  'stats.perHour': 'ผู้เข้าชมต่อชั่วโมง · วันที่ {day}',
  'stats.day': 'วัน',
  'stats.dayN': 'วันที่ {n}',
  'stats.whoVisited': 'ผู้เข้าชมเป็นใคร',
  'stats.byDay': 'แยกตามวัน',
  'stats.loading': 'กำลังโหลดข้อมูลบูธของคุณ…',
  'stats.noBooth': 'บัญชีนี้ยังไม่ได้ผูกกับบูธใด — โปรดแจ้งผู้ดูแลระบบให้กำหนดบูธให้',
  'stats.boothGone': 'บูธนี้ไม่มีอยู่แล้ว โปรดสอบถามผู้ดูแลระบบว่าบูธของคุณคือบูธใด',

  'account.title': 'บัญชีของคุณ',
  'account.signedIn': 'เข้าสู่ระบบแล้ว',
  'account.back': 'ย้อนกลับ',

  'acct.email.title': 'อีเมล',
  'acct.email.note': 'การเข้าสู่ระบบและการแจ้งเตือนทั้งหมดจะส่งไปที่อีเมลนี้',
  'acct.email.confirmed': 'ยืนยันแล้ว',
  'acct.email.unconfirmed': 'ยังไม่ได้ยืนยัน',
  'acct.email.ok': 'ยืนยันแล้ว',
  'acct.email.pending': 'ยังไม่ยืนยัน',
  'acct.email.change': 'เปลี่ยนอีเมลของฉัน',
  'acct.email.new': 'อีเมลใหม่',
  'acct.email.sendAgain': 'ส่งลิงก์ยืนยันอีกครั้ง',
  'acct.email.send': 'ส่งลิงก์ยืนยัน',
  'acct.email.sending': 'กำลังส่ง…',
  'acct.email.sent': 'ส่งลิงก์ยืนยันแล้ว กดลิงก์ในอีเมล แล้วเปิดหน้านี้อีกครั้ง',

  'acct.pw.title': 'รหัสผ่าน',
  'acct.pw.noteGoogle': 'คุณเข้าสู่ระบบด้วย Google — ตั้งรหัสผ่านเพิ่มได้หากต้องการเข้าสู่ระบบโดยไม่ใช้ Google',
  'acct.pw.noteHas': 'ใช้ร่วมกับอีเมลของคุณเพื่อเข้าสู่ระบบ',
  'acct.pw.add': 'ตั้งรหัสผ่าน',
  'acct.pw.change': 'เปลี่ยนรหัสผ่าน',
  'acct.pw.current': 'รหัสผ่านปัจจุบัน',
  'acct.pw.new': 'รหัสผ่านใหม่',
  'acct.pw.confirm': 'ยืนยันรหัสผ่านใหม่',
  'acct.pw.mismatch': 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
  'acct.pw.forgot': 'จำรหัสผ่านไม่ได้? ส่งลิงก์ตั้งรหัสผ่านใหม่',
  'acct.pw.changed': 'เปลี่ยนรหัสผ่านแล้ว',
  'acct.pw.added': 'ตั้งรหัสผ่านแล้ว ตอนนี้คุณเข้าสู่ระบบด้วยอีเมลหรือ Google ก็ได้',

  'acct.methods.title': 'วิธีเข้าสู่ระบบ',
  'acct.methods.google': 'Google',
  'acct.methods.password': 'อีเมลและรหัสผ่าน',
  'acct.methods.on': 'เชื่อมต่อแล้ว',
  'acct.methods.off': 'ยังไม่เชื่อมต่อ',
  'acct.pw.none': 'ยังไม่ได้ตั้ง',

  'acct.leaving.title': 'ออกจากระบบ',
  'acct.leaving.note': 'การออกจากระบบไม่ทำให้พาสปอร์ตของคุณหาย ข้อมูลถูกเก็บไว้บนเซิร์ฟเวอร์ เข้าสู่ระบบอีกครั้งจากโทรศัพท์เครื่องใดก็เปิดได้',
  'acct.leaving.signOut': 'ออกจากระบบ',
  'acct.erase.ask': 'ขอให้ลบข้อมูลของฉัน',
  'acct.erase.request': 'ส่งคำขอลบข้อมูล',
  'acct.erase.requested': 'ส่งคำขอลบข้อมูลแล้ว{date} ผู้จัดงานจะลบบัญชีของคุณ และคุณยังใช้พาสปอร์ตได้จนถึงตอนนั้น',
  'acct.erase.on': ' เมื่อ {date}',

  'common.cancel': 'ยกเลิก',
  'common.saving': 'กำลังบันทึก…',
}

export const th: Record<StringKey, string> = { ...staffTh, ...adminTh }
