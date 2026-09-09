import type { ReactNode, MouseEventHandler } from 'react'

/**
 * The festival's only button. Always a pill; tone carries the meaning and one
 * tone dominates any given screen.
 *
 * @startingPoint section="Core" subtitle="Pill buttons in every tone and size" viewport="700x200"
 */
export interface ButtonProps {
  /** primary = sky; secondary = green; accent = orange; ghost = quiet; danger = destructive; onDark = on green/navy grounds. */
  tone?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'onDark'
  size?: 'sm' | 'md' | 'lg'
  /** Full-width, for phone-width forms. */
  block?: boolean
  disabled?: boolean
  /** Leading glyph, usually an <Icon />. */
  icon?: ReactNode
  children?: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
}
export function Button(props: ButtonProps): JSX.Element
