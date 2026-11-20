import { useEffect, useRef, type RefObject } from 'react'

type Axis = 'x' | 'y'

/** Installed to the home screen (no browser back gesture of its own). */
export const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

// The innermost swipeable element claims the touch so an outer one (the page under a sheet) doesn't also react.
const claimed = new WeakSet<Event>()

/** Things a sideways drag already means something on: charts, sliders, swipe-to-delete rows, sideways scrollers. */
function blocksX(target: Element, root: Element) {
  for (let n: Element | null = target; n && n !== root; n = n.parentElement) {
    if (n.matches('canvas, input[type=range], textarea, [data-swipe-row], [data-no-swipe]')) return true
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true
  }
  return false
}

/** Pulling down only dismisses when whatever you're touching is already scrolled to the top. */
function blocksY(target: Element, root: Element) {
  for (let n: Element | null = target; n; n = n.parentElement) {
    if (n.matches('[data-no-swipe]')) return true
    if (n.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return true
    if (n === root) break
  }
  return false
}

/**
 * Drag `ref` right (x) and/or down (y) with a finger to dismiss it: it follows the finger, and letting go past a third
 * of the way (or with a quick flick) slides it away and calls `onDismiss`; otherwise it springs back. Touch only.
 */
export function useSwipeDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, { axes = ['x'] as Axis[], enabled = true, fade }: { axes?: Axis[]; enabled?: boolean; fade?: RefObject<HTMLElement | null> } = {}) {
  const cb = useRef(onDismiss)
  cb.current = onDismiss
  const key = axes.join()
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let s: { x: number; y: number; axis: Axis | null; d: number; v: number; t: number; okX: boolean; okY: boolean } | null = null

    const paint = (d: number, axis: Axis, anim: boolean) => {
      const ease = anim ? 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s' : 'none'
      el.style.transition = ease
      el.style.transform = d ? `translate${axis.toUpperCase()}(${d}px)` : ''
      if (fade?.current) {
        fade.current.style.transition = ease
        fade.current.style.opacity = d ? String(Math.max(0, 1 - d / (axis === 'x' ? el.offsetWidth : el.offsetHeight))) : ''
      }
    }

    const start = (e: TouchEvent) => {
      s = null
      if (claimed.has(e) || e.touches.length !== 1) return
      claimed.add(e)
      const t = e.touches[0], target = e.target as Element
      // In a browser tab, the screen's left edge belongs to the browser's own back swipe.
      const okX = axes.includes('x') && !blocksX(target, el) && (standalone() || t.clientX > 24)
      const okY = axes.includes('y') && !blocksY(target, el)
      if (!okX && !okY) return
      s ={ x: t.clientX, y: t.clientY, axis: null, d: 0, v: 0, t: e.timeStamp, okX, okY }
    }

    const move = (e: TouchEvent) => {
      if (!s) return
      const t = e.touches[0], mx = t.clientX - s.x, my = t.clientY - s.y
      if (!s.axis) {
        const horiz = Math.abs(mx) > Math.abs(my)
        const main = horiz ? mx : my, cross = horiz ? my : mx
        if (Math.abs(main) < 10) return
        // Only a clear right (or down) drag counts; anything else is a scroll or a tap.
        if (main < 0 || Math.abs(main) < Math.abs(cross) * 1.3 || !(horiz ? s.okX : s.okY)) { s = null; return }
        s.axis = horiz ? 'x' : 'y'
        ;(document.activeElement as HTMLElement | null)?.blur?.()
      }
      e.preventDefault()
      const d = Math.max(0, s.axis === 'x' ? mx : my)
      const dt = Math.max(1, e.timeStamp - s.t)
      s.v = 0.6 * s.v + 0.4 * ((d - s.d) / dt) // px/ms, smoothed
      s.d = d; s.t = e.timeStamp
      paint(d, s.axis, false)
    }

    const end = () => {
      const g = s
      s = null
      if (!g?.axis) return
      const size = g.axis === 'x' ? el.offsetWidth : el.offsetHeight
      if (g.d > size / 3 || (g.v > 0.45 && g.d > 30)) {
        navigator.vibrate?.(8)
        paint(size, g.axis, true)
        setTimeout(() => {
          cb.current()
          // If the element is still on screen afterwards (e.g. a route that didn't change), put it back.
          setTimeout(() => { if (el.isConnected) paint(0, g.axis!, false) }, 60)
        }, 190)
      } else paint(0, g.axis, true)
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])
}
