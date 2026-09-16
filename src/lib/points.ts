import { useEffect, useState } from 'react'
import { dayOf, type BoothDoc } from '../../shared/model'
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
  return next ? `Until ${pointTime(next.at, now)} · then ${next.points} points` : null
}

/**
 * A moment as a Bangkok clock time — "12:00" — with the day in front when it is not today's:
 * "Fri 18 Sep 12:00". The scheduled morning→afternoon switch is Friday noon, so on the days
 * before it a bare "Until 12:00" read as already passed once the afternoon came.
 */
export function pointTime(ms: number, now = ms) {
  const at = new Date(ms)
  const time = at.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
  if (dayOf(at) === dayOf(new Date(now))) return time
  return `${at.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}
