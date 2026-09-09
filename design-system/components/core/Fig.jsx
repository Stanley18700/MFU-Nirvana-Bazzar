import React from 'react'

/** A statistic. Tabular figures, display weight, tightened tracking. */
export function Fig({ value, label, sub, accent, size = 'md', align = 'left' }) {
  const fs = { sm: '28px', md: '44px', lg: 'clamp(44px,5vw,68px)' }[size]
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-black)', fontSize: fs, lineHeight: 1, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: accent || 'inherit' }}>{value}</div>
      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--ink-700)' }}>{label}</div>
      {sub && <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-caption)', color: 'var(--ink-700)' }}>{sub}</div>}
    </div>
  )
}
