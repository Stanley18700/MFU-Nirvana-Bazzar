import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBooth } from '../lib/data'
import { LangToggle } from './ui'
import { useLocale } from '../lib/locale'

/**
 * The organizer's only navigation. Booth staff used to reach the prize desk by typing the URL and
 * could not sign out without typing /account, so a shared tablet could not change hands. Admins
 * opening a booth screen get the same bar plus a way back to the admin.
 *
 * `compact` is the kiosk variant: one row of small links inside the booth header, hidden while the
 * screen is in full screen so nothing competes with the QR.
 */
export function OrganizerBar({ boothId, dark = false, compact = false, actions, className = '' }: {
  boothId: string | null | undefined
  dark?: boolean
  compact?: boolean
  /** Page-specific buttons — they render between the nav and Sign out so one row, one rhythm. */
  actions?: ReactNode
  className?: string
}) {
  const { role, signOut } = useAuth()
  const nav = useNavigate()
  const { data: booth } = useBooth(boothId)
  const { t } = useLocale()
  const [fs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  if (compact && fs) return null

  // An admin looking at someone else's booth keeps that booth in the links.
  const q = role === 'admin' && boothId ? `?boothId=${encodeURIComponent(boothId)}` : ''
  const desk = role === 'admin' || !!booth?.isPrizeDesk
  const items: Array<{ to: string; label: string; end?: boolean }> = [
    { to: `/booth${q}`, label: t('nav.booth'), end: true },
    { to: `/booth/stats${q}`, label: t('nav.stats') },
    { to: `/booth/survey${q}`, label: t('nav.survey') },
    ...(desk ? [{ to: '/redeem', label: t('nav.desk') }] : []),
    ...(role === 'admin' ? [{ to: '/admin', label: t('nav.admin') }] : []),
    { to: '/account', label: t('nav.account') },
  ]

  async function leave() {
    await signOut()
    nav('/', { replace: true })
  }

  /**
   * Pages, then this page's actions, then the way out — the order AdminLayout uses, so an
   * organizer moving between the two panels finds the same thing in the same place. The nav sits
   * in its own tinted group: without it, six equal chips in a row gave no clue which were pages
   * and which were buttons, and the active page was indistinguishable from a hover.
   *
   * Sign out is deliberately NOT one of them. It lives outside the `nav` landmark (it navigates
   * nowhere — it ends the session) and is pushed to the far corner behind a divider, so on a
   * shared tablet it is never mistaken for another tab and never sits a thumb-width from Stats.
   */
  /**
   * Two columns, and the outer row deliberately does NOT wrap: the left column holds everything
   * that may reflow — the tabs and the page's own buttons — while Sign out is a
   * `shrink-0` sibling. One wrapping row put Sign out below the tabs the moment the tabs needed a
   * second line; this keeps it in the top corner at every width. `items-start` is what pins it to
   * the top rather than centring it against a two-line nav.
   */
  return (
    <div className={`flex w-full items-start gap-3 ${className}`}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        {/* No booth name here: every page that uses this bar already carries it as its heading. */}
        <nav aria-label={t('nav.pages')} className="flex min-w-0 flex-wrap items-center gap-2">
          <div className={`seg ${dark ? 'seg-dark' : 'seg-light'}`}>
            {items.map((n) => (
              // NavLink sets aria-current="page" itself, which is what drives the active style.
              <NavLink key={n.to} to={n.to} end={n.end} className="seg-item">{n.label}</NavLink>
            ))}
          </div>
        </nav>
        {actions}
      </div>
      {/* The rule keeps it separate even when the row has no slack left to push it with. */}
      {/* Language sits with Sign out: both are settings for whoever is holding the tablet. */}
      <div className={`flex shrink-0 items-center gap-2 border-l pl-3 ${dark ? 'border-paper/15' : 'border-navy/10'}`}>
        <LangToggle dark={dark} />
        <button type="button" onClick={leave} className={`${dark ? 'btn-dark' : 'btn-quiet'} btn-sm`}>{t('nav.signOut')}</button>
      </div>
    </div>
  )
}
