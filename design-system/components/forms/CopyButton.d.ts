/** Copy-to-clipboard with in-place feedback and an honest failure label. */
export interface CopyButtonProps {
  text: string
  tone?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'onDark'
  size?: 'sm' | 'md' | 'lg'
}
export function CopyButton(props: CopyButtonProps): JSX.Element
