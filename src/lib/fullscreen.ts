/**
 * Full screen, and what to say when it is not on offer.
 *
 * iPhone Safari does not implement the Fullscreen API at all — `requestFullscreen` and even
 * `webkitRequestFullscreen` are undefined on the document element; only `<video>` has
 * `webkitEnterFullscreen`. iPadOS 13+ does have the webkit form. So the booth screen's "press F11"
 * hint was desktop advice being shown on a phone with no keyboard, which is what the organizer
 * saw at the gate.
 *
 * On iOS the route to a chrome-free booth screen is Add to Home Screen: opened from there, with
 * the manifest and the apple meta tags in index.html, Safari drops its address bar and toolbar —
 * which is what "full screen" means for a kiosk left on a table all day.
 */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

/** True when the page is already running without browser chrome (home-screen app, or full screen). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    nav.standalone === true
  )
}

/** iPhone, iPad and iPod — including iPadOS, which reports itself as a Mac with a touchscreen. */
export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function fullscreenElement(): Element | null {
  const d = document as FsDocument
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

/** Whichever of the two spellings this browser has, or null when it has neither. */
function requester(): (() => Promise<void> | void) | null {
  const el = document.documentElement as FsElement
  if (el.requestFullscreen) return () => el.requestFullscreen()
  if (el.webkitRequestFullscreen) return () => el.webkitRequestFullscreen!()
  return null
}

export function fullscreenSupported(): boolean {
  return requester() !== null
}

/** Why the Full screen button cannot help, so the caller can say the right thing. */
export type FsFailure = 'ios' | 'unsupported' | 'blocked'

/**
 * Ask for full screen. Resolves `null` on success, or the reason it could not happen — the caller
 * turns that into a message, since the wording is translated.
 */
export async function requestFullscreen(): Promise<FsFailure | null> {
  const req = requester()
  if (!req) return isIOS() ? 'ios' : 'unsupported'
  try {
    await req()
    return null
  } catch {
    return 'blocked'
  }
}

export async function exitFullscreen(): Promise<void> {
  const d = document as FsDocument
  try {
    if (d.fullscreenElement && d.exitFullscreen) await d.exitFullscreen()
    else if (d.webkitFullscreenElement && d.webkitExitFullscreen) await d.webkitExitFullscreen()
  } catch { /* leaving full screen is never worth an error */ }
}

/** Both spellings of the change event, so a webkit-only browser still updates the button. */
export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener('fullscreenchange', handler)
  document.addEventListener('webkitfullscreenchange', handler)
  return () => {
    document.removeEventListener('fullscreenchange', handler)
    document.removeEventListener('webkitfullscreenchange', handler)
  }
}
