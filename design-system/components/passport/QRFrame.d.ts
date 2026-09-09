import type { ReactNode } from 'react'

/**
 * Frame for a booth's rotating code. Owns the accent ring and the perimeter
 * countdown; the code itself is passed as children.
 *
 * @startingPoint section="Passport" subtitle="Booth code frame with perimeter countdown" viewport="700x380"
 */
export interface QRFrameProps {
  /** Inner square in px. Minimum 320 on a real booth kiosk. */
  size?: number
  /** The booth's accent colour — this is the one place it fills a large area. */
  accent?: string
  /** Fraction of the rotation period remaining, 0–1. */
  progress?: number
  /** Switches the countdown to orange in the last three seconds. */
  urgent?: boolean
  children?: ReactNode
}
export function QRFrame(props: QRFrameProps): JSX.Element
