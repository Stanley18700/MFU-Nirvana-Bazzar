import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRedirectResult, onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase'
import { authError } from './authActions'
import { api } from './api'
import type { Role, UserDoc } from '../../shared/model'

interface AuthState {
  /** True once Firebase has told us whether anyone is signed in. `user` may still be null. */
  ready: boolean
  user: User | null
  /** A Google account arrives verified; an email/password one only after the link is clicked. */
  emailVerified: boolean
  role: Role | null
  boothId: string | null
  profile: (UserDoc & { id: string }) | null
  /** Force-refresh the ID token so a fresh custom claim takes effect now (§3). */
  refreshClaims: () => Promise<void>
  /** Re-read the account from the server — how the app notices a just-clicked verify link. */
  reloadUser: () => Promise<void>
  /**
   * Why the last Google redirect sign-in failed, ready to show, or null.
   *
   * A popup reports its failure to the caller, which puts it on the screen. A redirect cannot:
   * the page that started it is gone, and the error surfaces in a fresh load of the app with no
   * caller waiting. Until this existed that error went to console.warn only, so the visitor came
   * back from Google to the signed-out sign-in page with nothing to explain it — indistinguishable
   * from having tapped the button and nothing happening. That is the in-app-browser failure.
   */
  redirectError: string | null
  /** Dismiss the message above, so it does not follow the visitor to the next screen. */
  clearRedirectError: () => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [verified, setVerified] = useState(false)
  const [claims, setClaims] = useState<{ role: Role | null; boothId: string | null }>({ role: null, boothId: null })
  const [profile, setProfile] = useState<(UserDoc & { id: string }) | null>(null)
  const [redirectError, setRedirectError] = useState<string | null>(null)

  const readClaims = useCallback(async (u: User | null, force = false) => {
    if (!u) { setClaims({ role: null, boothId: null }); return }
    const t = await u.getIdTokenResult(force)
    setClaims({ role: (t.claims.role as Role | undefined) ?? null, boothId: (t.claims.boothId as string | undefined) ?? null })
  }, [])

  useEffect(() => {
    // Google sign-in falls back to a redirect where popups are blocked, and goes straight to one
    // inside an in-app webview; collect that result before the first onAuthStateChanged so a
    // redirect error is kept rather than swallowed. Success needs no handling here —
    // onAuthStateChanged below fires with the signed-in user either way.
    getRedirectResult(auth).catch((e) => {
      console.warn('redirect sign-in', e?.code)
      setRedirectError(authError(e))
    })
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setVerified(!!u?.emailVerified)
      await readClaims(u)
      setReady(true)
    })
    return unsub
  }, [readClaims])

  // Claims refresh on focus and every 15 minutes (§3). The same tick re-reads the account,
  // so verifying the address in another tab lands here without a manual reload.
  useEffect(() => {
    if (!user) return
    const onFocus = async () => {
      await user.reload().catch(() => undefined)
      setVerified(user.emailVerified)
      await readClaims(user, true)
    }
    window.addEventListener('focus', onFocus)
    const id = setInterval(onFocus, 15 * 60 * 1000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [user, readClaims])

  useEffect(() => {
    if (!user) { setProfile(null); return }
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? ({ id: snap.id, ...(snap.data() as UserDoc) }) : null)
    }, (err) => console.warn('profile listener', err.code))
  }, [user])

  /**
   * Firebase Auth owns the email address; users/{uid}.contact is a copy the organisers read.
   * An "email address change" link applied in another tab (or on another device) moves the
   * first and not the second, so repair the copy the moment the two disagree.
   */
  const synced = useRef('')
  useEffect(() => {
    const email = user?.email?.toLowerCase()
    if (!user || !email || !profile) return
    if (profile.contact === email && profile.contactVerified === user.emailVerified) return
    if (synced.current === `${user.uid}:${email}:${user.emailVerified}`) return
    synced.current = `${user.uid}:${email}:${user.emailVerified}`
    api.syncAccount({}).catch((e) => console.warn('syncAccount', e?.code))
  }, [user, profile])

  const reloadUser = useCallback(async () => {
    const u = auth.currentUser
    if (!u) return
    await u.reload()
    setUser(u)
    setVerified(u.emailVerified)
    await readClaims(u, true)
  }, [readClaims])

  const clearRedirectError = useCallback(() => setRedirectError(null), [])

  const value = useMemo<AuthState>(() => ({
    ready, user, emailVerified: verified, role: claims.role, boothId: claims.boothId, profile,
    refreshClaims: () => readClaims(auth.currentUser, true),
    reloadUser,
    redirectError,
    clearRedirectError,
    // Never rejects: signing out only clears local persistence, and a failure there must not
    // trap someone on a page (five callers navigate straight after this).
    signOut: async () => {
      try { await fbSignOut(auth) } catch (e) { console.warn('signOut', (e as { code?: string })?.code) }
    },
  }), [ready, user, verified, claims, profile, readClaims, reloadUser, redirectError, clearRedirectError])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

/**
 * Sign out and go to `/`, which routes by role — so for a signed-out person it is the landing page.
 * Four callers wrote these two lines out identically; leaving them separate is how one of them ends
 * up stranding someone on a page they can no longer read.
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuth()
  const nav = useNavigate()
  return useCallback(async () => { await signOut(); nav('/', { replace: true }) }, [signOut, nav])
}
