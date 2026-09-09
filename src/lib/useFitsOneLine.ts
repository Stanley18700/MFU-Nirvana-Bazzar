import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Does a nav strip still fit on one line inside the room it is given?
 *
 * Measuring the strip itself and then removing it oscillates: once the compact form has replaced
 * it there is nothing left to measure, so the next resize flips it back. Two things avoid that.
 * The natural width is measured once, on the first paint where the strip is laid out unwrapped,
 * and kept. And the element carrying this ref is `flex-1`, so it fills the room it is given
 * whichever form is inside it — its clientWidth is the room, not the content, and stays true.
 *
 * `key` is anything that changes the natural width — the item count, the language — and forces a
 * fresh measurement.
 */
export function useFitsOneLine<T extends HTMLElement = HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  const natural = useRef(0)
  const [fits, setFits] = useState(true)

  // Reset before paint, so the strip is rendered expanded for the frame we measure it in.
  useLayoutEffect(() => { natural.current = 0; setFits(true) }, [key])

  useLayoutEffect(() => {
    if (!natural.current && ref.current) natural.current = ref.current.scrollWidth
  })

  useEffect(() => {
    const box = ref.current
    if (!box) return
    const check = () => { if (natural.current) setFits(box.clientWidth >= natural.current) }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(box)
    // Web fonts land after first paint and every label changes width with them.
    void document.fonts?.ready.then(() => { natural.current = 0; requestAnimationFrame(check) })
    return () => ro.disconnect()
  }, [key])

  return { ref, fits }
}
