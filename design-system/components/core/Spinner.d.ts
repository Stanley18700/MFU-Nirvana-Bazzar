/** Loading state with a visible, readable label. */
export interface SpinnerProps {
  label?: string
  /** For green / navy grounds. */
  dark?: boolean
  size?: number
}
export function Spinner(props: SpinnerProps): JSX.Element
