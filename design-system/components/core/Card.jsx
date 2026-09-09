import React from 'react'

const TONES = {
  white: { background: 'var(--surface-card)', color: 'var(--ink-900)' },
  warm: { background: 'var(--surface-card-warm)', color: 'var(--ink-900)' },
  sky: { background: 'var(--sky-200)', color: 'var(--ink-900)' },
  green: { background: 'var(--green-900)', color: '#fff' },
}

/** The default content container: generous padding, soft corner, teal-tinted shadow. */
export function Card({ tone = 'white', eyebrow, title, accent, elevation = 'card', padding = 'var(--space-6)', interactive = false, children, ...rest }) {
  const [hot, setHot] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{
        background: TONES[tone].background, color: TONES[tone].color,
        borderRadius: 'var(--radius-xl)', padding,
        boxShadow: elevation === 'none' ? 'none' : hot && interactive ? 'var(--shadow-raised)' : `var(--shadow-${elevation})`,
        transform: hot && interactive ? 'var(--hover-lift)' : 'none',
        transition: 'transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
        cursor: interactive ? 'pointer' : undefined,
        borderTop: accent ? `var(--border-thick) solid ${accent}` : undefined,
      }}
      {...rest}
    >
      {eyebrow && (
        <div style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: tone === 'green' ? 'rgba(255,255,255,.6)' : 'var(--ink-700)' }}>{eyebrow}</div>
      )}
      {title && (
        <h3 style={{ margin: eyebrow ? 'var(--space-2) 0 0' : 0, fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title-2)', lineHeight: 'var(--leading-title)', color: 'inherit' }}>{title}</h3>
      )}
      {children != null && <div style={{ marginTop: eyebrow || title ? 'var(--space-3)' : 0 }}>{children}</div>}
    </div>
  )
}
