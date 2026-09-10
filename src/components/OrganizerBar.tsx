import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBooth } from '../lib/data'
import { useLocale } from '../lib/locale'
import { AccountMenu } from './AccountMenu'
import { useDismissable } from '../lib/useDismissable'

/**
 * The organizer's only navigation. Booth staff used to reach the prize desk by typing the URL and
 * could not sign out without typing /account, so a shared tablet could not change hands. Admins
 * opening a booth screen get the same bar plus a way back to the admin.
 *
 * `compact` is the kiosk variant: one row of small links inside the booth header, hidden while the
 * screen is in full screen so nothing competes with the QR.
 */
export function OrganizerBar({ boothId, dark = false, compact = false, actions, className = '', large = false }: {
  boothId: string | null | undefined
  dark?: boolean
  compact?: boolean
  /** Page-specific buttons — they render between the nav and Sign out so one row, one rhythm. */
  actions?: ReactNode
  className?: string
  /** Scale with the screen, for the kiosk, where everything else is sized against the viewport. */
  large?: boolean
}) {
  const { role } = useAuth()
  const { data: booth } = useBooth(boothId)
  const { t } = useLocale()
  const loc = useLocation()
  const menu = useRef<HTMLDetailsElement>(null)
  useDismissable(menu)
  const [fs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

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
   * organizer moving between the two panels finds the same thing in the same place.
   *
   * The pages are one disclosure naming the current page, at every width. This used to swap
   * between a tab strip and this menu depending on whether the strip still fit on one line. Two
   * forms meant the bar looked like two different products, and the measurement picked wrongly —
   * the menu on a 2000px kiosk, the strip on a phone, the opposite of what it was for. One form
   * cannot disagree with itself, and it holds its width whatever the language or the number of
   * pages a role can see.
   *
   * The account menu is deliberately not among them. It lives outside the `nav` landmark (it
   * navigates nowhere — it changes a setting or ends the session) and sits in the far corner
   * behind a divider, so on a shared tablet it is never mistaken for another page and Sign out is
   * never a thumb-width from Stats.
   */

  /*
   * Below every hook, deliberately. This used to sit up with the fullscreen state, so pressing
   * full screen on the kiosk unmounted the bar one hook early and React threw "Rendered fewer
   * hooks than expected" straight into the error boundary — the whole booth screen replaced by
   * "Something went wrong", on the one press meant to make it a hall display.
   */
  if (compact && fs) return null
  const current = items.find((n) => (n.end ? loc.pathname === n.to.split('?')[0] : loc.pathname.startsWith(n.to.split('?')[0])))
  const close = () => { if (menu.current) menu.current.open = false }

  return (
    <div className={`organizer-bar ${large ? 'organizer-bar-lg' : ''} ${className}`}>
    {/* One gutter, shared with every page body: the nav starts where the heading starts and the
        account control ends where the content ends, at the far corner of the screen. */}
    <div className="flex w-full items-center gap-3 px-[4vw]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* No booth name here: every page that uses this bar already carries it as its heading. */}
        <nav aria-label={t('nav.pages')} className="flex min-w-0 flex-1 items-center">
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
                // NavLink sets aria-current="page" itself, which is what marks the current page.
                <NavLink
                  key={n.to} to={n.to} end={n.end} onClick={close}
                  className={({ isActive }) => `menu-item ${isActive ? 'font-semibold' : ''}`}
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
          </details>
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
