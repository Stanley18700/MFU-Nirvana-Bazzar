import { EmailAuthProvider, linkWithCredential, type User } from 'firebase/auth'

/**
 * §4.1 — a passport lives on the anonymous account that the app created when it first loaded,
 * and stamps are keyed to that uid (`scans/{visitorId}_{boothId}`). So restoring a passport on
 * a new device has to land on *that same uid* — signing in with a fresh email identity would
 * hand the visitor an empty account, and `join` would then refuse them because their contact is
 * already taken.
 *
 * Linking an email credential onto the anonymous account is what makes restore possible:
 * Firebase's own password-reset flow signs the visitor back into the original account, stamps
 * intact, and needs no third-party mailer.
 *
 * The password is random and never shown to anyone — it exists only so the account has an
 * email credential to reset. The visitor chooses a real one if they ever need to restore.
 */
export async function linkEmailForRestore(user: User, contact: string): Promise<'linked' | 'skipped' | 'taken'> {
  const email = contact.trim().toLowerCase()
  if (!email.includes('@')) return 'skipped' // registered with a phone number — desk lookup instead
  if (!user.isAnonymous) return 'skipped'

  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const password = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '')

  try {
    await linkWithCredential(user, EmailAuthProvider.credential(email, password))
    return 'linked'
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    // Someone already holds this address. `join` guards one-contact-one-passport server-side,
    // so this only happens on a retry after a partial registration — harmless either way.
    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') return 'taken'
    if (code === 'auth/provider-already-linked') return 'skipped'
    console.warn('linkEmailForRestore', code || e)
    return 'skipped'
  }
}
