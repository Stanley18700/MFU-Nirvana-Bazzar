import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDismissable } from '../lib/useDismissable'

export interface Option { value: string; label: string; hint?: string }

/**
 * A select we can actually style and animate.
 *
 * A native `<select>` renders its list in the OS, not the page: no transition can touch it, and on
 * Linux and Windows it arrives as a grey system menu in the middle of a rounded, teal form. This
 * keeps the parts of the native control that are worth keeping and rebuilds only the list.
 *
 * `<details>` again, for the same reasons as the account menu — the browser owns the open state,
 * the toggle keyboard, and the expanded state a screen reader announces — with the listbox
 * keyboard laid on top, because a select is not a menu: `ArrowUp`/`ArrowDown` walk the options,
 * `Home`/`End` jump, and typing letters seeks, which is the one native behaviour a 200-row country
 * list cannot do without. Escape and an outside press are `useDismissable`'s job, as everywhere.
 */
export function Select({
  value, onChange, options, placeholder = '— choose —', disabled = false, id, ariaLabel, className = '',
}: {
  /** Optional, because several of the forms this serves hold a field that is not filled in yet. */
  value: string | undefined
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
  className?: string
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ up: false, max: 264 })
  useDismissable(ref)

  /*
   * Open on whichever side has more room, and never taller than that room.
   *
   * Flipping alone is not enough: on a 360x780 screen the country field sits low enough that
   * neither side fits eleven options, and the list ran off the top of the window with no way to
   * reach the first few. Capping the height to the space that exists means it always lands on
   * screen and scrolls inside itself instead.
   *
   * `useLayoutEffect`, not `useEffect`: measured after paint, the list would open downwards for
   * one frame and then jump, which is worse than either placement on its own.
   */
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const gap = 12
      const below = window.innerHeight - r.bottom - gap
      const above = r.top - gap
      const wanted = Math.min(264, options.length * 34 + 12)
      const up = below < wanted && above > below
      const max = Math.max(132, Math.min(wanted, up ? above : below))
      setPlace((p) => (p.up === up && p.max === max ? p : { up, max }))
    }
    measure()
    /*
     * And again whenever the field moves under the open list. Measuring once was enough until the
     * page scrolled after opening — a field measured near the foot of the window opens upward,
     * and if the browser then scrolls it to the middle the list is left hanging off the top of
     * the screen. Capture phase, because the scroll may be in any ancestor rather than the window.
     */
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, options.length])

  const current = options.find((o) => o.value === value)
  const close = () => { const el = ref.current; if (el) { el.open = false; el.querySelector('summary')?.focus() } }

  // Opening lands on the current choice, the way a native select does, so the list starts where
  // the eye already is rather than at the top of two hundred countries.
  useEffect(() => {
    if (!open) return
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>('[role="option"]')
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const seek = useRef({ text: '', at: 0 })

  function onKeyDown(e: React.KeyboardEvent<HTMLDetailsElement>) {
    const el = ref.current
    if (!el) return
    if (!el.open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); el.open = true }
      return
    }
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    if (!items.length) return
    const here = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => { e.preventDefault(); const t = items[Math.max(0, Math.min(items.length - 1, i))]; t?.focus(); t?.scrollIntoView({ block: 'nearest' }) }

    if (e.key === 'ArrowDown') return go(here + 1)
    if (e.key === 'ArrowUp') return go(here - 1)
    if (e.key === 'Home') return go(0)
    if (e.key === 'End') return go(items.length - 1)
    if (e.key === 'Tab') { el.open = false; return }
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return

    // Type-ahead. The buffer expires so that "la" then a pause then "m" seeks M, not "lam".
    const now = Date.now()
    seek.current = { text: (now - seek.current.at < 700 ? seek.current.text : '') + e.key.toLowerCase(), at: now }
    const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(seek.current.text))
    if (hit >= 0) go(hit)
  }

  return (
    <details
      ref={ref} className={`relative ${className}`} onKeyDown={onKeyDown}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        id={id}
        className={`press-row field flex cursor-pointer list-none items-center gap-2 ${disabled ? 'pointer-events-none opacity-45' : ''}`}
        aria-label={ariaLabel} aria-haspopup="listbox" aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
        onClick={(e) => { if (disabled) e.preventDefault() }}
      >
        <span className={`min-w-0 flex-1 truncate text-left ${current ? '' : 'text-ink-soft/70'}`}>{current?.label ?? placeholder}</span>
        {current?.hint && <span className="shrink-0 text-xs text-ink-soft">{current.hint}</span>}
        <span aria-hidden className="shrink-0 text-[10px] text-ink-soft transition-transform duration-150 [[open]_&]:rotate-180">▾</span>
      </summary>

      <div
        ref={list} role="listbox" aria-label={ariaLabel}
        style={{ maxHeight: place.max }}
        className={`pop ${place.up ? 'pop-up' : ''} absolute inset-x-0 z-40 overflow-y-auto overscroll-contain rounded-xl bg-white p-1.5 text-sm text-ink shadow-lg ring-1 ring-black/10 ${place.up ? 'bottom-full mb-1' : 'mt-1'}`}
      >
        {options.map((o) => (
          <div
            key={o.value} role="option" tabIndex={-1} aria-selected={o.value === value}
            className="menu-item justify-between gap-3 aria-selected:font-semibold aria-selected:text-action"
            onClick={() => { onChange(o.value); close() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(o.value); close() } }}
          >
            <span className="min-w-0 truncate">{o.label}</span>
            {o.hint && <span className="shrink-0 text-xs font-normal text-ink-soft">{o.hint}</span>}
          </div>
        ))}
        {options.length === 0 && <div className="px-3 py-2 text-xs text-ink-soft">Nothing to choose from yet.</div>}
      </div>
    </details>
  )
}
