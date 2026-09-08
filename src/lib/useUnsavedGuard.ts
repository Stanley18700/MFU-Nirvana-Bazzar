import { useEffect } from 'react'

/**
 * Warn before the tab closes or reloads while a form has unsaved edits. The app uses
 * BrowserRouter, so in-app navigation cannot be blocked here; the pages that matter (Prizes,
 * Event, Reference lists) are single forms, and closing the tab is the loss that actually happens.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
