import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBooth } from '../lib/data'
import { useLocale } from '../lib/locale'
import { AccountMenu } from './AccountMenu'
import { useSlidingPill } from '../lib/useSlidingPill'

/**
 * The organizer's only navigation. Booth staff used to reach the prize desk by typing the URL and
 * could not sign out without typing /account, so a shared tablet could not change hands. Admins
 * opening a booth screen get the same bar plus a way back to the admin.
 *
 * `compact` is the kiosk variant: one row of small links inside the booth header, hidden while the
 * screen is in full screen so nothing competes with the QR.
 */
export function OrganizerBar({ boothId, dark = false, compact = false, actions, className = '', style }: {
  boothId: string | null | undefined
  dark?: boolean
  compact?: boolean
  /** Page-specific buttons — they render between the nav and Sign out so one row, one rhythm. */
  actions?: ReactNode
  className?: string
  /** Carries `--bar-gutter` where the page's horizontal padding is not the shared column gutter. */
  style?: CSSProperties
}) {
  const { role } = useAuth()
  const { data: booth } = useBooth(boothId)
  const { t } = useLocale()
  const pages = useSlidingPill()
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
  ]


  /**
   * Pages, then this page's actions, then the way out — the order AdminLayout uses, so an
   * organizer moving between the two panels finds the same thing in the same place. The nav sits
   * in its own tinted group: without it, six equal chips in a row gave no clue which were pages
   * and which were buttons, and the active page was indistinguishable from a hover.
   *
   * The account menu is deliberately NOT one of them. It lives outside the `nav` landmark (it
   * navigates nowhere — it changes a setting or ends the session) and sits in the far corner
   * behind a divider, so on a shared tablet it is never mistaken for another tab and Sign out is
   * never a thumb-width from Stats.
   */
  /**
   * Two columns, and the outer row deliberately does NOT wrap: the left column holds everything
   * that may reflow — the tabs and the page's own buttons — while the account menu is a
   * `shrink-0` sibling. One wrapping row put it below the tabs the moment the tabs needed a
   * second line; this keeps it in the top corner at every width, which matters now that six booth
   * pages wrap to two lines on a phone. `items-start` pins it to the top rather than centring it
   * against a two-line nav.
   */
  return (
    <div style={style} className={`organizer-bar flex w-full items-start gap-3 ${className}`}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        {/* No booth name here: every page that uses this bar already carries it as its heading. */}
        <nav aria-label={t('nav.pages')} className="flex min-w-0 flex-wrap items-center gap-2">
          <div ref={pages} className={`seg ${dark ? 'seg-dark' : 'seg-light'}`}>
            {items.map((n) => (
              // NavLink sets aria-current="page" itself, which is what drives the active style.
              <NavLink key={n.to} to={n.to} end={n.end} className="seg-item">{n.label}</NavLink>
            ))}
          </div>
        </nav>
        {actions}
      </div>
      {/*
        * Identity, language and the way out, behind one control — the same menu the admin console
        * carries. It sits outside the `nav` landmark and behind a rule because none of it
        * navigates: it ends the session or changes a setting.
        */}
      <div className={`flex shrink-0 items-center border-l pl-3 ${dark ? 'border-white/15' : 'border-ink/10'}`}>
        <AccountMenu dark={dark} />
      </div>
    </div>
  )
}
