import type { ReactNode } from 'react'

/**
 * Headline lockup for posters, hero units and hall screens, taken directly
 * from the official key visual.
 *
 * @startingPoint section="Festival" subtitle="Poster headline with kicker pill and detail pill" viewport="700x340"
 */
export interface PosterHeadingProps {
  /** Sage pill above the headline, e.g. "Experience the world in one place!". */
  kicker?: ReactNode
  children?: ReactNode
  /** White pill below, e.g. dates and venue. */
  sub?: ReactNode
  align?: 'center' | 'left'
  level?: 1 | 2 | 3
}
export function PosterHeading(props: PosterHeadingProps): JSX.Element
