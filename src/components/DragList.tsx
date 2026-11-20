import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { GripIcon } from './icons'

type Drag = { from: number; to: number; dy: number; startY: number; tops: number[]; heights: number[]; gap: number }

/**
 * Vertical list you can reorder by dragging each row's grip handle (touch or mouse). Rows still render
 * their own up/down arrows; dragging just calls the same `onMove(from, to)`.
 */
export function DragList<T>({ items, keyOf, onMove, render, className = 'space-y-2' }: {
  items: T[]; keyOf: (t: T) => string; onMove: (from: number, to: number) => void
  render: (item: T, i: number, handle: ReactNode) => ReactNode
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const d = useRef<Drag | null>(null)
  const set = (v: Drag | null) => { d.current = v; setDrag(v) }

  const down = (i: number) => (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !box.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rows = [...box.current.children] as HTMLElement[]
    const rects = rows.map((r) => r.getBoundingClientRect())
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 8
    set({ from: i, to: i, dy: 0, startY: e.clientY, tops: rects.map((r) => r.top), heights: rects.map((r) => r.height), gap })
    try { navigator.vibrate?.(10) } catch { /* unsupported */ }
  }
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const s = d.current
    if (!s) return
    const dy = e.clientY - s.startY
    const mid = s.tops[s.from] + s.heights[s.from] / 2 + dy
    let to = 0
    for (let j = 0; j < s.tops.length; j++) if (j !== s.from && mid > s.tops[j] + s.heights[j] / 2) to++
    set({ ...s, dy, to })
  }
  const up = () => {
    const s = d.current
    set(null)
    if (s && s.to !== s.from) onMove(s.from, s.to)
  }

  const shift = (j: number) => {
    if (!drag) return 0
    if (j === drag.from) return drag.dy
    const h = drag.heights[drag.from] + drag.gap
    if (drag.from < drag.to && j > drag.from && j <= drag.to) return -h
    if (drag.from > drag.to && j < drag.from && j >= drag.to) return h
    return 0
  }

  return (
    <div ref={box} className={className}>
      {items.map((it, i) => {
        const handle = (
          <button type="button" data-no-swipe onPointerDown={down(i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-faint active:cursor-grabbing" aria-label="Drag to reorder">
            <GripIcon width={18} height={18} />
          </button>
        )
        const dragging = drag?.from === i
        return (
          <div key={keyOf(it)} style={{ transform: `translateY(${shift(i)}px)`, transition: dragging || !drag ? 'none' : 'transform 150ms', position: 'relative', zIndex: dragging ? 10 : undefined }}
            className={dragging ? 'scale-[1.02] opacity-95 shadow-2xl' : ''}>
            {render(it, i, handle)}
          </div>
        )
      })}
    </div>
  )
}
