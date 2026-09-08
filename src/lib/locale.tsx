import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, th, type StringKey } from './strings'

export const LOCALES = ['en', 'th'] as const
export type Locale = (typeof LOCALES)[number]

const KEY = 'mfu-locale'

/**
 * Language choice, for the booth staff screens and the account page.
 *
 * The interface itself stays English (spec §1.4 — the visitors this festival exists to bring
 * together do not share Thai). What this switches is the bilingual data the app already stores and
 * never showed: `booths.nameTh`, `descriptionTh`, `events.nameTh`. Spec §1.4 kept those fields
 * precisely so "a language toggle can be added later without a migration".
 */
function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'th'
}

/** Saved choice first, then the browser's own language — the same idea as `guessCountry()` on the registration form. */
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (isLocale(saved)) return saved
  } catch { /* private window, or site data blocked */ }
  return navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en'
}

interface LocaleState {
  locale: Locale
  setLocale: (l: Locale) => void
  /** A UI string. `{placeholders}` are filled from `vars`. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string
  /**
   * The right half of a bilingual field. Falls back to the other language rather than rendering
   * nothing: a booth whose Thai name was never filled in must still show a name.
   */
  pick: (enText: string | null | undefined, thText: string | null | undefined) => string
}

const Ctx = createContext<LocaleState | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  // Drives font shaping, the `:lang(th)` typography rules in index.css, and screen readers.
  useEffect(() => { document.documentElement.lang = locale }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(KEY, l) } catch { /* the choice just will not persist */ }
  }, [])

  const value = useMemo<LocaleState>(() => {
    const dict = locale === 'th' ? th : en
    return {
      locale,
      setLocale,
      // Falls through to English if a Thai value is ever blank, so a screen never renders a raw key.
      t: (key, vars) => {
        const s = dict[key] || en[key] || key
        return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
      },
      pick: (enText, thText) => (locale === 'th' ? thText || enText : enText || thText) || '',
    }
  }, [locale, setLocale])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLocale(): LocaleState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLocale outside LocaleProvider')
  return v
}
