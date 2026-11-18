import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActive } from '../lib/active'
import { fmtClock } from '../lib/format'
import { TimerIcon } from './icons'

/** Slim bar at the top of the app while a workout is running: elapsed time + rest remaining. Tap to return. */
export function ActiveBanner() {
  const { active, rest } = useActive()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  if (!active) return null
  const elapsed = (now - new Date(active.startedAt).getTime()) / 1000
  const left = rest ? Math.ceil((rest.end - now) / 1000) : null
  return (
    <Link to="/workout" className="block shrink-0 bg-accent pt-safe text-accent-ink" aria-label="Return to your workout">
      <div className="mx-auto flex h-10 max-w-lg items-center gap-3 px-4 text-sm font-bold">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-ink/40" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent-ink" />
        </span>
        <span className="min-w-0 flex-1 truncate">{active.name || 'Workout'}</span>
        {left !== null && (
          <span className="num flex items-center gap-1 rounded-full bg-accent-ink/15 px-2 py-0.5">
            <TimerIcon width={14} height={14} />{left > 0 ? `Rest ${fmtClock(left)}` : 'Rest done — go!'}
          </span>
        )}
        <span className="num shrink-0">{fmtClock(elapsed)}</span>
      </div>
    </Link>
  )
}
