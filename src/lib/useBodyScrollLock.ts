import { useEffect } from 'react'

/**
 * Stop the page scrolling underneath an overlay.
 *
 * The admin's drawer did this inline and the passport's booth sheet did not, so tapping a visa and
 * then scrolling moved the grid behind the card. One hook, so a new overlay cannot forget.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}
