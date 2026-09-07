import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import {
  collection, doc, onSnapshot, orderBy, query, where, limit, type DocumentData, type Query, type DocumentReference,
} from 'firebase/firestore'
import { db } from './firebase'
import type { BoothDoc, BoothStats, BucketDoc, EventDoc, EventStatsShard, PrizeTierDoc, TierUnlockDoc } from '../../shared/model'
import { DEFAULT_PASSPORT_PREFIX, EVENT_DAYS, EVENT_ID, STATS_SHARDS, ZONE_POINTS } from '../../shared/model'

export type WithId<T> = T & { id: string }

/**
 * Listener failures used to vanish: a denied read or a missing index left the hook returning an
 * empty list, and the page rendered as if nothing had happened. Each live hook now reports its
 * error here under its own id, and `<DataErrors/>` (components/ui) shows whatever is currently
 * failing on the page. `what` is a human label — "the booth list" — so the notice says which
 * data is missing rather than which Firestore path.
 */
export interface DataError { code: string; what: string }
const dataErrors = new Map<string, DataError>()
const dataErrorListeners = new Set<() => void>()
let dataErrorSnapshot: DataError[] = []
function reportDataError(id: string, e: DataError | null) {
  if (e) dataErrors.set(id, e)
  else if (!dataErrors.delete(id)) return
  dataErrorSnapshot = [...dataErrors.values()]
  dataErrorListeners.forEach((l) => l())
}
const subscribeDataErrors = (cb: () => void) => { dataErrorListeners.add(cb); return () => { dataErrorListeners.delete(cb) } }
const getDataErrors = () => dataErrorSnapshot
/** Every live listener on the page that is currently failing. */
export function useDataErrors(): DataError[] {
  return useSyncExternalStore(subscribeDataErrors, getDataErrors, getDataErrors)
}

export function useCollection<T = DocumentData>(q: Query | null, deps: unknown[] = [], what = 'this page'): { data: WithId<T>[]; loading: boolean; error: string | null; fromCache: boolean } {
  const id = useId()
  const [data, setData] = useState<WithId<T>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  useEffect(() => {
    if (!q) { setData([]); setLoading(false); return }
    setLoading(true)
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })))
      setFromCache(snap.metadata.fromCache)
      setLoading(false)
      setError(null)
      reportDataError(id, null)
    }, (e) => { setError(e.code); setLoading(false); reportDataError(id, { code: e.code, what }) })
    return () => { unsub(); reportDataError(id, null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, error, fromCache }
}

