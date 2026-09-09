/** Country flag from an ISO alpha-2 code; falls back to a globe. */
export interface FlagProps {
  code?: string
  size?: number
}
export function Flag(props: FlagProps): JSX.Element
