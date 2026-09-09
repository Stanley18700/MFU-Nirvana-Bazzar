import React from 'react'

/**
 * The poster voice: rounded display type in white on the sky ground, with the
 * hard 2px drop shadow from the key visual, over an optional sage pill kicker.
 */
export function PosterHeading({ kicker, children, sub, align = 'center', level = 1 }) {
  const H = `h${Math.min(3, Math.max(1, level))}`
  return (
    <div style={{ textAlign: align, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {kicker && (
        <span style={{
          background: 'var(--scrap-sage)', color: '#fff', borderRadius: 'var(--radius-pill)',
          padding: '8px 20px', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)',
          fontSize: 'var(--text-body-sm)', letterSpacing: '.06em', textTransform: 'uppercase',
        }}>{kicker}</span>
      )}
      {React.createElement(H, {
        style: {
          margin: 0, fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-black)',
          fontSize: level === 1 ? 'var(--text-display-2)' : 'var(--text-title-1)',
          lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)',
          color: '#fff', textShadow: 'var(--shadow-text-poster)', maxWidth: 'var(--measure-headline)',
        },
      }, children)}
      {sub && (
        <span style={{
          background: '#fff', color: 'var(--ink-700)', borderRadius: 'var(--radius-pill)',
          padding: '10px 24px', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-body)',
        }}>{sub}</span>
      )}
    </div>
  )
}
