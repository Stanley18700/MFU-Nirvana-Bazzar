/**
 * Scopes a dashboard to one day of the festival, or all three.
 *
 * @startingPoint section="Navigation" subtitle="Day 1 / 2 / 3 / All segmented control" viewport="700x120"
 */
export interface DaySelectorProps {
  /** Event day keys in order, e.g. ['2026-09-16','2026-09-17','2026-09-18']. */
  days?: string[]
  value?: string
  onChange?: (id: string) => void
  allLabel?: string
}
export function DaySelector(props: DaySelectorProps): JSX.Element
