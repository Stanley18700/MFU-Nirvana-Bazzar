/** Quiet underlined text action that exports the panel it sits in. */
export interface CsvButtonProps {
  rows?: Array<Record<string, unknown>>
  name?: string
  label?: string
  /** Confirmation copy — required whenever the rows carry personal or sensitive data. */
  confirm?: string
  onExport?: (rows: Array<Record<string, unknown>>, name: string) => void
}
export function CsvButton(props: CsvButtonProps): JSX.Element
