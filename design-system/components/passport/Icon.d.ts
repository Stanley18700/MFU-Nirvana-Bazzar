/**
 * The complete icon set. Four glyphs, drawn as strokes in currentColor — that
 * is the whole inventory, deliberately.
 *
 * @startingPoint section="Passport" subtitle="The four app icons" viewport="700x120"
 */
export interface IconProps {
  name: 'cover' | 'stamps' | 'prize' | 'scan'
  size?: number
  strokeWidth?: number
}
export function Icon(props: IconProps): JSX.Element
export const iconNames: string[]
