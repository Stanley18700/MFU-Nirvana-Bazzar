import type { ReactNode } from 'react'
import { OrganizerBar } from './OrganizerBar'
import { Stamp } from './Stamp'
import type { BoothDoc } from '../../shared/model'

type BoothLike = Pick<BoothDoc, 'shortName' | 'accentColor' | 'badgeThumbUrl' | 'badgeUrl' | 'nameEn'>

/**
 * The booth's own visa, blown up and turned down, as the ground of its pages.
 *
 * Sized in `vmin` so it is the same fraction of the screen on a phone, a booth tablet and a
 * desk monitor rather than a fixed slab that swamps one and disappears on another. It hangs off
 * the bottom-right corner, which is the quiet part of every one of these layouts.
 */
export function BoothWatermark({ booth, marks }: { booth: BoothLike | null | undefined; marks?: { markTop: string; markBottom: string } }) {
  if (!booth) return null
  return (
    <div className="pointer-events-none fixed bottom-[-6vmin] right-[-10vmin] -z-10 opacity-[0.12] mix-blend-luminosity" aria-hidden>
      <div className="w-[min(78vmin,720px)] -rotate-[8deg]">
        <Stamp booth={booth} collected size={720} className="!w-full" {...marks} />
      </div>
    </div>
  )
}

/**
 * The shell every organizer page except the kiosk sits in.
 *
 * It exists because those pages had three different widths — 512, 672 and 768 — and each kept the
 * bar *inside* its own column. That is why the prize desk showed a collapsed, phone-shaped nav on
 * a 1920 screen: the strip was measuring the room in a 512px column, not on the display. The bar
 * is full-width here and only its contents are aligned to the column, so it always knows how much
 * screen it actually has.
 *
 * The column is the booth display's own: full-bleed to a `4vw` gutter, so a desktop gets a desktop
 * layout on every organizer screen rather than a 1024px ribbon on three of the four, and switching
 * tabs does not shift the nav sideways.
 */
export function OrganizerPage({ boothId, booth, marks, children, compact = false, actions }: {
  boothId: string | null | undefined
  booth?: BoothLike | null
  marks?: { markTop: string; markBottom: string }
  children: ReactNode
  compact?: boolean
  actions?: ReactNode
}) {
  return (
    <>
      <div className="fixed inset-0 -z-20 bg-stage" aria-hidden />
      <BoothWatermark booth={booth} marks={marks} />
      {/* `large`, like the kiosk: one bar size across every organizer screen rather than a big one
          on the booth display and a small one everywhere else. */}
      <OrganizerBar boothId={boothId} dark compact={compact} actions={actions} large />
      <main className="on-chrome relative min-h-full w-full px-[4vw] pb-10 pt-4">
        {children}
      </main>
    </>
  )
}
