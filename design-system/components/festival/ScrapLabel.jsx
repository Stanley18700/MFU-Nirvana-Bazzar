import React from 'react'

const TILTS = ['var(--tilt-scrap-a)', 'var(--tilt-scrap-b)', 'var(--tilt-scrap-c)']

/**
 * The torn-paper label from the key visual: a flat colour scrap, 2px corner, a
 * small fixed tilt and a hard offset shadow. This is how the festival names an
 * activity, a zone or a track.
 */
export function ScrapLabel({ children, color = 'var(--scrap-terracotta)', textColor = '#fff', size = 'md', index = 0, tape = false }) {
  const pad = { sm: '6px 12px', md: '9px 18px', lg: '13px 26px' }[size]
  const fs = { sm: 'var(--text-body-sm)', md: 'var(--text-body-lg)', lg: 'var(--text-title-2)' }[size]
  return (
    <span style={{ position: 'relative', display: 'inline-block', transform: `rotate(${TILTS[index % 3]})` }}>
      {tape && (
        <span aria-hidden style={{
          position: 'absolute', top: -9, left: '18%', width: 44, height: 17,
          background: 'rgba(224,135,97,.45)', transform: 'rotate(-7deg)', borderRadius: 1,
        }} />
      )}
      <span style={{
        display: 'inline-block', background: color, color: textColor,
        fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: fs,
        padding: pad, borderRadius: 'var(--radius-scrap)', boxShadow: 'var(--shadow-paper)',
      }}>{children}</span>
    </span>
  )
}
