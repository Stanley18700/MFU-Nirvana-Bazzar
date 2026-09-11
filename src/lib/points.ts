import { useEffect, useState } from 'react'
import type { BoothDoc } from '../../shared/model'
import { effectivePoints } from '../../shared/points'

/** Expiry needs a clock update even when Firestore sends no new snapshot. */
export function usePointsClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
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

export function rewardExpiry(booth: BoothDoc, now: number) {
  return effectivePoints(booth, now) !== booth.points && (booth.pointsExpireAt ?? 0) > now
    ? `Until ${pointTime(booth.pointsExpireAt!)} · then ${booth.points} points` : null
}

export function pointTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
}
