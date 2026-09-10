import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * However a strip in this app marks its current item: a NavLink sets `aria-current`, a tablist
 * sets `aria-selected`, and a two-state toggle like LangToggle sets `aria-pressed`.
 */
const ACTIVE = '[aria-current="page"],[aria-selected="true"],[aria-pressed="true"]'

type Box = { x: number; y: number; w: number; h: number }

/**
 * Where each named strip's pill was last seen, kept outside React so it survives the strip being
 * unmounted. See `key` on the hook below.
 */
const LAST = new Map<string, Box>()

function place(strip: HTMLElement, box: Box) {
  strip.style.setProperty('--tab-x', `${box.x}px`)
  strip.style.setProperty('--tab-y', `${box.y}px`)
  strip.style.setProperty('--tab-w', `${box.w}px`)
  strip.style.setProperty('--tab-h', `${box.h}px`)
  strip.setAttribute('data-tab-ready', 'true')
}

/**
 * `offsetLeft`/`offsetTop`, never `getBoundingClientRect`: an absolutely positioned
 * pseudo-element's containing block is its parent's *padding* box, and `offsetLeft` counts from
 * that same origin — so the two agree with no correction for the strip's own `p-0.5`, and neither
 * moves when the strip sits inside a horizontal scroller.
 *
 * Width and height are written too, not just x: the items are different widths, and the pill is
 * the size of whichever one is current.
 */
function measure(strip: HTMLElement | null, key?: string) {
  // A detached strip measures 0 for everything, and storing that would teach the next one to
  // slide out of the top-left corner. This page swaps strips often enough for it to matter.
  if (!strip || !strip.isConnected) return
  const active = strip.querySelector<HTMLElement>(ACTIVE)
  // No current item — drop the flag so CSS hides the pill rather than stranding it on the last one.
  if (!active) { strip.removeAttribute('data-tab-ready'); return }
  const box = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }
  place(strip, box)
  if (key) LAST.set(key, box)
}

/**
 * One pill per strip, drawn once and *moved* between items, rather than a background that appears
 * on one item and vanishes from another.
 *
 * Attach the returned ref to the element carrying `.seg`, `.tab-group` or `.tab-rail`. Those
 * classes are `position: relative`, which is what makes the strip both the items' `offsetParent`
 * and the pseudo-element's containing block — the one invariant the whole technique rests on.
 *
 * Pass `key` only for a strip that is re-created on navigation rather than living in a layout
 * route; it is the name the pill's last position is remembered under, so the new strip can pick up
 * where the old one left off instead of starting from nothing.
 */
export function useSlidingPill<T extends HTMLElement = HTMLDivElement>(key?: string) {
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
  useLayoutEffect(() => {
    const strip = ref.current
    /*
     * A strip that lives in a layout route keeps its DOM across a navigation, so the pill simply
     * transitions from one item to the next. The organizer's bar does not: every page renders its
     * own, and it is swapped again whenever the strip collapses to a menu and back. Each time,
     * React hands us a brand new element whose vars start at zero, and the pill grew out of the
     * left edge instead of sliding from the tab you just left.
     *
     * So a strip that has never been measured — no `data-tab-ready`, which is a property of the
     * element and not of this hook's state, so it survives a remount and React's development
     * double-mount alike — is first put back where the last strip of the same name left it. That
     * paints; the frame after, it is measured, and the transition runs from the position the user
     * was actually looking at.
     *
     * `restoring` lives on the element too, because the effect re-runs before that frame lands
     * (a parent may set state on mount) and measuring in the same frame writes both
     * positions before a single paint, which is no transition at all.
     */
    if (strip && strip.dataset.tabRestoring) return
    if (strip && !strip.hasAttribute('data-tab-ready') && strip.querySelector(ACTIVE)) {
      const last = key ? LAST.get(key) : undefined
      if (last) {
        /*
         * Placed with transitions off, then flushed. A brand new element normally has no
         * before-change style to transition from — but anything that forces layout between React
         * inserting it and this effect (a sibling reading `clientHeight`, and this app has
         * several) gives it one, at the pill's zero defaults. The restore would then animate
         * 0 → the old position, and the measurement below would retarget it mid-flight: the pill
         * still grew out of the left edge, just by a longer route.
         */
        strip.dataset.tabJump = '1'
        place(strip, last)
        void strip.offsetWidth
        delete strip.dataset.tabJump
        strip.dataset.tabRestoring = '1'
        requestAnimationFrame(() => { delete strip.dataset.tabRestoring; measure(strip, key) })
        return
      }
    }
    measure(strip, key)
  })

  useEffect(() => {
    const strip = ref.current
    if (!strip) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => measure(strip, key))
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
