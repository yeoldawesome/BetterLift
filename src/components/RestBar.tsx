import { useEffect, useRef, useState } from 'react'
import { useActive } from '../lib/active'
import { fmtClock } from '../lib/format'

export function RestBar() {
  const { rest, adjustRest, stopRest } = useActive()
  const [now, setNow] = useState(Date.now())
  const buzzed = useRef(0)
  useEffect(() => {
    if (!rest) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [rest])
  const left = rest ? (rest.end - now) / 1000 : 0
  useEffect(() => {
    if (rest && left <= 0 && buzzed.current !== rest.end) {
      buzzed.current = rest.end
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* unsupported */ }
      setTimeout(stopRest, 1500)
    }
  }, [rest, left, stopRest])
  if (!rest) return null
  const pct = Math.max(0, Math.min(1, left / rest.total))
  return (
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg px-3">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl">
        <div className="absolute inset-y-0 left-0 bg-accent/20 transition-[width] duration-200" style={{ width: `${pct * 100}%` }} />
        <div className="relative flex items-center gap-2 p-2">
          <span className="num flex-1 pl-2 text-2xl font-black">{left > 0 ? fmtClock(left) : 'Go!'}</span>
          <button onClick={() => adjustRest(-15)} className="h-9 rounded-xl bg-canvas/60 px-3 text-sm font-bold">−15</button>
          <button onClick={() => adjustRest(15)} className="h-9 rounded-xl bg-canvas/60 px-3 text-sm font-bold">+15</button>
          <button onClick={stopRest} className="h-9 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink">Skip</button>
        </div>
      </div>
    </div>
  )
}
