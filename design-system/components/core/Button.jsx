import React from 'react'

const TONES = {
  primary: { background: 'var(--brand-primary)', color: '#fff' },
  secondary: { background: 'var(--brand-secondary)', color: '#fff' },
  accent: { background: 'var(--brand-accent)', color: 'var(--ink-900)' },
  ghost: { background: 'rgba(23,65,78,.06)', color: 'var(--ink-900)' },
  danger: { background: 'var(--status-danger)', color: '#fff' },
  onDark: { background: 'rgba(255,255,255,.14)', color: '#fff' },
}
const HOVER = {
  primary: 'var(--brand-primary-hover)',
  secondary: 'var(--brand-secondary-hover)',
  accent: 'var(--brand-accent-hover)',
  ghost: 'rgba(23,65,78,.12)',
  danger: '#A32E2C',
  onDark: 'rgba(255,255,255,.22)',
}
const SIZES = {
  sm: { padding: '7px 14px', fontSize: 'var(--text-body-sm)' },
  md: { padding: '10px 18px', fontSize: 'var(--text-body)' },
  lg: { padding: '14px 26px', fontSize: 'var(--text-body-lg)' },
}

/** The one button. Chrome is a pill; tone carries the meaning. */
export function Button({ tone = 'primary', size = 'md', block = false, disabled = false, icon, children, onClick, type = 'button', ...rest }) {
  const [hot, setHot] = React.useState(false)
  const [down, setDown] = React.useState(false)
  const t = TONES[tone] ?? TONES.primary
  return (
    <button
      type={type} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => { setHot(false); setDown(false) }}
      onMouseDown={() => setDown(true)} onMouseUp={() => setDown(false)}
      style={{
        display: block ? 'flex' : 'inline-flex', width: block ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
        fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)',
        border: 'none', borderRadius: 'var(--radius-pill)', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-standard), transform var(--dur-instant) var(--ease-standard)',
        opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : undefined,
        transform: down ? 'scale(var(--press-scale))' : 'none',
        ...SIZES[size], ...t,
        background: hot && !disabled ? HOVER[tone] : t.background,
      }}
      {...rest}
    >
      {icon}{children}
    </button>
  )
}
