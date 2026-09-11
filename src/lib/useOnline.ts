import { useEffect, useState } from 'react'

/**
 * Whether the browser thinks it has a connection.
 *
 * Losing the network is not a listener error: Firestore keeps serving from its cache without
 * complaining, so `<DataErrors/>` stays silent and the screen simply shows whatever it last
 * knew. On a visitor's passport that is indistinguishable from being up to date, which is the
 * wrong impression to leave someone standing in a hall wondering whether their stamp counted.
 *
 * `navigator.onLine` only reports whether an interface is up, not whether anything is
 * reachable — it is a reliable "definitely offline" and an unreliable "definitely online",
 * which is exactly the direction we need here.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
