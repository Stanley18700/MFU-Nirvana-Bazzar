import React from 'react'

/**
 * A country flag from its ISO-3166 alpha-2 code, rendered as the Unicode
 * regional-indicator pair. No image assets and no sprite sheet.
 */
export function Flag({ code = '', size = 18 }) {
  const ok = /^[A-Za-z]{2}$/.test(code)
  const glyph = ok
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '🌐'
  return <span role="img" aria-label={ok ? code.toUpperCase() : 'Unknown country'} style={{ fontSize: size, lineHeight: 1 }}>{glyph}</span>
}
