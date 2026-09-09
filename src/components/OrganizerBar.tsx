import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBooth } from '../lib/data'
import { useLocale } from '../lib/locale'
import { AccountMenu } from './AccountMenu'
import { useSlidingPill } from '../lib/useSlidingPill'
import { useFitsOneLine } from '../lib/useFitsOneLine'
import { useDismissable } from '../lib/useDismissable'

/**
 * The organizer's only navigation. Booth staff used to reach the prize desk by typing the URL and
 * could not sign out without typing /account, so a shared tablet could not change hands. Admins
 * opening a booth screen get the same bar plus a way back to the admin.
 *
 * `compact` is the kiosk variant: one row of small links inside the booth header, hidden while the
 * screen is in full screen so nothing competes with the QR.
 */
export function OrganizerBar({ boothId, dark = false, compact = false, actions, className = '', style, full = false, large = false }: {
  boothId: string | null | undefined
  dark?: boolean
  compact?: boolean
  /** Page-specific buttons — they render between the nav and Sign out so one row, one rhythm. */
  actions?: ReactNode
  className?: string
  /** Carries `--bar-gutter` where the page's horizontal padding is not the shared column gutter. */
  style?: CSSProperties
  /** Span the viewport and align contents to the shared column, rather than bleeding to a parent's gutter. */
  full?: boolean
  /** Scale with the screen, for the kiosk, where everything else is sized against the viewport. */
  large?: boolean
}) {
  const { role } = useAuth()
  const { data: booth } = useBooth(boothId)
  const { t, locale } = useLocale()
  const loc = useLocation()
  const pages = useSlidingPill()
  const menu = useRef<HTMLDetailsElement>(null)
  useDismissable(menu)
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
   * One row at every width. The strip used to wrap when the pages outgrew the space, which left a
   * single chip stranded on a second line beside a lane of empty bar — and on a shared tablet the
   * page you are on is the one thing the bar has to say clearly. When it stops fitting it becomes
   * a disclosure naming the current page, so nothing is hidden and nothing wraps.
   */
  const { ref: navRef, fits } = useFitsOneLine<HTMLElement>(`${locale}:${items.length}`)
  const current = items.find((n) => (n.end ? loc.pathname === n.to.split('?')[0] : loc.pathname.startsWith(n.to.split('?')[0])))
  const close = () => { if (menu.current) menu.current.open = false }

  return (
    <div style={style} className={`organizer-bar ${large ? 'organizer-bar-lg' : ''} ${full ? 'organizer-bar-full block' : 'flex items-center gap-3'} w-full ${className}`}>
    <div className={full ? 'mx-auto flex w-full max-w-[1600px] items-center gap-3 px-[4vw]' : 'contents'}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* No booth name here: every page that uses this bar already carries it as its heading. */}
        <nav ref={navRef} aria-label={t('nav.pages')} className="flex min-w-0 flex-1 items-center">
          {fits ? (
            <div ref={pages} className={`seg ${dark ? 'seg-dark' : 'seg-light'}`}>
              {items.map((n) => (
                // NavLink sets aria-current="page" itself, which is what drives the active style.
                <NavLink key={n.to} to={n.to} end={n.end} className="seg-item whitespace-nowrap">{n.label}</NavLink>
              ))}
            </div>
          ) : (
            <details ref={menu} className="relative shrink-0">
              {/* `shrink-0` and no truncation: which page you are on is the one thing this control
                  exists to say, and the kiosk's own action buttons were squeezing it to "B…". */}
              <summary
                className={`btn-sm flex shrink-0 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-full ${dark ? 'btn-dark' : 'btn-quiet'}`}
                aria-label={t('nav.pages')}
              >
                <span className="shrink-0">{current?.label ?? t('nav.pages')}</span>
                <span aria-hidden className="text-[0.7em]">▾</span>
              </summary>
              <div className="pop absolute left-0 z-40 mt-1 flex w-56 flex-col rounded-xl bg-white p-1.5 text-sm text-ink shadow-lg ring-1 ring-black/10">
                {items.map((n) => (
                  <NavLink
                    key={n.to} to={n.to} end={n.end} onClick={close}
                    className={({ isActive }) => `menu-item ${isActive ? 'font-semibold' : ''}`}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </div>
            </details>
          )}
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
    </div>
  )
}
