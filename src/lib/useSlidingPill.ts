import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * However a strip in this app marks its current item: a NavLink sets `aria-current`, a tablist
 * sets `aria-selected`, and a two-state toggle like LangToggle sets `aria-pressed`.
 */
const ACTIVE = '[aria-current="page"],[aria-selected="true"],[aria-pressed="true"]'

/**
 * `offsetLeft`/`offsetTop`, never `getBoundingClientRect`: an absolutely positioned
 * pseudo-element's containing block is its parent's *padding* box, and `offsetLeft` counts from
 * that same origin — so the two agree with no correction for the strip's own `p-0.5`, and neither
 * moves when the strip sits inside a horizontal scroller.
 *
 * Width and height are written too, not just x: the items are different widths, and the pill is
 * the size of whichever one is current.
 */
function measure(strip: HTMLElement | null) {
  if (!strip) return
  const active = strip.querySelector<HTMLElement>(ACTIVE)
  // No current item — drop the flag so CSS hides the pill rather than stranding it on the last one.
  if (!active) { strip.removeAttribute('data-tab-ready'); return }
  strip.style.setProperty('--tab-x', `${active.offsetLeft}px`)
  strip.style.setProperty('--tab-y', `${active.offsetTop}px`)
  strip.style.setProperty('--tab-w', `${active.offsetWidth}px`)
  strip.style.setProperty('--tab-h', `${active.offsetHeight}px`)
  strip.setAttribute('data-tab-ready', 'true')
}

/**
 * One pill per strip, drawn once and *moved* between items, rather than a background that appears
 * on one item and vanishes from another.
 *
 * Attach the returned ref to the element carrying `.seg`, `.tab-group` or `.tab-rail`. Those
 * classes are `position: relative`, which is what makes the strip both the items' `offsetParent`
 * and the pseudo-element's containing block — the one invariant the whole technique rests on.
 */
export function useSlidingPill<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)

  /*
   * Subscribes the host component to navigation. A NavLink flips `aria-current` from inside its
   * own render, so if its parent happened not to re-render, this is what still runs the effect
   * below. It is why no MutationObserver is needed: React's render *is* the signal.
   */
  useLocation()

  /*
   * No dependency array, deliberately. This component re-renders only when something that could
   * have moved the pill changed, and reading four offsets is cheaper than working out which thing
   * it was. `useLayoutEffect` rather than `useEffect` because it has to land before paint —
   * otherwise the pill is painted at x=0 and slides in from under the leftmost item on mount.
   */
  useLayoutEffect(() => { measure(ref.current) })

  useEffect(() => {
    const strip = ref.current
    if (!strip) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => measure(strip))
    }
    // Window resize, and the reflow when a strip wraps onto a second line.
    const ro = new ResizeObserver(schedule)
    ro.observe(strip)
    // Web fonts land after first paint and change every item's width. Without this the pill keeps
    // the width it measured against the fallback face.
    void document.fonts?.ready.then(schedule)
    return () => { cancelAnimationFrame(frame); ro.disconnect() }
  }, [])

  return ref
}
