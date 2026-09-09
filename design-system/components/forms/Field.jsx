import React from 'react'

/** Text, select or textarea in one wrapper: label, control, hint / error. */
export function Field({ label, hint, error, as = 'input', options = [], required = false, disabled = false, id, ...rest }) {
  const [focus, setFocus] = React.useState(false)
  const fid = id || `f-${label ? label.replace(/\W+/g, '-').toLowerCase() : 'field'}`
  const control = {
    width: '100%', boxSizing: 'border-box', font: 'inherit',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)', color: 'var(--ink-900)',
    background: disabled ? 'var(--ink-100)' : '#fff',
    border: `var(--border-thin) solid ${error ? 'var(--status-danger)' : focus ? 'var(--sky-700)' : 'var(--border-strong)'}`,
    borderRadius: 'var(--radius-md)', padding: '11px 14px', outline: 'none',
    boxShadow: focus ? `0 0 0 3px ${error ? 'rgba(217,74,72,.18)' : 'rgba(35,169,201,.20)'}` : 'none',
    transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
  }
  const shared = { id: fid, disabled, onFocus: () => setFocus(true), onBlur: () => setFocus(false), style: control, ...rest }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {label && (
        <label htmlFor={fid} style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--ink-900)' }}>
          {label}{required && <span style={{ color: 'var(--status-danger)' }}> *</span>}
        </label>
      )}
      {as === 'select'
        ? <select {...shared}>{options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select>
        : as === 'textarea'
        ? <textarea rows={4} {...shared} />
        : <input {...shared} />}
      {(error || hint) && (
        <div style={{ fontSize: 'var(--text-caption)', color: error ? 'var(--status-danger)' : 'var(--ink-700)' }}>{error || hint}</div>
      )}
    </div>
  )
}
