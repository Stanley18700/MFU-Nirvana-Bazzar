import { useEffect, useRef, useState } from 'react'

interface Props {
  onResult: (text: string) => void
  paused?: boolean
  className?: string
}

type Detector = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> }
declare global {
  interface Window { BarcodeDetector?: new (opts?: { formats: string[] }) => Detector }
}

/**
 * §4.3 — camera via BarcodeDetector where available, zxing-wasm otherwise.
 * Reports `permissionDenied` so the parent can show the manual-entry field.
 */
export function Scanner({ onResult, paused = false, className = '' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'denied' | 'unavailable'>('starting')
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const video = videoRef.current!
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (e) {
        console.warn('camera', e)
        setState('denied')
        return
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
      video.srcObject = stream
      await video.play().catch(() => undefined)
      setState('live')

      const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
      let zxing: null | ((img: ImageData) => Promise<string | null>) = null
      if (!native) {
        const mod = await import('zxing-wasm/reader')
        zxing = async (img) => {
          const res = await mod.readBarcodes(img, { formats: ['QRCode'], tryHarder: false, maxNumberOfSymbols: 1 })
          return res[0]?.text ?? null
        }
      }

      let busy = false
      const tick = async () => {
        if (stopped) return
        raf = requestAnimationFrame(tick)
        if (busy || pausedRef.current || video.readyState < 2) return
        busy = true
        try {
          let text: string | null = null
          if (native) {
            const codes = await native.detect(video)
            text = codes[0]?.rawValue ?? null
          } else if (zxing) {
            const w = Math.min(video.videoWidth, 640)
            const h = Math.round(video.videoHeight * (w / video.videoWidth))
            canvas.width = w; canvas.height = h
            ctx.drawImage(video, 0, 0, w, h)
            text = await zxing(ctx.getImageData(0, 0, w, h))
          }
          if (text) {
            const now = Date.now()
            if (text !== lastRef.current.text || now - lastRef.current.at > 2500) {
              lastRef.current = { text, at: now }
              onResult(text)
            }
          }
        } catch { /* frame skipped */ } finally { busy = false }
      }
      raf = requestAnimationFrame(tick)
    }
    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-chrome ${className}`}>
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      {state === 'live' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="aspect-square w-[65%] max-w-[14rem] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(14,24,38,.45)]" />
        </div>
      )}
      {state === 'starting' && <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Starting camera…</p>}
      {state === 'denied' && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/90">
          Camera permission was denied. Type the 6-character code shown under the booth's QR instead.
        </p>
      )}
      {state === 'unavailable' && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/90">
          No camera on this device. Type the 6-character code shown under the booth's QR instead.
        </p>
      )}
    </div>
  )
}
