import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { Role, UserDoc } from '../../shared/model'

interface AuthState {
  ready: boolean
  user: User | null
  role: Role | null
  boothId: string | null
  profile: (UserDoc & { id: string }) | null
  /** Force-refresh the ID token so a fresh custom claim takes effect now (§3). */
  refreshClaims: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [claims, setClaims] = useState<{ role: Role | null; boothId: string | null }>({ role: null, boothId: null })
  const [profile, setProfile] = useState<(UserDoc & { id: string }) | null>(null)

  const readClaims = useCallback(async (u: User | null, force = false) => {
    if (!u) { setClaims({ role: null, boothId: null }); return }
    const t = await u.getIdTokenResult(force)
    setClaims({ role: (t.claims.role as Role | undefined) ?? null, boothId: (t.claims.boothId as string | undefined) ?? null })
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        // §4.1 — a passport exists before any form is filled.
        try { await signInAnonymously(auth) } catch (e) { console.error('anonymous sign-in failed', e); setReady(true) }
        return
      }
      setUser(u)
      await readClaims(u)
      setReady(true)
    })
    return unsub
  }, [readClaims])

  // Claims refresh on focus and every 15 minutes (§3).
  useEffect(() => {
    if (!user) return
    const onFocus = () => void readClaims(user, true)
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

  const value = useMemo<AuthState>(() => ({
    ready, user, role: claims.role, boothId: claims.boothId, profile,
    refreshClaims: () => readClaims(auth.currentUser, true),
  }), [ready, user, claims, profile, readClaims])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
