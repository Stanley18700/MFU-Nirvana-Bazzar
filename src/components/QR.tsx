import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface Props { value: string; size?: number; dark?: string; light?: string; className?: string }

export function QR({ value, size = 320, dark = '#17263F', light = '#FFFFFF', className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current || !value) return
    QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark, light } }).catch(console.error)
  }, [value, size, dark, light])
  return <canvas ref={ref} width={size} height={size} className={`rounded-xl ${className}`} style={{ width: size, height: size, maxWidth: '100%' }} aria-label="QR code" />
}
