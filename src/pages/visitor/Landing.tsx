import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import { Spinner } from '../../components/ui'
import { FestivalBackdrop, ScrapLabel, UniversityMark } from '../auth/parts'

export default function Landing() {
  const { ready, user, emailVerified, role } = useAuth()
  const event = useEvent()
  if (!ready) return <Spinner label="Opening your passport…" />
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
    <><FestivalBackdrop /><main className="relative mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-between gap-6 px-6 pt-8 text-center text-ink sm:max-w-lg sm:justify-center sm:gap-14 sm:py-16" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
      <div className="haze page-in flex flex-col items-center px-3 py-2">
        <ScrapLabel tone="forest" tilt={-2.5}>Mae Fah Luang University</ScrapLabel>
        {/* An event name is admin-typed and any length, so let it balance across lines. */}
        <h1 className="mt-4 text-balance text-3xl font-extrabold leading-[1.08] sm:text-4xl">{event.nameEn}</h1>
        <p className="mt-2 text-sm font-medium text-ink-soft sm:text-base">{eventDateLine(event)}</p>
      </div>

      <div className="page-in flex flex-col items-center gap-5" style={{ animationDelay: '60ms' }}>
        <UniversityMark className="h-28 w-28 xs:h-36 xs:w-36" />
        <div className="haze flex flex-col items-center gap-3 px-3 py-2">
          <ScrapLabel tone="orange" tilt={1.75}>Digital passport</ScrapLabel>
          <p className="max-w-xs text-pretty text-ink sm:max-w-sm">
            Collect a stamp at every booth with your own phone, earn points, and trade them for a prize.
          </p>
        </div>
      </div>

      {/* Capped rather than full-width: a 32rem button reads as a banner, not a button. */}
      <div className="page-in flex w-full max-w-sm flex-col gap-3" style={{ animationDelay: '120ms' }}>
        <p className="mb-1 text-xs text-ink-soft">Sign in with Google or an email · works in your browser · under a minute</p>
        <Link to="/signup" className="btn-primary py-3.5 text-lg shadow-raised">Start your passport</Link>
        <Link to="/signin" className="btn-quiet py-3.5 text-base font-semibold text-ink shadow-raised">I already have a passport</Link>
      </div>
    </main></>
  )
}
