import { useEffect, useRef, type ReactNode } from 'react'
import { TrashIcon } from './icons'

/**
 * A row in a CSS grid (it spans every column and lines its cells up with the parent's via subgrid) that you can
 * swipe left or right to delete. A sideways drag anywhere on the row works, including starting on an input box.
 * Only a clearly sideways drag starts a swipe, so vertical scrolling and taps work as usual.
 *
 * Touch uses touch events (not pointer events): the browser fires pointercancel as soon as a finger that started on a
 * text input moves, which used to kill the swipe on unchecked sets. With touchmove we can preventDefault and keep it.
 */
export function SwipeRow({ onDelete, children, label = 'Delete', rowClass = 'bg-surface', flush = false }: {
  onDelete: () => void; children: ReactNode; label?: string
  /** Background/padding of the sliding row (must be opaque so the delete layer stays hidden). */
  rowClass?: string
  /** Square edges, for rows that run edge to edge. */
  flush?: boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const swipedAt = useRef(0)
  const del = useRef(onDelete)
  del.current = onDelete

  useEffect(() => {
    const r = row.current, b = bg.current, w = wrap.current
    if (!r || !b || !w) return
    let d: { x: number; y: number; on: boolean; dx: number; v: number; t: number; past: boolean } | null = null
    let busy = false

    const width = () => r.offsetWidth || 320
    const limit = () => Math.min(90, width() * 0.25) // past here, letting go deletes

    // Moves are written straight to the DOM (no re-render per frame) so the drag keeps up with the finger.
    const paint = (dx: number, anim: boolean) => {
      r.style.transition = anim ? 'transform .2s cubic-bezier(.2,.8,.2,1)' : 'none'
      r.style.transform = dx ? `translateX(${dx}px)` : ''
      const past = Math.abs(dx) > limit()
      b.style.opacity = dx ? String(past ? 1 : Math.min(0.85, 0.25 + Math.abs(dx) / limit())) : '0'
      b.style.justifyContent = dx < 0 ? 'flex-end' : 'flex-start'
      b.dataset.past = past ? '1' : ''
    }

    const remove = (dir: number) => {
      busy = true
      paint(dir * width(), true)
      navigator.vibrate?.(12)
      setTimeout(() => {
        // Close the gap: shrink the row to nothing, then actually remove it.
        w.style.height = `${w.offsetHeight}px`
        void w.offsetHeight
        w.style.transition = 'height .16s ease-out, opacity .16s'
        w.style.height = '0px'
        w.style.opacity = '0'
        setTimeout(() => {
          del.current()
          // Rows are keyed by position, so this element now shows the next set: reset it instantly.
          w.style.transition = w.style.height = w.style.opacity = ''
          paint(0, false)
          busy = false
        }, 160)
      }, 140)
    }

    const start = (x: number, y: number, t: number) => { d = busy ? null : { x, y, on: false, dx: 0, v: 0, t, past: false } }

    /** Returns true once the gesture is a swipe (so the caller can stop the browser from scrolling/selecting). */
    const move = (x: number, y: number, t: number) => {
      if (!d) return false
      const mx = x - d.x, my = y - d.y
      if (!d.on) {
        if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) { d = null; return false } // scrolling
        if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my) * 1.2) return false
        d.on = true
        d.x = x - Math.sign(mx) * 2 // start from here so the row doesn't jump
        ;(document.activeElement as HTMLElement | null)?.blur?.()
      }
      const dx = x - d.x
      const dt = Math.max(1, t - d.t)
      d.v = 0.6 * d.v + 0.4 * ((dx - d.dx) / dt)
      d.dx = dx; d.t = t
      // A little buzz when you cross the delete line, so you know letting go will delete.
      const past = Math.abs(dx) > limit()
      if (past !== d.past) { d.past = past; if (past) navigator.vibrate?.(8) }
      paint(dx, false)
      return true
    }

    const end = () => {
      const g = d
      d = null
      if (!g?.on) return
      swipedAt.current = Date.now()
      const flick = Math.abs(g.v) > 0.35 && Math.abs(g.dx) > 30 && Math.sign(g.v) === Math.sign(g.dx)
      if (Math.abs(g.dx) > limit() || flick) remove(Math.sign(g.dx))
      else paint(0, true)
    }

    // Touch
    const ts = (e: TouchEvent) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp); else d = null }
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t && move(t.clientX, t.clientY, e.timeStamp) && e.cancelable) e.preventDefault() }
    // Mouse (desktop testing)
    const md = (e: MouseEvent) => {
      if (e.button !== 0) return
      start(e.clientX, e.clientY, e.timeStamp)
      const mm = (ev: MouseEvent) => { if (move(ev.clientX, ev.clientY, ev.timeStamp)) ev.preventDefault() }
      const mu = () => { end(); removeEventListener('mousemove', mm); removeEventListener('mouseup', mu) }
      addEventListener('mousemove', mm)
      addEventListener('mouseup', mu)
    }

    r.addEventListener('touchstart', ts, { passive: true })
    r.addEventListener('touchmove', tm, { passive: false })
    r.addEventListener('touchend', end)
    r.addEventListener('touchcancel', end)
    r.addEventListener('mousedown', md)
    return () => {
      r.removeEventListener('touchstart', ts)
      r.removeEventListener('touchmove', tm)
      r.removeEventListener('touchend', end)
      r.removeEventListener('touchcancel', end)
      r.removeEventListener('mousedown', md)
    }
  }, [])

  return (
    <div ref={wrap} className={`relative col-span-full grid grid-cols-subgrid overflow-hidden ${flush ? '' : 'rounded-lg'}`}>
      <div ref={bg} aria-hidden style={{ opacity: 0 }}
        className={`group absolute inset-0 flex items-center gap-2 ${flush ? '' : 'rounded-lg'} bg-danger px-4 text-sm font-bold text-white`}>
        <TrashIcon width={18} height={18} className="transition-transform group-data-[past=1]:scale-125" />{label}
      </div>
      <div ref={row} data-swipe-row
        className={`relative col-span-full grid grid-cols-subgrid gap-y-1.5 transition-colors ${rowClass}`}
        style={{ touchAction: 'pan-y' }}
        // A swipe shouldn't also count as a tap (or focus an input) on whatever it started on.
        onClickCapture={(e) => { if (Date.now() - swipedAt.current < 350) { e.stopPropagation(); e.preventDefault() } }}>
        {children}
      </div>
    </div>
  )
}
