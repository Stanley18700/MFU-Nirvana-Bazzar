import React from 'react'

/**
 * Download a panel as CSV. Disabled with the reason in the tooltip when there
 * is nothing to export; confirms first when the rows carry personal data.
 */
export function CsvButton({ rows = [], name = 'export', label = 'CSV', confirm, onExport }) {
  const empty = rows.length === 0
  const title = empty ? 'Nothing to export yet' : `Download ${rows.length} row${rows.length === 1 ? '' : 's'} as CSV`
  return (
    <span title={title} style={{ display: 'inline-flex' }}>
      <button
        type="button" disabled={empty} aria-label={`${label}: ${title}`}
        onClick={() => { if (confirm && !window.confirm(confirm)) return; onExport?.(rows, name) }}
        style={{
          font: 'inherit', fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-medium)', color: 'var(--ink-700)', background: 'none', border: 'none',
          padding: 0, cursor: empty ? 'not-allowed' : 'pointer',
          textDecoration: empty ? 'none' : 'underline', textUnderlineOffset: 2,
          opacity: empty ? 0.45 : 1,
        }}
      >{label}</button>
    </span>
  )
}
