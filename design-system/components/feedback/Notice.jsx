import React from 'react'

const LIGHT = {
  info: { background: 'var(--status-info-bg)', color: 'var(--ink-900)' },
  success: { background: 'var(--status-success-bg)', color: '#1F4A25' },
  warning: { background: 'var(--status-warning-bg)', color: '#8A4A12' },
  danger: { background: 'var(--status-danger-bg)', color: '#8F2A1C' },
}
const DARK = {
  info: { background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.92)' },
  success: { background: 'rgba(76,118,79,.34)', color: '#BDE8C4' },
  warning: { background: 'rgba(250,189,109,.24)', color: '#FFD9A3' },
  danger: { background: 'rgba(217,74,72,.26)', color: '#FFC9BF' },
}

/** One sentence a tester can act on. Tinted ground, no icon, no border. */
export function Notice({ tone = 'info', dark = false, children }) {
  const t = (dark ? DARK : LIGHT)[tone] ?? (dark ? DARK : LIGHT).info
  return (
    <div role="status" style={{
      ...t, borderRadius: 'var(--radius-lg)', padding: 'var(--space-3) var(--space-4)',
      fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)', fontFamily: 'var(--font-body)',
    }}>{children}</div>
  )
}
