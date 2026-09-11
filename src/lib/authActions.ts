/**
 * Everything the sign-in / sign-up / account screens do to Firebase Auth, in one place.
 *
 * Three of these send mail, and none of it goes through the Resend path in
 * functions/src/mailer.ts — Firebase Auth sends them itself from the templates under
 * Authentication → Templates (see SETUP.md):
 *   · sendVerification        → "Email address verification"
 *   · sendReset               → "Password reset"
 *   · changeEmail             → "Email address change"
 */
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  type ActionCodeSettings,
  type User,
  type UserCredential,
} from 'firebase/auth'
import { APP_ORIGIN, auth, googleProvider } from './firebase'

/** Where Firebase sends the visitor after they finish an emailed action. */
function continueTo(path: string): ActionCodeSettings {
  return { url: `${APP_ORIGIN}${path}`, handleCodeInApp: false }
}

/**
 * Popup first: it keeps the half-filled page alive and works on every modern mobile browser.
 * Where the browser blocks it (in-app webviews, strict pop-up settings) fall back to a
 * redirect, which AuthProvider collects with getRedirectResult on the way back.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  try {
    return await signInWithPopup(auth, googleProvider)
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider)
      return null
    }
    throw e
  }
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
}

/** Creates the account, puts the name on it, and sends the verification mail. */
export async function signUpWithEmail(name: string, email: string, password: string): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
  await sendEmailVerification(cred.user, continueTo('/passport'))
  return cred
}

export async function sendVerification(user: User): Promise<void> {
  await sendEmailVerification(user, continueTo('/passport'))
}

export async function sendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase(), continueTo('/signin'))
}

/**
 * Never `updateEmail` — that would move the account to an address nobody has proved they own.
 * `verifyBeforeUpdateEmail` mails the NEW address and only swaps it when that link is clicked,
 * which is the "Email address change" template.
 */
export async function changeEmail(user: User, newEmail: string): Promise<void> {
  await verifyBeforeUpdateEmail(user, newEmail.trim().toLowerCase(), continueTo('/account'))
}

export async function changePassword(user: User, currentPassword: string, newPassword: string): Promise<void> {
  await reauthenticate(user, currentPassword)
  await updatePassword(user, newPassword)
}

/**
 * Firebase refuses an email or password change on a session older than a few minutes.
 * Password accounts re-enter their password; Google accounts re-do the popup.
 */
export async function reauthenticate(user: User, currentPassword?: string): Promise<void> {
  const byPassword = user.providerData.some((p) => p.providerId === 'password')
  if (byPassword) {
    if (!currentPassword) throw new Error('Enter your current password to confirm this change.')
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', currentPassword))
    return
  }
  await reauthenticateWithPopup(user, googleProvider)
}

/** Lets a Google-only account add a password so it can also sign in without Google. */
export async function addPassword(user: User, password: string): Promise<void> {
  await reauthenticate(user)
  await linkWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password))
}

export async function signInMethods(email: string): Promise<string[]> {
  return fetchSignInMethodsForEmail(auth, email.trim().toLowerCase()).catch(() => [])
}

export function hasPassword(user: User | null): boolean {
  return !!user?.providerData.some((p) => p.providerId === 'password')
}

export function hasGoogle(user: User | null): boolean {
  return !!user?.providerData.some((p) => p.providerId === 'google.com')
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Pick a password of at least 8 characters.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead, or reset the password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong password.',
  'auth/user-not-found': 'No account for that email yet.',
  'auth/user-disabled': 'This account has been disabled. Ask at the welcome desk.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check the wifi and try again.',
  'auth/popup-closed-by-user': 'The Google window closed before sign-in finished.',
  'auth/cancelled-popup-request': 'The Google window closed before sign-in finished.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups, or try again.',
  'auth/account-exists-with-different-credential':
    'That email is already registered with a password. Sign in with the password, then link Google from your account page.',
  'auth/requires-recent-login': 'For your security, confirm who you are again before making this change.',
  'auth/credential-already-in-use': 'That sign-in method is already attached to another account.',
  'auth/provider-already-linked': 'That sign-in method is already on this account.',
  'auth/expired-action-code': 'This link has expired. Ask for a new one.',
  'auth/invalid-action-code': 'This link is not valid — it may already have been used.',
  'auth/unauthorized-continue-uri': 'This site is not on the Firebase authorised-domains list yet (see SETUP.md).',
  'auth/operation-not-allowed': 'That sign-in method is switched off in the Firebase console (see SETUP.md).',
}

export function authError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code]
  if (err?.message) return err.message.replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '')
  return 'Something went wrong. Try again.'
}
