/**
 * How far this phone's clock is from the server's.
 *
 * A temporary booth reward expires at an absolute moment (`pointsExpireAt`, epoch ms set by
 * the server), and the server decides what a scan is worth by comparing that against *its*
 * clock (visitor.ts). The passport was comparing it against the phone's, so a handset a few
 * minutes slow would offer 25 points for a booth the server had already dropped back to 20 —
 * a number we showed and then did not honour.
 *
 * The formatted time is unaffected: `pointTime` renders an absolute epoch in Bangkok, which is
 * right whatever the phone believes. Only the comparisons need correcting.
 *
 * Every callable that already returns `serverTime` feeds this, so the correction costs no
 * extra round trip. Until one has, the skew is zero and the behaviour is what it was. Held in
 * memory rather than storage: a stale skew from a previous session is worse than none, and
 * the first scan or prize code of a visit sets it again.
 */
let skewMs = 0
let known = false

/** Record the server's clock, as reported by a callable that returns `serverTime`. */
export function setServerTime(serverTime: number | undefined) {
  if (typeof serverTime !== 'number' || !Number.isFinite(serverTime)) return
  skewMs = serverTime - Date.now()
  known = true
}

/** Now, as the server would see it. Falls back to this device's clock until we know better. */
export function serverNow(): number {
  return Date.now() + skewMs
}

/** Whether a server reading has been taken this session. */
export function serverClockKnown(): boolean {
  return known
}
