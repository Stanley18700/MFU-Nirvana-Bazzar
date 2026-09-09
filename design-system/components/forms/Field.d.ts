import type { ReactNode } from 'react'

/**
 * One labelled control. Input, select and textarea share a single frame so a
 * registration form reads as one block.
 *
 * @startingPoint section="Forms" subtitle="Input, select, textarea, error and disabled states" viewport="700x300"
 */
export interface FieldProps {
  label?: string
  /** Helper text under the control. Replaced by `error` when set. */
  hint?: ReactNode
  error?: ReactNode
  as?: 'input' | 'select' | 'textarea'
  /** Select options; strings or {value,label} pairs. */
  options?: Array<string | { value: string; label: string }>
  required?: boolean
  disabled?: boolean
  id?: string
  placeholder?: string
  type?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
}
export function Field(props: FieldProps): JSX.Element
