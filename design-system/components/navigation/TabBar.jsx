import React from 'react'

/** The passport's bottom bar: three pages, plus the scan button that floats above it. */
export function TabBar({ tabs = [], active, onChange, scanLabel = 'Scan a booth', onScan }) {
  return (
    <div style={{ position: 'relative', paddingTop: onScan ? 56 : 0 }}>
      {onScan && (
        <button onClick={onScan} aria-label={scanLabel} style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 62, height: 62, borderRadius: '50%', border: '4px solid #fff',
          background: 'var(--brand-primary)', color: '#fff', cursor: 'pointer',
          boxShadow: 'var(--shadow-float)', display: 'grid', placeItems: 'center', zIndex: 2,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M4 12h16" />
          </svg>
        </button>
      )}
      <nav aria-label="Passport pages" style={{
        display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        background: 'rgba(255,255,255,.94)', backdropFilter: `blur(var(--blur-glass))`,
        borderTop: `var(--border-thin) solid var(--border-hairline)`, paddingTop: 14, paddingBottom: 10,
      }}>
        {tabs.map((t) => {
          const on = t.id === active
          return (
            <button key={t.id} onClick={() => onChange?.(t.id)} aria-current={on ? 'page' : undefined} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)',
              color: on ? 'var(--ink-900)' : 'var(--ink-700)',
              transition: 'color var(--dur-fast) var(--ease-standard)',
            }}>
              <span style={{ color: on ? 'var(--sky-800)' : 'var(--ink-700)' }}>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
