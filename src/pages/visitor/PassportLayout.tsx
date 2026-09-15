import { Outlet, useLocation } from 'react-router-dom'
import { DataErrors, Icon, LangToggle, LiveDot, TabBar } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'
import { SurveyNudge } from '../../components/SurveyNudge'
import { VisitorWelcome } from '../../components/Welcome'
import { useOnline } from '../../lib/useOnline'
import { useLocale } from '../../lib/locale'

export default function PassportLayout() {
  const loc = useLocation()
  const online = useOnline()
  const { t } = useLocale()
  return (
    <><FestivalBackdrop hills={false} /><div className="mx-auto min-h-full max-w-md" style={{
        /*
         * The bar is its own height plus the 2rem band the scan circle is raised into, and the
         * circle overhangs that band by half its diameter. This clears all of it.
         */
        paddingBottom: 'calc(8.5rem + env(safe-area-inset-bottom))',
      }}>
      {/*
        * A failing listener says so through DataErrors. Losing the network says nothing at
        * all — Firestore serves the cache — so the passport would quietly show yesterday's
        * stamps as though they were current. Said plainly here, and only when something is
        * actually wrong: a green "connected" badge on a visitor's passport is noise.
        */}
      {/*
        * The language switch, on the passport itself rather than buried in the account menu.
        * Half the hall is Thai-speaking and most of them will never open Profile — a visitor who
        * cannot read the screen has to be able to fix that from the screen they are looking at.
        * Right-aligned above the content so it never sits over a heading, and `sticky` so it
        * stays reachable down a long list of booths.
        */}
      <div className="sticky top-0 z-30 flex justify-end px-4 pt-3">
        {/* `seg-floating`, the same as the landing page: this one also sits on the sky rather
            than inside a card, and `seg-light` over it is a 6% ink tint that all but vanishes. */}
        <LangToggle className="seg-floating" />
      </div>
      {!online && (
        <div className="mx-4 mt-3 rounded-2xl bg-white/90 px-4 py-3 shadow-card">
          <LiveDot state="offline" size="sm">{t('v.offline')}</LiveDot>
          <p className="mt-1 text-xs text-ink-soft">{t('v.offline.note')}</p>
        </div>
      )}
      <DataErrors className="mx-4 mt-3" />
      <div key={loc.pathname} className="page-in">
        <Outlet />
      </div>
      {/* The festival survey's three asks, over whichever passport tab is open. Outside the
          keyed page so a tab change does not re-run its once-only logic. */}
      <SurveyNudge />
      {/* First-time explanation of the passport; reopened by the cover's "How it works". */}
      <VisitorWelcome />
      <TabBar scanTo="/scan" tabs={[
        { to: '/passport', label: t('v.tab.cover'), icon: Icon.cover, end: true },
        { to: '/passport/stamps', label: t('v.tab.stamps'), icon: Icon.stamps },
        { to: '/passport/prize', label: t('v.tab.prize'), icon: Icon.prize },
        { to: '/passport/account', label: t('v.tab.profile'), icon: Icon.person },
      ]} />
    </div></>
  )
}
