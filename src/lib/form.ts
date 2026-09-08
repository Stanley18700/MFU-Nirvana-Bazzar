/**
 * `Number('')` is 0, so an admin who clears a numeric field used to save a threshold of 0 or a QR
 * period of 0 without noticing. These read a text input into a number with a fallback and bounds.
 */
export function num(v: string | number, fallback: number, o: { min?: number; max?: number } = {}): number {
  const n = typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v)
  if (!Number.isFinite(n)) return fallback
  const lo = o.min ?? -Infinity, hi = o.max ?? Infinity
  return Math.min(hi, Math.max(lo, n))
}

/** For optional fields such as "order in the grid": empty stays undefined, garbage is dropped. */
export function numOpt(v: string, o: { min?: number; max?: number } = {}): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, n))
}
