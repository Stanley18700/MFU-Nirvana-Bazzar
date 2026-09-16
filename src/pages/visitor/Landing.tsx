import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import { LangToggle, Spinner } from '../../components/ui'
import { FestivalBackdrop, ScrapLabel, UniversityMark } from '../auth/parts'
import { useLocale } from '../../lib/locale'

export default function Landing() {
  const { ready, user, emailVerified, role } = useAuth()
  const event = useEvent()
  const { t, pick } = useLocale()
  if (!ready) return <Spinner label={t('v.loading')} page />
  if (role === 'visitor') return <Navigate to="/passport" replace />
  if (role === 'organizer') return <Navigate to="/booth" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  // Signed in but stopped halfway: finish confirming the address, or finish the form.
  if (user && !emailVerified) return <Navigate to="/verify-email" replace />
  if (user) return <Navigate to="/join" replace />

  /**
   * One centred column on every width. On a phone the three blocks are pushed apart so the
   * buttons sit in the thumb zone, standing on the paper hills at the very foot of the screen;
   * from `sm` up they close into a single centred group, because `justify-between` on a tall
   * desktop window strands the heading and the buttons at opposite edges of the screen.
   *
   * The three blocks enter 60ms apart. A first-visit screen may take a beat; nothing else in the
   * app staggers, and `prefers-reduced-motion` collapses it with the rest of `.page-in`.
   */
  return (
    <><FestivalBackdrop /><main className="relative mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-between gap-6 overflow-x-clip px-6 pt-8 text-center text-ink sm:max-w-lg sm:justify-center sm:gap-14 sm:py-16" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
      {/* No haze behind this block: the wordmark is its own cut-paper shape on a plain sky, and a
          frosted panel behind it read as a card the artwork was sitting in. */}
      {/* First screen anyone sees, and the only one before an account exists: the switch has to
          be here or a Thai speaker meets an English sign-up form with no way out of it. */}
      <div className="absolute right-4 top-4 z-30"><LangToggle className="seg-floating" /></div>
      <div className="page-in flex flex-col items-center px-3 py-2">
        <ScrapLabel tone="ink" tilt={-2.5}>{t('v.landing.university')}</ScrapLabel>
        {/*
         * The festival's own wordmark, which the typed heading stood in for while the asset could
         * not be pulled from the design tool. It carries the name, so the name is its alt text —
         * an admin who renames the event still renames the page for a screen reader, and the date
         * line below is still live.
         */}
        <img src="/brand/logo-festival-tagline.webp" alt={pick(event.nameEn, event.nameTh)} className="mt-3 w-[min(74vw,340px)] sm:w-[380px]" />
        <p className="mt-2 text-sm font-medium text-ink-soft sm:text-base">{eventDateLine(event)}</p>
      </div>

      <div className="page-in flex flex-col items-center gap-5" style={{ animationDelay: '60ms' }}>
        <UniversityMark className="h-28 w-28 xs:h-36 xs:w-36" />
        {/*
          * A tinted panel rather than `.haze`: over the campus its backdrop blur draws a hard
          * rectangle that the recipe's radial mask fades the colour out of but not the blur.
          *
          * The scrap sits astride the panel's top edge rather than inside it. Inside, it read as
          * the first line of the content; taped across the edge it labels the panel, which is what
          * it is for — and a paper scrap stuck slightly askew over a join is the festival's own
          * idiom rather than a heading borrowed from somewhere else.
          */}
        <div className="relative mt-2">
          {/* The wrapper does the positioning: ScrapLabel spends `transform` on its own tilt. */}
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
            <ScrapLabel tone="orange" tilt={1.75}>{t('v.landing.badge')}</ScrapLabel>
          </div>
          <div className="rounded-[28px] bg-sky-100/75 px-5 pb-4 pt-7">
            <p className="max-w-xs text-pretty text-ink sm:max-w-sm">{t('v.landing.pitch')}</p>
          </div>
        </div>
      </div>

      {/* Capped rather than full-width: a 32rem button reads as a banner, not a button. */}
      <div className="page-in flex w-full max-w-sm flex-col gap-3" style={{ animationDelay: '120ms' }}>
        <Link to="/signup" className="btn-primary py-3.5 text-lg shadow-raised">{t('v.landing.start')}</Link>
        <Link to="/signin" className="btn-quiet py-3.5 text-base font-semibold text-ink shadow-raised">{t('v.landing.have')}</Link>
      </div>
    </main></>
  )
}
