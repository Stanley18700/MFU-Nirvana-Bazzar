import { useEffect, type RefObject } from 'react'

/**
 * Escape and an outside press close a `<details>` popover.
 *
 * `<details>` gives us the disclosure for free — the button semantics, the expanded state a screen
 * reader announces, `Enter`/`Space` to toggle — but it gives us neither of these, so a menu left
 * open sits there while the reader clicks elsewhere. Both listeners are on the document because
 * the press we care about is the one that lands outside the element.
 */
export function useDismissable(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current
      if (!el?.open) return
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'pointerdown' && el.contains(e.target as Node)) return
      el.open = false
      // Escape returns focus to the trigger; a press elsewhere is already moving focus itself.
      if (e.type === 'keydown') el.querySelector('summary')?.focus()
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [ref])
}