export function useDoc<T = DocumentData>(ref: DocumentReference | null, deps: unknown[] = [], what?: string): { data: WithId<T> | null; loading: boolean; error: string | null; fromCache: boolean } {
  const id = useId()
  const [data, setData] = useState<WithId<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  useEffect(() => {
    if (!ref) { setData(null); setLoading(false); return }
    const label = what ?? ref.path
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
      setData(snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null)
      setFromCache(snap.metadata.fromCache)
      setLoading(false)
      setError(null)
      reportDataError(id, null)
    }, (e) => { setError(e.code); setLoading(false); reportDataError(id, { code: e.code, what: label }) })
    return () => { unsub(); reportDataError(id, null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, error, fromCache }
}

export type LiveEvent = WithId<EventDoc>

const FALLBACK_EVENT: LiveEvent = {
  id: EVENT_ID,
  nameEn: 'MFU Go Global International Festival',
  nameTh: '',
  startsAt: null,
  endsAt: null,
  qrPeriodSeconds: 20,
  active: true,
  boothCount: 0,
  days: [...EVENT_DAYS],
  passportPrefix: DEFAULT_PASSPORT_PREFIX,
  zonePoints: { ...ZONE_POINTS },
  status: 'live',
}

/**
 * The one live event (spec 7.1). Days, dates, name, QR period and default zone points are
 * data, not constants, so the app can be reused for the next event without a redeploy.
 * Falls back to the seeded defaults while the listener is still opening or if nothing is live.
 */
export function useEvent(): LiveEvent {
  const { data } = useCollection<EventDoc>(query(collection(db, 'events'), where('status', '==', 'live'), limit(1)), [], 'the event')
  const ev = data[0]
  return useMemo(() => {
    if (!ev) return FALLBACK_EVENT
    return {
      ...FALLBACK_EVENT,
      ...ev,
      days: Array.isArray(ev.days) && ev.days.length ? ev.days : FALLBACK_EVENT.days,
      zonePoints: ev.zonePoints ?? FALLBACK_EVENT.zonePoints,
      passportPrefix: ev.passportPrefix || FALLBACK_EVENT.passportPrefix,
    }
  }, [ev])
}

/** Milliseconds for a Firestore Timestamp read straight off a snapshot. */
export function ms(v: unknown): number | null {
  if (!v) return null
  if (typeof v === 'number') return v
  const t = v as { toMillis?: () => number }
  return typeof t.toMillis === 'function' ? t.toMillis() : null
}

export function useBooths(includeInactive = false) {
  return useCollection<BoothDoc>(query(collection(db, 'booths'), orderBy('sortOrder')), [], 'the booth list').data
    .filter((b) => includeInactive || b.active)
}

export function useTiers() {
  return useCollection<PrizeTierDoc>(query(collection(db, 'prizeTiers'), orderBy('sortOrder')), [], 'the prize tiers').data
}

export function useMyUnlocks(uid: string | undefined) {
  return useCollection<TierUnlockDoc>(uid ? query(collection(db, 'tierUnlocks'), where('visitorId', '==', uid)) : null, [uid], 'your prize unlocks').data
}

/** §7.2 — the event counter is a 10-shard document, summed client-side. */
export function useEventStats() {
  const { data: shards, loading, fromCache } = useCollection<EventStatsShard>(collection(db, 'stats/event/shards'), [], 'the event counters')
  const { data: meta } = useDoc<{ activeLast15m?: number; updatedAt?: { toMillis(): number } }>(doc(db, 'stats/event'), [], 'the event counters')
  const totals = useMemo(() => {
    const t = { visitors: 0, stamps: 0, points: 0, redeemed: 0, visitorsWithStamps: 0, tierReached: 0, byVisitorType: {} as Record<string, number>, byCountry: {} as Record<string, number>, byInstitution: {} as Record<string, number>, bySchool: {} as Record<string, number>, byDay: {} as Record<string, { visitors: number; stamps: number }>, byEthnicGroup: {} as Record<string, number>, ethnicResponses: 0, ethnicDeclines: 0, crossSchool: {} as Record<string, Record<string, number>> }
    for (const s of shards as unknown as Array<EventStatsShard & Record<string, unknown>>) {
      t.visitors += s.visitors ?? 0; t.stamps += s.stamps ?? 0; t.points += s.points ?? 0; t.redeemed += s.redeemed ?? 0
      t.visitorsWithStamps += (s.visitorsWithStamps as number) ?? 0; t.tierReached += (s.tierReached as number) ?? 0
      t.ethnicResponses += (s.ethnicResponses as number) ?? 0; t.ethnicDeclines += (s.ethnicDeclines as number) ?? 0
      for (const k of ['byVisitorType', 'byCountry', 'byInstitution', 'bySchool', 'byEthnicGroup'] as const) {
        for (const [key, v] of Object.entries((s[k] as Record<string, number>) ?? {})) (t[k] as Record<string, number>)[key] = ((t[k] as Record<string, number>)[key] ?? 0) + v
      }
      for (const [day, v] of Object.entries(s.byDay ?? {})) {
        t.byDay[day] ??= { visitors: 0, stamps: 0 }
        t.byDay[day].visitors += v.visitors ?? 0; t.byDay[day].stamps += v.stamps ?? 0
      }
      for (const [school, row] of Object.entries((s.crossSchool as Record<string, Record<string, number>>) ?? {})) {
        t.crossSchool[school] ??= {}
        for (const [booth, n] of Object.entries(row)) t.crossSchool[school][booth] = (t.crossSchool[school][booth] ?? 0) + n
      }
    }
    return t
  }, [shards])
  return { totals, activeLast15m: meta?.activeLast15m ?? 0, updatedAt: meta?.updatedAt?.toMillis() ?? null, loading, fromCache, shardCount: shards.length, expectedShards: STATS_SHARDS }
}

export function useBoothStats() {
  return useCollection<BoothStats>(collection(db, 'stats/booths/items'), [], 'the booth counters')
}

export function useBoothStat(boothId: string | null) {
  return useDoc<BoothStats>(boothId ? doc(db, 'stats/booths/items', boothId) : null, [boothId], 'this booth\u2019s counters')
}

/** Last N 5-minute buckets (§8.3: the dashboard reads the last 96). */
export function useBuckets(n = 96) {
  return useCollection<BucketDoc>(query(collection(db, 'stats/buckets/items'), orderBy('startsAt', 'desc'), limit(n)), [n], 'the timeline').data
}

export function useRefList(name: 'institutions' | 'mfuSchools') {
  const { data } = useDoc<{ list: string[] }>(doc(db, 'refData', name), [name], `the ${name === 'mfuSchools' ? 'school' : 'institution'} list`)
  return data?.list ?? []
}

export function useEthnicGroups() {
  const { data } = useDoc<Record<string, string[]>>(doc(db, 'refData', 'ethnicGroups'), [], 'the ethnic-group lists')
  return (data ?? {}) as Record<string, string[] | undefined>
}
