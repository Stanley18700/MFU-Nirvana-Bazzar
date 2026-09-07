import { useCallback, useEffect, useState } from 'react'

/**
 * Seconds left before a "send it again" button may fire. `armed` starts the countdown at
 * mount, for pages that arrive right after a mail has already gone out (the verify-email
 * waiting room); `start()` restarts it after a resend.
 */
export function useCooldown(seconds: number, armed = false) {
  const [left, setLeft] = useState(armed ? seconds : 0)
  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [left])
  const start = useCallback(() => setLeft(seconds), [seconds])
  return { left, start }
}
