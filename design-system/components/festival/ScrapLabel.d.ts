import type { ReactNode } from 'react'

/**
 * Torn-paper activity label, lifted from the official key visual.
 *
 * @startingPoint section="Festival" subtitle="Torn-paper activity labels, with tape" viewport="700x180"
 */
export interface ScrapLabelProps {
  children?: ReactNode
  /** A paper-scrap colour. Rotate through the set; never repeat two in a row. */
  color?: string
  textColor?: string
  size?: 'sm' | 'md' | 'lg'
  /** Picks one of the three fixed tilts. Pass the item's list position. */
  index?: number
  /** Adds the translucent masking-tape strip over the top-left corner. */
  tape?: boolean
}
export function ScrapLabel(props: ScrapLabelProps): JSX.Element
