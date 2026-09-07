/**
 * CSV export, done properly (RFC 4180). The previous inline helper JSON-stringified each cell,
 * so a booth called `Design, "Art" & Media` reached Excel as three columns with stray
 * backslashes. Quotes are doubled, cells with commas / quotes / newlines are wrapped, lines end
 * CRLF, and a BOM goes first so Excel opens Thai names as UTF-8 instead of guessing.
 */
export type CsvValue = string | number | boolean | null | undefined
export type CsvRow = Record<string, CsvValue>

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Column order defaults to the union of keys across all rows, first-seen first. */
export function columnsOf(rows: CsvRow[]): string[] {
  const cols: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  return cols
}

export function toCsv(rows: CsvRow[], columns: string[] = columnsOf(rows)): string {
  const lines = [columns.map(cell).join(',')]
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','))
  return lines.join('\r\n') + '\r\n'
}

/** Triggers a browser download of `name.csv`. The object URL is released once the click has landed. */
export function downloadCsv(rows: CsvRow[], name: string, columns?: string[]): void {
  const blob = new Blob(['﻿', toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.endsWith('.csv') ? name : `${name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
