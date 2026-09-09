import type { ReactNode } from 'react'

/**
 * The passport app's bottom navigation. Three pages only — Cover, Stamps,
 * Prize — with the scan action raised above the bar as a circle.
 *
 * @startingPoint section="Navigation" subtitle="Three-page bottom bar with raised scan button" viewport="700x160"
 */
export interface TabBarProps {
  tabs?: Array<{ id: string; label: string; icon?: ReactNode }>
  active?: string
  onChange?: (id: string) => void
  scanLabel?: string
  /** Omit to hide the raised scan circle. */
  onScan?: () => void
}
export function TabBar(props: TabBarProps): JSX.Element
