import type { ReactNode } from 'react'

/** One statistic: a big tabular figure over an uppercase label. */
export interface FigProps {
  value: ReactNode
  label: string
  sub?: ReactNode
  /** Tint the figure — one accent per screen. */
  accent?: string
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center' | 'right'
}
export function Fig(props: FigProps): JSX.Element
