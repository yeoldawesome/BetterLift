import { useEffect, useRef, useState } from 'react'

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']
/** UPC-A codes sometimes come back as 13-digit EAN with a leading 0; keep them consistent for lookups. */
const clean = (code: string) => code.replace(/\D/g, '')

/**
 * Live camera barcode scanner. Uses the browser's built-in BarcodeDetector where it exists (Chrome/Android) and
 * falls back to ZXing (loaded on demand) everywhere else, including iPhone Safari. Calls onCode once.
 */
export default function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)
  const done = useRef(false)
  const cb = useRef(onCode)
  cb.current = onCode

  useEffect(() => {
    let stop = () => {}
    let cancelled = false
    const hit = (raw: string) => {
      const code = clean(raw)
      if (done.current || code.length < 6) return
      done.current = true
      navigator.vibrate?.(40)
      cb.current(code)
    }
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can\'t use the camera here. Type the barcode instead.')
      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      const supported = Native ? await Native.getSupportedFormats?.().catch(() => []) ?? [] : []
      if (Native && FORMATS.some((f) => supported.includes(f))) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = video.current!
        v.srcObject = stream
        await v.play()
        setReady(true)
        const det = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
        let timer = 0
        const tick = async () => {
          if (cancelled || done.current) return
          try { const r = await det.detect(v); if (r[0]?.rawValue) hit(r[0].rawValue) } catch { /* frame not ready */ }
          timer = window.setTimeout(tick, 150)
        }
        tick()
        stop = () => { window.clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()) }
      } else {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
        if (cancelled) return
        const hints = new Map<unknown, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]])
        const reader = new BrowserMultiFormatReader(hints as never, { delayBetweenScanAttempts: 120 })
        const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }, video.current!, (res) => { if (res) hit(res.getText()) })
        if (cancelled) { controls.stop(); return }
        setReady(true)
        stop = () => controls.stop()
      }
    })().catch((e: Error & { name?: string }) => {
      if (cancelled) return
      setErr(e?.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or type the barcode below.'
        : e?.name === 'NotFoundError' ? 'No camera found. Type the barcode below.'
        : e?.message || 'Couldn\'t start the camera.')
    })
    return () => { cancelled = true; stop() }
  }, [])

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-black">
      <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
      {!err && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-1/3 w-3/4 rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]">
            {ready && <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-[var(--color-danger)]" />}
          </div>
        </div>
      )}
      {(err || !ready) && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-white/90">
          {err || 'Starting camera…'}
        </div>
      )}
    </div>
  )
}
