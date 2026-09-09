import type { ReactNode } from 'react'

/**
 * The default content container. Four grounds, no borders — separation comes
 * from the shadow and the sky page behind it.
 *
 * @startingPoint section="Core" subtitle="Card grounds, eyebrow + title, accent rule" viewport="700x260"
 */
export interface CardProps {
  tone?: 'white' | 'warm' | 'sky' | 'green'
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode
  title?: ReactNode
  /** A paper-scrap colour drawn as a 3px rule along the top edge — used to key a card to a booth. */
  accent?: string
  elevation?: 'none' | 'sm' | 'card' | 'raised' | 'float'
  padding?: string
  /** Lifts 2px and deepens the shadow on hover. */
  interactive?: boolean
  children?: ReactNode
}
export function Card(props: CardProps): JSX.Element
