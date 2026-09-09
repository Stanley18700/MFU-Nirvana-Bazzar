import type { ReactNode } from 'react'

/**
 * An inline message. Four tones, and a dark variant tuned for the green and
 * navy grounds (auth screens, the booth display, the hall screen).
 *
 * @startingPoint section="Feedback" subtitle="Four tones, light and dark grounds" viewport="700x280"
 */
export interface NoticeProps {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  /** Use on green / navy grounds. */
  dark?: boolean
  children?: ReactNode
}
export function Notice(props: NoticeProps): JSX.Element
