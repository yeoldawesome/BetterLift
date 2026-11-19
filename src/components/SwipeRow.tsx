import { useRef, useState, type ReactNode } from 'react'
import { TrashIcon } from './icons'

/**
 * A row in a CSS grid (it spans every column and lines its cells up with the parent's via subgrid) that you can
 * swipe right to delete. Only a clearly sideways drag starts a swipe, so vertical scrolling and taps work as usual.
 */
export function SwipeRow({ onDelete, children, label = 'Delete' }: { onDelete: () => void; children: ReactNode; label?: string }) {
  const row = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; id: number; on: boolean } | null>(null)
  const swipedAt = useRef(0)
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(true)

  const width = () => row.current?.offsetWidth ?? 320
  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d?.on) return
    swipedAt.current = Date.now()
    setAnim(true)
    if (dx > Math.max(90, width() * 0.35)) {
      setDx(width())
      setTimeout(() => { setAnim(false); setDx(0); onDelete() }, 170)
    } else setDx(0)
  }

  return (
    <div className="relative col-span-full grid grid-cols-subgrid overflow-hidden rounded-lg">
      <div aria-hidden className="absolute inset-0 flex items-center gap-2 rounded-lg bg-danger pl-4 text-sm font-bold text-white transition-opacity" style={{ opacity: dx > 4 ? 1 : 0 }}>
        <TrashIcon width={18} height={18} />{label}
      </div>
      <div ref={row} data-swipe-row
        className="relative col-span-full grid grid-cols-subgrid gap-y-1.5 bg-surface"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: anim ? 'transform .17s ease-out' : 'none', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || e.pointerId !== d.id) return
          const mx = e.clientX - d.x, my = e.clientY - d.y
          if (!d.on) {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { drag.current = null; return } // scrolling
            if (mx < 12 || mx < Math.abs(my) * 1.5) return
            d.on = true; setAnim(false)
            try { row.current?.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
            ;(document.activeElement as HTMLElement | null)?.blur?.()
          }
          setDx(Math.max(0, mx))
        }}
        onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        // A swipe shouldn't also count as a tap on whatever it started on.
        onClickCapture={(e) => { if (Date.now() - swipedAt.current < 350) { e.stopPropagation(); e.preventDefault() } }}>
        {children}
      </div>
    </div>
  )
}
