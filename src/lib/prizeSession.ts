import { useEffect, useState } from 'react'
import { useEvent } from './data'
import { serverNow } from './serverClock'
import {
  currentPrizeSession, nextPrizeSession, sessionStockRemaining,
  type ActiveSession, type PrizeTierDoc,
} from '../../shared/model'

/**
 * The gift is stocked per session, so "how many are left" is only answerable while a session is
 * open. Ticking every 30 s keeps the count honest across a session boundary without anyone
 * having to reload — at 11:59:30 the morning count is still the truth, at 12:00:30 it is not.
 *
 * Shared by the visitor's Prize page and the prize desk deliberately. The two screens word
 * things differently — one is addressed to someone hoping for a gift, the other to the person
 * handing it over — but they must never disagree about whether the desk is open, so the clock
 * and the three states below live in one place.
 *
 * Reads the server-corrected clock: a session boundary is wall-clock, so a tablet a few minutes
 * out would otherwise announce "collect from 12:00" at 12:01. `serverNow()` falls back to this
 * device's clock until a callable has reported the server's.
 */
export function usePrizeSession() {
  const event = useEvent()
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 30_000)
    return () => clearInterval(t)
  }, [])
  const days = event.days
  const sessions = event.prizeSessions ?? []
  return {
    active: currentPrizeSession(days, sessions, now),
    next: nextPrizeSession(days, sessions, now),
    now,
  }
}

/**
 * The three states a gift's stock can be in, named once so no screen has to re-derive them.
 *
 * The distinction this exists to protect: `closed` and `gone` are different things.
 * `sessionStockRemaining` returns `null` for a shut desk and `0` for an open one with nothing
 * left, and a caller that treats them alike tells a visitor they missed out when in fact they
 * only have to wait — so this returns a tagged state rather than a number that invites `<= 0`.
 */
export type PrizeStock =
  | { state: 'closed' }
  | { state: 'gone'; capacity: number }
  | { state: 'open'; remaining: number; capacity: number; low: boolean }

export function prizeStock(
  tier: Pick<PrizeTierDoc, 'stockPerSession' | 'sessionRemaining' | 'stockRemaining' | 'stockTotal'>,
  active: ActiveSession | null,
): PrizeStock {
  const remaining = sessionStockRemaining(tier, active)
  const perSession = typeof tier.stockPerSession === 'number'
  const capacity = perSession ? tier.stockPerSession as number : tier.stockTotal
  if (remaining === null) return { state: 'closed' }
  if (remaining <= 0) return { state: 'gone', capacity }
  return { state: 'open', remaining, capacity, low: capacity > 0 && remaining / capacity < 0.2 }
}
