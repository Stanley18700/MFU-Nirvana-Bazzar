import React from 'react'

/**
 * The passport cover's foil crest: two concentric rings and a star, drawn in
 * currentColor so it can be gold on navy or ink on paper. A placeholder mark —
 * the university's real crest is not part of this system.
 */
export function Crest({ size = 80, ...rest }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden {...rest}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M50 20 L58 40 L79 42 L63 56 L68 77 L50 66 L32 77 L37 56 L21 42 L42 40 Z" fill="currentColor" opacity=".9" />
    </svg>
  )
}
