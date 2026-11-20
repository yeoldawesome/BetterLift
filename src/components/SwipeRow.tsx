import { useRef, type ReactNode } from 'react'
import { TrashIcon } from './icons'

/**
 * A row in a CSS grid (it spans every column and lines its cells up with the parent's via subgrid) that you can
 * swipe left or right to delete. Only a clearly sideways drag starts a swipe, so vertical scrolling and taps work as usual.
 * The row follows the finger; past the line (or with a quick flick) the red turns solid and letting go slides it out,
 * then the gap closes up.
 */
export function SwipeRow({ onDelete, children, label = 'Delete' }: { onDelete: () => void; children: ReactNode; label?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; id: number; on: boolean; dx: number; v: number; t: number; past: boolean } | null>(null)
  const swipedAt = useRef(0)

  const width = () => row.current?.offsetWidth ?? 320
  const limit = () => Math.min(140, width() * 0.4)

  // Moves are written straight to the DOM (no re-render per frame) so the drag keeps up with the finger.
  const paint = (dx: number, anim: boolean) => {
    const r = row.current, b = bg.current
    if (!r || !b) return
    r.style.transition = anim ? 'transform .2s cubic-bezier(.2,.8,.2,1)' : 'none'
    r.style.transform = dx ? `translateX(${dx}px)` : ''
    const past = Math.abs(dx) > limit()
    b.style.opacity = dx ? String(past ? 1 : Math.min(0.85, Math.abs(dx) / limit())) : '0'
    b.style.justifyContent = dx < 0 ? 'flex-end' : 'flex-start'
    b.dataset.past = past ? '1' : ''
  }

  const remove = (dir: number) => {
    const w = wrap.current
    paint(dir * width(), true)
    navigator.vibrate?.(12)
    setTimeout(() => {
      if (!w) return onDelete()
      // Close the gap: shrink the row to nothing, then actually remove it.
      w.style.height = `${w.offsetHeight}px`
      void w.offsetHeight
      w.style.transition = 'height .18s ease-out, opacity .18s'
      w.style.height = '0px'
      w.style.opacity = '0'
      setTimeout(() => {
        onDelete()
        // Rows are keyed by position, so this element now shows the next set: reset it instantly.
        w.style.transition = w.style.height = w.style.opacity = ''
        paint(0, false)
      }, 180)
    }, 160)
  }

  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d?.on) return
    swipedAt.current = Date.now()
    const flick = Math.abs(d.v) > 0.6 && Math.abs(d.dx) > 40 && Math.sign(d.v) === Math.sign(d.dx)
    if (Math.abs(d.dx) > limit() || flick) remove(Math.sign(d.dx))
    else paint(0, true)
  }

  return (
    <div ref={wrap} className="relative col-span-full grid grid-cols-subgrid overflow-hidden rounded-lg">
      <div ref={bg} aria-hidden style={{ opacity: 0 }}
        className="group absolute inset-0 flex items-center gap-2 rounded-lg bg-danger px-4 text-sm font-bold text-white">
        <TrashIcon width={18} height={18} className="transition-transform group-data-[past=1]:scale-125" />{label}
      </div>
      <div ref={row} data-swipe-row
        className="relative col-span-full grid grid-cols-subgrid gap-y-1.5 bg-surface"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0, v: 0, t: e.timeStamp, past: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || e.pointerId !== d.id) return
          const mx = e.clientX - d.x, my = e.clientY - d.y
          if (!d.on) {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { drag.current = null; return } // scrolling
            if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my) * 1.5) return
            d.on = true
            d.x = e.clientX - Math.sign(mx) * 2 // start from here so the row doesn't jump
            try { row.current?.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
            ;(document.activeElement as HTMLElement | null)?.blur?.()
          }
          const dx = e.clientX - d.x
          const dt = Math.max(1, e.timeStamp - d.t)
          d.v = 0.6 * d.v + 0.4 * ((dx - d.dx) / dt)
          d.dx = dx; d.t = e.timeStamp
          // A little buzz when you cross the delete line, so you know letting go will delete.
          const past = Math.abs(dx) > limit()
          if (past !== d.past) { d.past = past; if (past) navigator.vibrate?.(8) }
          paint(dx, false)
        }}
        onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        // A swipe shouldn't also count as a tap on whatever it started on.
        onClickCapture={(e) => { if (Date.now() - swipedAt.current < 350) { e.stopPropagation(); e.preventDefault() } }}>
        {children}
      </div>
    </div>
  )
}
