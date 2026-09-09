import React from 'react'

/** Segmented control for the event's days plus "All". Used across the admin console. */
export function DaySelector({ days = [], value, onChange, allLabel = 'All' }) {
  const items = [...days.map((d, i) => ({ id: d, label: `Day ${i + 1}` })), { id: 'all', label: allLabel }]
  return (
    <div role="tablist" aria-label="Day selector" style={{
      display: 'inline-flex', gap: 2, padding: 3, background: 'rgba(23,65,78,.06)',
      borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-body)',
    }}>
      {items.map((it) => {
        const on = value === it.id
        return (
          <button key={it.id} role="tab" aria-selected={on} onClick={() => onChange?.(it.id)} style={{
            border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-body-sm)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-medium)',
            background: on ? '#fff' : 'transparent', color: on ? 'var(--ink-900)' : 'var(--ink-500)',
            boxShadow: on ? 'var(--shadow-sm)' : 'none',
            transition: 'background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
          }}>{it.label}</button>
        )
      })}
    </div>
  )
}
