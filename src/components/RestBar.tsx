import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useActive } from '../lib/active'
import { fmtClock } from '../lib/format'
import { ChevronIcon } from './icons'

/**
 * Floating card above the tab bar.
 *  - On the workout screen: the rest timer (−15 / +15 / Skip).
 *  - Anywhere else while a workout is running: "Workout in progress · 1 of 3 sets done", tap to resume.
 *    While resting it also shows the countdown (with a fill that drains) and a Skip button.
 */
export function RestBar() {
  const { active, rest, adjustRest, stopRest } = useActive()
  const nav = useNavigate()
  const onWorkout = useLocation().pathname === '/workout'
  const [now, setNow] = useState(Date.now())
  const buzzed = useRef(0)
  useEffect(() => {
    if (!rest && !active) return
    const t = setInterval(() => setNow(Date.now()), rest ? 250 : 1000)
    return () => clearInterval(t)
  }, [rest, active])
  const left = rest ? (rest.end - now) / 1000 : 0
  useEffect(() => {
    if (rest && left <= 0 && buzzed.current !== rest.end) {
      buzzed.current = rest.end
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* unsupported */ }
      setTimeout(stopRest, 1500)
    }
  }, [rest, left, stopRest])

  const pct = rest ? Math.max(0, Math.min(1, left / rest.total)) : 0
  const wrap = 'fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg px-3'

  if (onWorkout) {
    if (!rest) return null
    return (
      <div className={wrap}>
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

  if (!active) return null
  const sets = active.exercises.flatMap((x) => x.sets)
  const done = sets.filter((s) => s.done).length
  const elapsed = (now - new Date(active.startedAt).getTime()) / 1000
  const resting = !!rest
  return (
    <div className={wrap}>
      <div role="link" tabIndex={0} aria-label="Resume workout" data-workout-dock
        onClick={(e) => { if (!(e.target as Element).closest('button')) nav('/workout') }}
        onKeyDown={(e) => e.key === 'Enter' && nav('/workout')}
        className="relative cursor-pointer overflow-hidden rounded-2xl border border-accent/35 bg-[color-mix(in_oklab,var(--color-accent)_16%,var(--color-surface))] shadow-2xl active:opacity-90">
        {/* Rest drains from right to left behind the card. */}
        {resting && <div className="absolute inset-y-0 left-0 bg-accent/20 transition-[width] duration-200" style={{ width: `${pct * 100}%` }} />}
        <div className="relative flex items-center gap-3 px-4 py-3">
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/50" />
            <span className="relative inline-flex size-3 rounded-full bg-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-extrabold leading-tight">{resting ? (left > 0 ? 'Resting' : 'Rest done — go!') : 'Workout in progress'}</span>
            <span className="num block truncate text-sm text-muted">{done} of {sets.length} set{sets.length === 1 ? '' : 's'} done · {fmtClock(elapsed)}</span>
          </span>
          {resting ? (
            <>
              <span className="num shrink-0 text-2xl font-black text-accent">{left > 0 ? fmtClock(left) : '0:00'}</span>
              <button onClick={stopRest} className="h-9 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink">Skip</button>
            </>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-lg font-extrabold text-accent">Resume<ChevronIcon width={18} height={18} strokeWidth={2.5} /></span>
          )}
        </div>
      </div>
    </div>
  )
}
