import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BodyMap } from '../components/BodyMap'
import { ChevronIcon, TrophyIcon } from '../components/icons'
import { Card, Empty, Screen, Spinner } from '../components/ui'
import { fmtDur } from '../lib/format'
import { intensityFromSets, type Intensity } from '../lib/muscles'
import { me, pb, useUser, type Exercise, type Workout } from '../lib/pb'

type W = Pick<Workout, 'id' | 'name' | 'started_at' | 'duration_s' | 'accent' | 'pr_count'>
type SetRow = { workout: string; expand?: { exercise?: Pick<Exercise, 'muscle' | 'primaries' | 'secondary' | 'kind'> } }
type Day = { ws: W[]; intensity: Intensity; accent: string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`

/** Link into the calendar: a whole month, or a single day (opens that day's workouts). */
export const calendarLink = (d: Date, unit: 'day' | 'week' | 'month') => unit === 'month' ? `/calendar?m=${monthKey(d)}` : `/calendar?d=${dayKey(d)}`

/**
 * Every month from your first workout to now, oldest at the top. Each training day shows a mini body graph of
 * what you hit, in that workout's color. Opens at the current month, or the month/day given by ?m= / ?d=.
 */
export default function Calendar() {
  const user = useUser()!
  const [params] = useSearchParams()
  const [days, setDays] = useState<Map<string, Day> | null>(null)
  const [first, setFirst] = useState<Date | null>(null)
  const [picked, setPicked] = useState<string | null>(params.get('d'))
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    const u = { u: me() }
    Promise.all([
      pb.collection('workouts').getFullList<W>({ filter: pb.filter('user = {:u}', u), sort: 'started_at', fields: 'id,name,started_at,duration_s,accent,pr_count', batch: 1000 }),
      pb.collection('workout_sets').getFullList<SetRow>({ filter: pb.filter('user = {:u} && completed = true', u), expand: 'exercise', fields: 'workout,expand.exercise.muscle,expand.exercise.secondary,expand.exercise.primaries,expand.exercise.kind', batch: 2000 }),
    ]).then(([ws, sets]) => {
      if (!live) return
      const byWorkout = new Map<string, SetRow[]>()
      sets.forEach((s) => byWorkout.set(s.workout, [...(byWorkout.get(s.workout) ?? []), s]))
      const groups = new Map<string, W[]>()
      ws.forEach((w) => { const k = dayKey(new Date(w.started_at)); groups.set(k, [...(groups.get(k) ?? []), w]) })
      const out = new Map<string, Day>()
      for (const [k, list] of groups) {
        const daySets = list.flatMap((w) => byWorkout.get(w.id) ?? []).map((s) => ({ ex: s.expand?.exercise }))
        out.set(k, { ws: list, intensity: intensityFromSets(daySets), accent: list[list.length - 1].accent })
      }
      setFirst(ws[0] ? new Date(ws[0].started_at) : null)
      setDays(out)
    }).catch(() => live && setDays(new Map()))
    return () => { live = false }
  }, [])

  // Months from the first workout's month through this month.
  const months = useMemo(() => {
    const now = new Date(), out: Date[] = []
    if (!first) return out
    for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= now; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) out.push(m)
    return out
  }, [first])

  // Which month to land on: the one asked for in the link, else the current month.
  const wanted = params.get('d')?.replace(/-\d+$/, '') ?? params.get('m') ?? monthKey(new Date())
  useLayoutEffect(() => { if (days) target.current?.scrollIntoView({ block: params.get('d') ? 'center' : 'start' }) }, [days])

  if (!days) return <Screen title="Calendar" back><Spinner /></Screen>
  if (!months.length) return <Screen title="Calendar" back><Empty title="No workouts yet" body="Every day you train shows up here with a mini body graph." /></Screen>

  return (
    <Screen title="Calendar" back>
      {months.map((m) => {
        const mk = monthKey(m)
        const lead = m.getDay(), count = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
        const cells = [...Array<Date | null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1))]
        const inMonth = cells.filter((d): d is Date => !!d).map((d) => days.get(dayKey(d))).filter((d): d is Day => !!d)
        const total = inMonth.reduce((t, d) => t + d.ws.length, 0)
        const sel = picked?.startsWith(mk + '-') ? days.get(picked) : undefined
        return (
          <div key={mk} ref={mk === wanted ? target : undefined} className="scroll-mt-4 space-y-2">
            <div className="flex items-baseline justify-between px-1 pt-2">
              <h2 className="text-lg font-extrabold">{MONTHS[m.getMonth()]} {m.getFullYear()}</h2>
              <span className="text-xs font-semibold text-muted">{total} workout{total === 1 ? '' : 's'} · {inMonth.length} day{inMonth.length === 1 ? '' : 's'}</span>
            </div>
            <MonthGrid cells={cells} days={days} sex={user.sex} picked={picked} onPick={(k) => setPicked(picked === k ? null : k)} />
            {sel && picked && <DayPanel day={sel} sex={user.sex} />}
          </div>
        )
      })}
    </Screen>
  )
}

function MonthGrid({ cells, days, sex, picked, onPick }: { cells: (Date | null)[]; days: Map<string, Day>; sex?: string; picked: string | null; onPick: (k: string) => void }) {
  const now = new Date(), today = dayKey(now)
  return (
    <Card className="p-2">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => <span key={d} className="pb-1 text-center text-[11px] font-semibold text-faint">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />
          const k = dayKey(d), day = days.get(k)
          const base = `relative flex aspect-[3/4] flex-col items-center overflow-hidden rounded-xl pt-0.5 ${k === today ? 'ring-2 ring-accent' : ''} ${picked === k ? 'ring-2 ring-ink' : ''}`
          const num = <span className={`num text-[11px] font-bold leading-none ${day ? 'text-ink' : d > now ? 'text-faint/50' : 'text-faint'}`}>{d.getDate()}</span>
          if (!day) return <span key={k} className={`${base} bg-surface-2/60`}>{num}</span>
          return (
            <button key={k} onClick={() => onPick(k)} className={`${base} bg-surface-2`} aria-label={`${d.toDateString()}: ${day.ws.length} workout${day.ws.length === 1 ? '' : 's'}`}>
              {num}
              <span className="flex flex-1 items-center justify-center"><BodyMap sex={sex} intensity={day.intensity} accent={day.accent} className="h-[min(11vw,3.25rem)] gap-0!" /></span>
              {day.ws.length > 1 && <span className="num absolute right-1 top-0.5 text-[9px] font-bold text-accent">×{day.ws.length}</span>}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function DayPanel({ day, sex }: { day: Day; sex?: string }) {
  return (
    <Card className="space-y-2">
      <p className="text-sm font-bold text-muted">{new Date(day.ws[0].started_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <div className="flex justify-center py-1"><BodyMap sex={sex} intensity={day.intensity} accent={day.accent} className="h-40" labels /></div>
      {day.ws.map((w) => (
        <Link key={w.id} to={`/w/${w.id}`} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{w.name || 'Workout'}</span>
            <span className="block text-xs text-muted">{new Date(w.started_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {fmtDur(w.duration_s)}</span>
          </span>
          {w.pr_count > 0 && <span className="flex items-center gap-1 text-xs font-bold text-accent"><TrophyIcon width={12} height={12} />{w.pr_count}</span>}
          <ChevronIcon width={16} height={16} className="text-muted" />
        </Link>
      ))}
    </Card>
  )
}
