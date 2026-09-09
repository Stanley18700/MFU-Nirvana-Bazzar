import React from 'react'

/** Loading state. Ring in the brand sky; label always present for screen readers. */
export function Spinner({ label = 'Loading…', dark = false, size = 18 }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-8)', color: dark ? 'rgba(255,255,255,.75)' : 'var(--ink-700)' }}>
      <span style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-block',
        border: `2px solid ${dark ? 'rgba(255,255,255,.25)' : 'var(--ink-100)'}`,
        borderTopColor: dark ? '#fff' : 'var(--sky-700)',
        animation: 'mfu-spin 700ms linear infinite',
      }} />
      <span style={{ fontSize: 'var(--text-body-sm)' }}>{label}</span>
      <style>{'@keyframes mfu-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}
