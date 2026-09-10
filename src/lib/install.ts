/**
 * Add to Home Screen, for the booth kiosk.
 *
 * The manifest and the apple meta tags in index.html already make the app installable; what was
 * missing was a way to ask. On iOS that matters more than anywhere else, because Safari has no
 * Fullscreen API (see fullscreen.ts) and the home-screen icon is the *only* way to run the booth
 * screen without the address bar taking a fifth of a phone.
 *
 * Two paths, because no single one covers the devices a festival actually has:
 *
 *   - Chromium (Android, desktop Chrome/Edge) fires `beforeinstallprompt`. Held onto and replayed
 *     when the organizer taps, that is a real one-tap install.
 *   - Safari — iOS and macOS — never fires it, and Firefox does not either. There the button can
 *     only show the two or three taps to do it by hand.
 *
 * `beforeinstallprompt` fires early, often before React has mounted, and only once. So the
 * listener is attached at module scope and the event is stashed here; main.tsx imports this file
 * for that side effect alone. A hook that attached its own listener would miss the event on a
 * cold load and the button would never light up.
 */
import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from './fullscreen'

/** The Chromium-only event. Not in lib.dom, so it is described here rather than cast away. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const announce = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Chromium shows its own mini-infobar unless this is prevented; the organizer should meet
    // this on a button they pressed, not as a banner over the QR code.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    announce()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    announce()
  })
}

/**
 * What the button can offer right now.
 *
 * `prompt`   — Chromium handed us an install event; one tap does it.
 * `manual`   — installable, but this browser has no prompt to replay: show the steps.
 * `done`     — already running from the home screen, or installed during this visit.
 */
export type InstallMode = 'prompt' | 'manual' | 'done'

/** Which set of by-hand steps to show, so the wording names the right menu. */
export type ManualPlatform = 'ios' | 'android' | 'desktop'

export function manualPlatform(): ManualPlatform {
  if (isIOS()) return 'ios'
  // The user agent first: a coarse pointer alone is also true of a Windows touchscreen laptop,
  // which does have the address-bar install icon, so keying only on that told desktop Chrome
  // users to look in a phone menu.
  if (/Android/i.test(navigator.userAgent)) return 'android'
  // No mouse at all — a Chrome OS tablet or an Android device with a spoofed agent.
  if (window.matchMedia?.('(pointer: coarse)').matches && window.matchMedia?.('(any-hover: none)').matches) return 'android'
  return 'desktop'
}

export function useInstall(): { mode: InstallMode; platform: ManualPlatform; install: () => Promise<void> } {
  const [, bump] = useState(0)
  // `isStandalone()` is a media query, and a phone can be launched into the installed app while
  // this tab is still open, so it is read on every announce rather than captured once.
  const [standalone, setStandalone] = useState(() => isStandalone())

  useEffect(() => {
    const on = () => { setStandalone(isStandalone()); bump((n) => n + 1) }
    listeners.add(on)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', on)
    return () => { listeners.delete(on); mq?.removeEventListener?.('change', on) }
  }, [])

  const mode: InstallMode = standalone || installed ? 'done' : deferred ? 'prompt' : 'manual'

  async function install() {
    const e = deferred
    if (!e) return
    // Single use: Chromium will not accept the same event twice, and a stale one left in place
    // would leave the button looking live while doing nothing.
    deferred = null
    announce()
    try {
      await e.prompt()
      const { outcome } = await e.userChoice
      if (outcome === 'accepted') { installed = true; announce() }
    } catch {
      // A refused or already-consumed prompt is not an error worth showing; the manual steps
      // are what the button falls back to, and `deferred` is already cleared.
    }
  }

  return { mode, platform: manualPlatform(), install }
}
