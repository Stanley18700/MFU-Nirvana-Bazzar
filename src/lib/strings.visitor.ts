/**
 * The signed-out screens — the landing page and the four auth pages behind `AuthShell`.
 *
 * These matter more than the staff strings: they are the first thing a Thai visitor meets at the
 * gate, before they have an account, and the only place the language switch is reachable without
 * signing in. Spec §1.4 keeps English as the default for an international audience; Thai is the
 * addition, not the replacement.
 */
export const visitorEn = {
  // Landing
  'home.university': 'Mae Fah Luang University',
  'home.kicker': 'Digital passport',
  'home.lead': 'Collect a stamp at every booth with your own phone, earn points, and trade them for a prize.',
  'home.start': 'Start your passport',
  'home.have': 'I already have a passport',
  'home.opening': 'Opening your passport…',

  // AuthShell chrome
  'auth.back': 'Back',
  'auth.google.opening': 'Opening Google…',

  // Sign up
  'signup.title': 'Create your account',
  'signup.lead': 'One account holds your passport for the whole festival. Sign in again on a new phone and every stamp is still there.',
  'signup.google': 'Sign up with Google',
  'signup.or': 'or with an email',
  'signup.name': 'Your name',
  'signup.namePlaceholder': 'Shown on your passport cover',
  'signup.email': 'Email',
  'signup.emailPlaceholder': 'you@example.com',
  'signup.emailHint': 'We send a one-tap link here to confirm the address is yours.',
  'signup.password': 'Password',
  'signup.passwordPlaceholder': 'At least 8 characters',
  'signup.confirm': 'Confirm password',
  'signup.confirmPlaceholder': 'Type it once more',
  'signup.mismatch': 'The two passwords do not match.',
  'signup.submit': 'Create account',
  'signup.submitting': 'Creating…',
  'signup.privacy': 'By continuing you agree to how MFU handles your details — see the',
  'signup.privacyLink': 'privacy notice',
  'signup.haveOne': 'Already have one?',
  'signup.signIn': 'Sign in',

  // Sign in
  'signin.title': 'Sign in',
  'signin.lead': 'Your passport, stamps and points follow the account — sign in on any phone and they are all there.',
  'signin.google': 'Continue with Google',
  'signin.submitting': 'Signing in…',
  'signin.forgot': 'Forgot your password?',
  'signin.newHere': 'New here?',
  'signin.create': 'Create an account',
} as const

export const visitorTh: Record<keyof typeof visitorEn, string> = {
  'home.university': 'มหาวิทยาลัยแม่ฟ้าหลวง',
  'home.kicker': 'พาสปอร์ตดิจิทัล',
  'home.lead': 'สะสมตราประทับจากทุกบูธด้วยโทรศัพท์ของคุณ รับคะแนน แล้วนำไปแลกของรางวัล',
  'home.start': 'เริ่มใช้พาสปอร์ต',
  'home.have': 'ฉันมีพาสปอร์ตอยู่แล้ว',
  'home.opening': 'กำลังเปิดพาสปอร์ตของคุณ…',

  'auth.back': 'ย้อนกลับ',
  'auth.google.opening': 'กำลังเปิด Google…',

  'signup.title': 'สร้างบัญชีของคุณ',
  'signup.lead': 'บัญชีเดียวใช้กับพาสปอร์ตตลอดทั้งงาน เข้าสู่ระบบอีกครั้งบนโทรศัพท์เครื่องใหม่ ตราประทับทุกดวงยังอยู่ครบ',
  'signup.google': 'สมัครด้วย Google',
  'signup.or': 'หรือใช้อีเมล',
  'signup.name': 'ชื่อของคุณ',
  'signup.namePlaceholder': 'ชื่อที่แสดงบนปกพาสปอร์ต',
  'signup.email': 'อีเมล',
  'signup.emailPlaceholder': 'you@example.com',
  'signup.emailHint': 'เราจะส่งลิงก์ยืนยันไปที่อีเมลนี้ เพื่อยืนยันว่าเป็นอีเมลของคุณ',
  'signup.password': 'รหัสผ่าน',
  'signup.passwordPlaceholder': 'อย่างน้อย 8 ตัวอักษร',
  'signup.confirm': 'ยืนยันรหัสผ่าน',
  'signup.confirmPlaceholder': 'พิมพ์รหัสผ่านอีกครั้ง',
  'signup.mismatch': 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
  'signup.submit': 'สร้างบัญชี',
  'signup.submitting': 'กำลังสร้างบัญชี…',
  'signup.privacy': 'การดำเนินการต่อถือว่าคุณยอมรับวิธีที่ มฟล. จัดการข้อมูลของคุณ — ดู',
  'signup.privacyLink': 'ประกาศความเป็นส่วนตัว',
  'signup.haveOne': 'มีบัญชีอยู่แล้ว?',
  'signup.signIn': 'เข้าสู่ระบบ',

  'signin.title': 'เข้าสู่ระบบ',
  'signin.lead': 'พาสปอร์ต ตราประทับ และคะแนนของคุณผูกกับบัญชี เข้าสู่ระบบจากโทรศัพท์เครื่องใดก็เห็นครบทั้งหมด',
  'signin.google': 'เข้าสู่ระบบด้วย Google',
  'signin.submitting': 'กำลังเข้าสู่ระบบ…',
  'signin.forgot': 'ลืมรหัสผ่าน?',
  'signin.newHere': 'เพิ่งเคยใช้ครั้งแรก?',
  'signin.create': 'สร้างบัญชีใหม่',
}
