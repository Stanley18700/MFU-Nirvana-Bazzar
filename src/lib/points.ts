import { useEffect, useState } from 'react'
import type { BoothDoc } from '../../shared/model'
import { effectivePoints, nextPointChange } from '../../shared/points'
import { serverNow } from './serverClock'

/**
 * Expiry needs a clock update even when Firestore sends no new snapshot.
 *
 * Reads the server-corrected clock, not this device's: the server decides what a scan is
 * worth by comparing `pointsExpireAt` against its own clock, so a phone a few minutes out
 * would otherwise offer a boosted value the server will not honour. The per-second tick means
 * a skew learned part-way through a visit is picked up without anything subscribing to it.
 */
export function usePointsClock() {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const tick = () => setNow(serverNow())
    const timer = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

export function useRewardBooths<T extends BoothDoc>(booths: T[]) {
  const now = usePointsClock()
  return booths.map((b) => ({ ...b, rewardPoints: effectivePoints(b, now) }))
}

/**
 * "Until 10:45 · then 27 points" — the NEXT change to this booth's value, whichever layer it
 * comes from: a boost ending (back to the scheduled value) or the scheduled value expiring
 * (back to base). Null when the booth is simply worth its base value.
 */
export function rewardExpiry(booth: BoothDoc, now: number) {
  const next = nextPointChange(booth, now)
  return next ? `Until ${pointTime(next.at)} · then ${next.points} points` : null
}

export function pointTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
}
