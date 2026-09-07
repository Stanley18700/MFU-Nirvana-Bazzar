/**
 * Booth QR token — spec §5.2.
 *
 *   period   = 20 s (configurable per event)
 *   counter  = floor(unix_seconds / period)
 *   digest   = HMAC-SHA256(secret, boothId + ":" + counter)
 *   token    = base32(digest)[0..5]          -> 6 chars, also the manual code
 *   payload  = https://<host>/s/<boothId>.<counter>.<token>
 *
 * Uses Web Crypto so the very same file runs in the browser (booth screen)
 * and in Cloud Functions (verification). Never import Node-only crypto here.
 */

export const DEFAULT_PERIOD_SECONDS = 20
export const TOKEN_LENGTH = 6

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32(bytes: Uint8Array, chars: number): string {
  let bits = 0
  let value = 0
  let out = ''
  for (let i = 0; i < bytes.length && out.length < chars; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5 && out.length < chars) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

function subtle(): SubtleCrypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto
  if (!c?.subtle) throw new Error('Web Crypto is not available in this runtime')
  return c.subtle
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const g = globalThis as unknown as { atob?: (s: string) => string; Buffer?: { from(s: string, e: string): Uint8Array } }
  const bin = g.atob ? g.atob(b64) : g.Buffer!.from(b64, 'base64').toString()
  const src = g.atob ? null : g.Buffer!.from(b64, 'base64')
  const len = src ? src.length : bin.length
  const out = new Uint8Array(new ArrayBuffer(len))
  for (let i = 0; i < len; i++) out[i] = src ? src[i] : bin.charCodeAt(i)
  return out
}

export function counterFor(unixMs: number, periodSeconds = DEFAULT_PERIOD_SECONDS): number {
  return Math.floor(unixMs / 1000 / periodSeconds)
}

/** Milliseconds until the counter next changes. */
export function msUntilRotation(unixMs: number, periodSeconds = DEFAULT_PERIOD_SECONDS): number {
  const p = periodSeconds * 1000
  return p - (unixMs % p)
}

export async function computeToken(secretB64: string, boothId: string, counter: number): Promise<string> {
  const key = await subtle().importKey(
    'raw',
    base64ToBytes(secretB64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const msg = new TextEncoder().encode(`${boothId}:${counter}`)
  const sig = await subtle().sign('HMAC', key, msg)
  return base32(new Uint8Array(sig), TOKEN_LENGTH)
}

export function buildPayload(origin: string, boothId: string, counter: number, token: string): string {
  return `${origin}/s/${boothId}.${counter}.${token}`
}

export interface ParsedToken { boothId: string; counter: number; token: string }

/** Accepts a full URL, the `/s/...` path, or the bare `boothId.counter.token` triple. */
export function parsePayload(input: string): ParsedToken | null {
  const s = input.trim()
  const m = s.match(/(?:^|\/s\/)([A-Za-z0-9_-]+)\.(\d+)\.([A-Z2-7]{6})(?:[/?#]|$)/i)
  if (!m) return null
  return { boothId: m[1], counter: Number(m[2]), token: m[3].toUpperCase() }
}

/** Normalise what a visitor types into the manual-code field. */
export function normaliseManualCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, '').slice(0, TOKEN_LENGTH)
}

/** Format a token for reading aloud: "1PZ QVJ". */
export function formatManualCode(token: string): string {
  return `${token.slice(0, 3)} ${token.slice(3)}`
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
