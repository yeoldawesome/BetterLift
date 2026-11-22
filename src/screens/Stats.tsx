// Stats page layout modeled on LiftoffVisualizer by JacobG122503 (github.com/JacobG122503/LiftoffVisualizer), used with permission.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSwipeDismiss } from '../lib/swipe'
import { BikeIcon, BoltIcon, BurstIcon, CalendarIcon, CloseIcon, DownIcon, FlameIcon, HistoryIcon, InfoIcon, MoonIcon, MuscleIcon, PlateIcon, PuzzleIcon, RepeatIcon, RulerIcon, ScaleIcon, SearchIcon, ShareIcon, SleepIcon, SproutIcon, StarIcon, StatsIcon, SunriseIcon, TagIcon, TimerIcon, TrendIcon, WorkoutIcon } from '../components/icons'
import { ExerciseInfo } from '../components/ExerciseInfo'
import { searchExercises } from '../lib/search'
import { LineChart } from '../components/LineChart'
import { PhysiqueView } from './Physique'
import { InsightsView } from './Insights'
import { RadarChart } from '../components/RadarChart'
import { BodyMap } from '../components/BodyMap'
import { MAP_MUSCLES, SUMMARY_GROUPS, cardioIntensity, groupSetCounts, isCardioEx, muscleGroup, muscleSetCounts } from '../lib/muscles'
import { Empty, Input, Screen, Spinner } from '../components/ui'
import { label } from '../lib/exercises'
import { bmi, distLabel, fmtW, toDist, toUnit } from '../lib/format'
import { isCardio } from '../lib/energy'
import { me, useUnit, useUser, type Exercise, type Unit, type User } from '../lib/pb'
import { useStatsRows, type StatRow } from '../lib/statsData'
import { buildStats, strengthIndex, chartable, effectiveMetric, fmtMinutes, fmtPace, isWeighted, lowerIsBetter, metricLabel, metricOptions, paceOf, trendDirection, trendLine, values, type DaySummary, type FlatSet, type Metric, type Snapshot, type StatKind } from '../lib/stats'

const RANGES: [string, number][] = [['15D', 15], ['30D', 30], ['90D', 90], ['6M', 180], ['1Y', 365], ['All', 0]]
const METRICS: [Metric, string][] = [['est1rm', 'Est. 1RM'], ['bestset', 'Best Set'], ['weight', 'Max Weight'], ['volume', 'Volume'], ['reps', 'Total Reps']]
const SORTS: [string, string][] = [['recent', 'Most Recent'], ['trend_up', 'Trending Up'], ['trend_down', 'Trending Down'], ['alpha_asc', 'A → Z'], ['alpha_desc', 'Z → A'], ['sessions', 'Most Sessions'], ['muscle', 'Muscle Group']]
type Dir = 'up' | 'down' | 'neutral'
type StatsTab = 'lifting' | 'physique' | 'insights'
const TABS: [StatsTab, string][] = [['lifting', 'Lifting'], ['physique', 'Physique'], ['insights', 'Insights']]

const n0 = (n: number) => Math.round(n).toLocaleString()
const day = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const clock = (d: Date | null) => (d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '-')
const inRange = (data: DaySummary[], days: number) => (days ? data.filter((d) => d.date.getTime() >= Date.now() - days * 86400000) : data)

function Trend({ dir, size = 12 }: { dir: Dir; size?: number }) {
  const title = dir === 'up' ? 'Trending up' : dir === 'down' ? 'Trending down' : 'No change'
  if (dir === 'up') return <svg width={size} height={size * 0.92} viewBox="0 0 12 11" aria-label={title}><polygon points="6,0 12,11 0,11" className="fill-accent" /></svg>
  if (dir === 'down') return <svg width={size} height={size * 0.92} viewBox="0 0 12 11" aria-label={title}><polygon points="0,0 12,0 6,11" className="fill-danger" /></svg>
  return <svg width={size + 2} height={6} viewBox="0 0 14 6" aria-label={title}><line x1="1" y1="3" x2="13" y2="3" className="stroke-muted" strokeWidth="2" strokeLinecap="round" /></svg>
}

function Pills<T extends string | number>({ value, options, onChange, small }: { value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]" onClick={(e) => e.stopPropagation()}>
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className={`shrink-0 rounded-lg font-bold transition ${small ? 'h-7 px-2 text-[11px]' : 'h-8 px-3 text-xs'} ${value === v ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{l}</button>
      ))}
    </div>
  )
}

/** Chart series + headline numbers for one exercise under a metric and range. */
function series(data: DaySummary[], kind: StatKind, metric: Metric, days: number, unit: Unit) {
  const all = inRange(data, days)
  const m = effectiveMetric(kind, metric, data)
  const d = chartable(all, m)
  const v = values(all, m)
  const raw = (d.length >= 2 ? trendDirection(v) : 'neutral') as Dir
  // Pace: going down is the good direction, so show it as "up".
  const dir: Dir = lowerIsBetter(m) ? (raw === 'up' ? 'down' : raw === 'down' ? 'up' : raw) : raw
  const dist = distLabel(unit)
  const tip = (x: DaySummary): string => {
    if (kind === 'bodyweight') return `${x.bestWeight > 0 ? `+${n0(x.bestWeight)} ${unit} × ` : ''}${x.bestReps} reps${m === 'est1rm' ? ` (est. 1RM ${n0(x.maxE1rm)} ${unit})` : ''}`
    if (kind === 'cardio') return [x.totalDistance > 0 && `${Math.round(x.totalDistance * 100) / 100} ${dist}`, x.totalSeconds > 0 && fmtMinutes(x.totalSeconds / 60), paceOf(x) > 0 && `${fmtPace(paceOf(x))} /${dist}`].filter(Boolean).join(' · ')
    if (kind === 'weight' && (m === 'est1rm' || m === 'bestset')) return x.bestWeight > 0 ? `${n0(x.bestWeight)} ${unit} × ${x.bestReps} reps${m === 'bestset' ? ` (est. 1RM ${n0(x.maxE1rm)})` : ''}` : ''
    return ''
  }
  const extras = d.map(tip)
  return {
    d: all, m, v, ...axis(m, unit),
    trend: v.length >= 2 ? trendLine(v) : undefined,
    dir,
    labels: d.map((x) => x.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })),
    extras: extras.some(Boolean) ? extras : undefined,
    /** Where each chart point came from (same order as the points). */
    links: d.map((x) => (x.workoutId ? `/w/${x.workoutId}${x.setId ? `?set=${x.setId}` : ''}` : '')),
  }
}

/** Value-axis title and formatting for a metric: time in minutes/hours, pace as m:ss, added weight with a +. */
function axis(m: Metric, unit: Unit): { yTitle: string; yFormat?: (v: number) => string } {
  const dist = distLabel(unit)
  switch (m) {
    case 'time': return { yTitle: 'Time', yFormat: (v) => fmtMinutes(v) }
    case 'longest': return { yTitle: 'Longest session', yFormat: (v) => fmtMinutes(v) }
    case 'maxtime': return { yTitle: 'Best hold', yFormat: (v) => (v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${Math.round(v)}s`) }
    case 'pace': return { yTitle: `Pace (min / ${dist})`, yFormat: (v) => fmtPace(v) }
    case 'distance': return { yTitle: `Distance (${dist})`, yFormat: (v) => `${Math.round(v * 100) / 100} ${dist}` }
    case 'added': return { yTitle: `Added weight (${unit})`, yFormat: (v) => `+${n0(v)} ${unit}` }
    case 'assist': return { yTitle: `Assistance (${unit})`, yFormat: (v) => `−${n0(Math.abs(v))} ${unit}` }
    case 'maxreps': return { yTitle: 'Reps (best set)', yFormat: (v) => `${Math.round(v)} reps` }
    case 'reps': return { yTitle: 'Total reps', yFormat: (v) => `${n0(v)} reps` }
    case 'volume': return { yTitle: `Volume (${unit})`, yFormat: (v) => `${n0(v)} ${unit}` }
    case 'est1rm': return { yTitle: `Est. 1RM (${unit})`, yFormat: (v) => `${n0(v)} ${unit}` }
    case 'weight': return { yTitle: `Max weight (${unit})`, yFormat: (v) => `${n0(v)} ${unit}` }
    case 'bestset': return { yTitle: `Best set (${unit})`, yFormat: (v) => `${n0(v)} ${unit}` }
  }
}

function CardStats({ d, kind, unit }: { d: DaySummary[]; kind: StatKind; unit: Unit }) {
  if (!d.length) return null
  const sessions: [string, string] = [`${d.length}`, 'Sessions']
  const totalMin = d.reduce((t, x) => t + x.totalSeconds, 0) / 60
  const maxReps = Math.max(...d.map((x) => x.maxReps))
  const totalReps: [string, string] = [n0(d.reduce((t, x) => t + x.totalReps, 0)), 'Total Reps']
  let cells: [string, string][]
  switch (kind) {
    case 'weight': {
      const best = d.reduce((a, b) => (b.maxE1rm > a.maxE1rm ? b : a))
      cells = [[`${n0(Math.max(...d.map((x) => x.maxWeight)))} ${unit}`, 'Best Weight'], [`${n0(best.maxE1rm)} ${unit}`, 'Est. 1RM'],
        [best.bestWeight > 0 ? `${n0(best.bestWeight)} × ${best.bestReps}` : '-', 'Best Set'], sessions]
      break
    }
    case 'bodyweight':
      cells = isWeighted(d)
        ? [[`${maxReps}`, 'Best Set (reps)'], [`+${n0(Math.max(...d.map((x) => x.maxWeight)))} ${unit}`, 'Max Added'],
          d.some((x) => x.maxE1rm > 0) ? [`${n0(Math.max(...d.map((x) => x.maxE1rm)))} ${unit}`, 'Est. 1RM'] : totalReps, sessions]
        : [[`${maxReps}`, 'Best Set (reps)'], totalReps, sessions]
      break
    case 'assisted': {
      const assisted = d.filter((x) => x.minWeight > 0)
      cells = [[assisted.length ? `−${n0(Math.min(...assisted.map((x) => x.minWeight)))} ${unit}` : 'None', 'Least Help'], [`${maxReps}`, 'Best Set (reps)'], totalReps, sessions]
      break
    }
    case 'duration':
      cells = [[`${Math.max(...d.map((x) => x.maxSeconds))}s`, 'Best Hold'], [fmtMinutes(totalMin), 'Total Time'], sessions]
      break
    case 'timed':
      cells = [[fmtMinutes(totalMin), 'Total Time'], [fmtMinutes(Math.max(...d.map((x) => x.maxSeconds)) / 60), 'Longest'], sessions]
      break
    case 'cardio': {
      const paces = d.map(paceOf).filter((x) => x > 0)
      const dist = d.reduce((t, x) => t + x.totalDistance, 0)
      cells = dist > 0
        ? [[`${Math.round(dist * 10) / 10}`, `Total ${distLabel(unit)}`], [fmtMinutes(totalMin), 'Total Time'], [paces.length ? fmtPace(Math.min(...paces)) : '-', `Best Pace /${distLabel(unit)}`], sessions]
        : [[fmtMinutes(totalMin), 'Total Time'], [fmtMinutes(Math.max(...d.map((x) => x.maxSeconds)) / 60), 'Longest'], sessions]
      break
    }
  }
  return (
    <div className={`grid gap-1 border-t border-line pt-2 ${cells.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {cells.map(([v, l]) => (
        <div key={l} className="min-w-0 text-center">
          <p className="num truncate text-sm font-black">{v}</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
        </div>
      ))}
    </div>
  )
}

/** Mounts the (relatively expensive) chart only when it scrolls within ~1 screen of view. */
function LazyChart(props: Parameters<typeof LineChart>[0]) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (!('IntersectionObserver' in window)) return setSeen(true)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return <div ref={ref}>{seen ? <LineChart {...props} /> : <div className={props.className} />}</div>
}

/** ⓘ next to an exercise name: opens the same info sheet as in a workout (how-to, stats, history). */
function InfoButton({ name, onInfo }: { name: string; onInfo?: () => void }) {
  if (!onInfo) return null
  return (
    <button onClick={(e) => { e.stopPropagation(); onInfo() }} aria-label={`About ${name}`}
      className="-m-1.5 grid size-8 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2"><InfoIcon width={18} height={18} /></button>
  )
}

function ExerciseCard({ name, kind, muscle, data, globalMetric, globalDays, unit, onOpen, onInfo }: {
  name: string; kind: StatKind; muscle: string; data: DaySummary[]; globalMetric: Metric; globalDays: number; unit: Unit; onOpen: () => void; onInfo?: () => void
}) {
  // Each card can override range/metric; changing the global controls resets every card to match.
  // Cards only offer metrics that fit the exercise (cardio: distance/time/pace, pull-ups: reps/added weight...).
  const options = useMemo(() => metricOptions(kind, data), [kind, data])
  const [metric, setMetric] = useState(() => effectiveMetric(kind, globalMetric, data))
  const [days, setDays] = useState(globalDays)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only the global choice resets cards, not data refreshes
  useEffect(() => setMetric(effectiveMetric(kind, globalMetric, data)), [globalMetric])
  useEffect(() => setDays(globalDays), [globalDays])
  const s = useMemo(() => series(data, kind, metric, days, unit), [data, kind, metric, days, unit])
  const empty = !s.d.length
  return (
    <div onClick={onOpen} className={`min-w-0 cursor-pointer space-y-2 rounded-2xl border border-line bg-surface p-3 transition active:scale-[0.99] ${empty ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-extrabold" title={name}><span className="truncate">{name}</span><InfoButton name={name} onInfo={onInfo} /></p>
          <span className="mt-0.5 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label(muscle)}</span>
        </div>
        <div className="pt-1.5"><Trend dir={s.dir} /></div>
      </div>
      <Pills small value={days} options={RANGES.map(([l, d]) => [d, l] as [number, string])} onChange={setDays} />
      {options.length > 1 && <Pills small value={s.m} options={options} onChange={setMetric} />}
      <div className="relative">
        {empty
          ? <div className="grid h-40 place-items-center text-sm text-muted">No sessions in this period</div>
          : <LazyChart className="h-40" labels={s.labels} values={s.v} trend={s.trend} extras={s.extras} yTitle={s.yTitle} yFormat={s.yFormat} />}
      </div>
      <CardStats d={s.d} kind={kind} unit={unit} />
    </div>
  )
}

function Fullscreen({ name, kind, muscle, data, metric0, days0, unit, onClose, onInfo }: {
  name: string; kind: StatKind; muscle: string; data: DaySummary[]; metric0: Metric; days0: number; unit: Unit; onClose: () => void; onInfo?: () => void
}) {
  const options = useMemo(() => metricOptions(kind, data), [kind, data])
  const [metric, setMetric] = useState(() => effectiveMetric(kind, metric0, data))
  const [days, setDays] = useState(days0)
  const s = useMemo(() => series(data, kind, metric, days, unit), [data, kind, metric, days, unit])
  const nav = useNavigate()
  const card = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  useSwipeDismiss(card, onClose, { axes: ['x', 'y'], fade: backdrop }) // swipe right or down to close
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3" onClick={onClose}>
      <div ref={backdrop} className="absolute inset-0 bg-black/70" />
      <div ref={card} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl space-y-3 rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xl font-extrabold"><span className="min-w-0">{name}</span><InfoButton name={name} onInfo={onInfo} /></p>
            <span className="inline-block rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label(muscle)}</span>
          </div>
          <div className="pt-2"><Trend dir={s.dir} size={14} /></div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2"><CloseIcon width={18} height={18} /></button>
        </div>
        <Pills value={days} options={RANGES.map(([l, d]) => [d, l] as [number, string])} onChange={setDays} />
        {options.length > 1 && <Pills value={s.m} options={options} onChange={setMetric} />}
        <p className="text-xs font-bold text-muted">{metricLabel(s.m, unit, distLabel(unit))}</p>
        {s.d.length
          ? <LineChart className="h-[50vh] max-h-96" labels={s.labels} values={s.v} trend={s.trend} extras={s.extras} yTitle={s.yTitle} yFormat={s.yFormat}
              onPoint={(i) => { if (s.links[i]) { onClose(); nav(s.links[i]) } }} />
          : <div className="grid h-60 place-items-center text-sm text-muted">No sessions in this period</div>}
        <CardStats d={s.d} kind={kind} unit={unit} />
      </div>
    </div>
  )
}

type MuscleRange = '7d' | 'lastweek' | 'all'

/** Which muscles you trained in a period: body graph + radar "skills" chart of weighted sets per muscle group. */
/** Open/closed state that survives closing the app (per device). */
function useRemembered(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s === null ? initial : s === '1' } catch { return initial } })
  return [v, (next) => { setV(next); try { localStorage.setItem(key, next ? '1' : '0') } catch { /* private mode */ } }]
}

/** Overall strength index (start = 100) across every weighted lift, week by week. */
function StrengthCard({ snap }: { snap: Snapshot }) {
  const s = useMemo(() => strengthIndex(snap), [snap])
  const [open, setOpen] = useRemembered('bl.strengthOpen', true)
  if (!s) return null
  const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`
  const tone = (x: number) => (x > 0.005 ? 'text-accent' : x < -0.005 ? 'text-danger' : 'text-muted')
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-4" data-strength>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <h2 className="font-extrabold">Overall strength</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {open ? `${s.lifts} lift${s.lifts === 1 ? '' : 's'}` : <span className={`num font-bold ${tone(s.total)}`}>{pct(s.total)} since start</span>}
          <DownIcon width={18} height={18} className={`transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 py-2"><p className={`num text-xl font-black ${tone(s.total)}`}>{pct(s.total)}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Since you started</p></div>
        <div className="rounded-xl bg-surface-2 py-2"><p className={`num text-xl font-black ${tone(s.recent)}`}>{pct(s.recent)}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Last 3 months</p></div>
      </div>
      <LineChart className="h-44" yTitle="Strength index" yFormat={(v) => `${Math.round(v)}`} values={s.values}
        labels={s.labels.map((d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }))}
        extras={s.values.map((v) => `${pct(v / 100 - 1)} vs start`)} />
      <p className="text-[11px] text-faint">Your est. 1RMs across all weighted lifts, combined into one line that starts at 100. Each lift counts its best from the last 6 weeks, so adding or dropping an exercise doesn't skew it.</p>
      </>}
    </div>
  )
}

function MusclesCard({ rows, sex }: { rows: StatRow[]; sex?: string }) {
  const [open, setOpen] = useRemembered('bl.musclesOpen', true)
  const [range, setRange] = useState<MuscleRange>('7d')
  const { counts, byGroup, cardio, sets, label: rangeLabel } = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let from = 0, to = Infinity, lbl = 'All time'
    if (range === '7d') { from = today.getTime() - 6 * 86400000; lbl = 'Last 7 days' }
    if (range === 'lastweek') {
      // Previous calendar week, Monday–Sunday.
      const dow = (today.getDay() + 6) % 7
      const thisMonday = today.getTime() - dow * 86400000
      from = thisMonday - 7 * 86400000; to = thisMonday
      lbl = `${new Date(from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(to - 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    }
    const inRangeRows = rows.filter((r) => { const t = new Date(r.set.performed_at).getTime(); return t >= from && t < to })
    return { counts: muscleSetCounts(inRangeRows), byGroup: groupSetCounts(inRangeRows), cardio: inRangeRows.filter((r) => r.ex && isCardioEx(r.ex)).length, sets: inRangeRows.length, label: lbl }
  }, [rows, range])
  const max = Math.max(0, ...Object.values(counts))
  const intensity = { ...Object.fromEntries(MAP_MUSCLES.map((m) => [m, max ? counts[m] / max : 0])), cardio: cardioIntensity(cardio) }
  // The body graph shows individual back/shoulder muscles; the lists roll them up into Back and Shoulders.
  // Cardio sits alongside the muscle groups here (sets of cardio), shown as the heart on the body graph.
  const all: Record<string, number> = { ...byGroup, cardio }
  const groups = [...SUMMARY_GROUPS, 'cardio']
  const ranked = groups.filter((m) => all[m] > 0).sort((a, b) => all[b] - all[a])
  const untrained = groups.filter((m) => !all[m])
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-muscles>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <h2 className="font-extrabold">Muscles trained</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">{rangeLabel} · {sets} sets<DownIcon width={18} height={18} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && <>
      <div className="flex rounded-xl bg-surface-2 p-1">
        {([['7d', 'Last 7 days'], ['lastweek', 'Last week'], ['all', 'All time']] as [MuscleRange, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} className={`h-8 flex-1 rounded-lg text-xs font-bold transition ${range === v ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      {!sets ? <p className="py-8 text-center text-sm text-muted">No sets logged in this period.</p> : (
        <>
          <div className="grid items-center gap-2 sm:grid-cols-2">
            <div className="flex justify-center"><BodyMap sex={sex} intensity={intensity} className="h-52" labels /></div>
            <RadarChart className="h-64" labels={groups.map((m) => label(m))} values={groups.map((m) => Math.round(all[m] * 10) / 10)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ranked.slice(0, 4).map((m, i) => (
              <span key={m} className={`rounded-full px-2.5 py-1 text-xs font-bold ${i === 0 ? 'bg-accent text-accent-ink' : 'bg-accent/15 text-accent'}`}>{label(m)} · {Math.round(all[m] * 10) / 10}</span>
            ))}
          </div>
          {untrained.length > 0 && untrained.length < groups.length && (
            <p className="text-xs text-muted">Not trained: {untrained.map((m) => label(m)).join(', ')}</p>
          )}
          <p className="text-[11px] text-faint">Sets per muscle group — secondary muscles count as half a set. Cardio lights up the heart.</p>
        </>
      )}
      </>}
    </div>
  )
}

function MoreStats({ snap, unit, bw, height }: { snap: Snapshot; unit: Unit; bw: number; height: number }) {
  const b = bmi(bw, height)
  const items: [typeof StatsIcon, string, string, string?][] = [
    [FlameIcon, `${snap.longestStreak}`, 'Longest Streak (days)'],
    [SleepIcon, `${snap.longestBreak}`, 'Longest Break (days)'],
    [StarIcon, snap.favorite, 'Favorite Exercise'],
    [TrendIcon, snap.mostImproved, `Most Improved (+${n0(snap.mostImprovedGain)} ${unit})`],
    [CalendarIcon, snap.activeWeekday, 'Day you train most often'],
    [HistoryIcon, snap.peakMonth, 'Your most active month'],
    [StatsIcon, `${snap.perWeek}`, 'Avg Workouts / Week Since Start', snap.firstDate ? `since ${day(snap.firstDate)}` : ''],
    [MuscleIcon, n0(snap.totalReps), 'Total Reps All Time'],
    [WorkoutIcon, snap.heaviest ? `${n0(snap.heaviest)} ${unit}` : '-', `Heaviest Lift${snap.heaviestExercise !== '-' ? ` (${snap.heaviestExercise})` : ''}`],
    [BoltIcon, `${snap.maxSetsInSession}`, 'Most Sets in One Day', day(snap.maxSetsDate)],
    [RepeatIcon, `${snap.maxRepsInSession}`, `Most Reps — ${snap.maxRepsExercise}`, day(snap.maxRepsDate)],
    [BurstIcon, `${n0(snap.maxVolumeInSession)} ${unit}`, 'Best Volume in One Day', day(snap.maxVolumeDate)],
    [PuzzleIcon, `${snap.maxExercisesInSession}`, 'Most Exercises in One Day', day(snap.maxExercisesDate)],
    [SproutIcon, snap.firstExercise, 'First Exercise Ever Logged'],
    [CalendarIcon, snap.consistentMonth, 'Most Consistent Month'],
    [TimerIcon, snap.avgDurationMin ? `${snap.avgDurationMin.toFixed(1)} min` : '-', 'Avg Workout Duration'],
    [SunriseIcon, clock(snap.earliest), 'Earliest Workout Time', snap.earliest ? `on ${day(snap.earliest)}` : ''],
    [MoonIcon, clock(snap.latest), 'Latest Workout Time', snap.latest ? `on ${day(snap.latest)}` : ''],
    [TagIcon, snap.favoriteWorkoutName, 'Most Frequent Workout Name'],
    [PlateIcon, snap.mostUsedWeight ? `${n0(snap.mostUsedWeight)} ${unit}` : '-', 'Most Used Weight'],
    [BikeIcon, snap.totalDistance ? `${snap.totalDistance.toFixed(1)} ${distLabel(unit)}` : '-', 'Total Distance'],
    [ScaleIcon, bw ? `${fmtW(bw, unit)} ${unit}` : '-', 'Current Bodyweight'],
    [RulerIcon, b ? b.toFixed(1) : '-', 'BMI'],
  ]
  const size = (v: string) => (v.length > 20 ? 'text-xs' : v.length > 14 ? 'text-sm' : v.length > 10 ? 'text-base' : 'text-xl')
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-1 py-2 text-base font-extrabold text-accent [&::-webkit-details-marker]:hidden">
        <svg width="9" height="11" viewBox="0 0 12 14" aria-hidden className="fill-current transition group-open:rotate-90"><path d="M1 1l10 6-10 6z" /></svg>
        More Stats
      </summary>
      <div className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-3">
        {items.map(([Icon, value, lbl, date], i) => (
          <div key={i} className="flex flex-col items-center rounded-xl bg-surface-2 p-3 text-center">
            <Icon width={22} height={22} className="text-accent" aria-hidden />
            <span className={`num mt-1 w-full truncate font-black ${size(value)}`} title={value}>{value || '-'}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-muted">{lbl}</span>
            {date && <span className="mt-0.5 text-[10px] text-faint">{/^(on|since) /.test(date) ? date : `set on ${date}`}</span>}
          </div>
        ))}
      </div>
    </details>
  )
}

export default function Stats() {
  const user = useUser()!
  const [tab, setTab] = useState<StatsTab>(() => { try { const t = localStorage.getItem('bl.statsTab'); return TABS.some(([v]) => v === t) ? (t as StatsTab) : 'lifting' } catch { return 'lifting' } })
  const pick = (t: StatsTab) => { setTab(t); try { localStorage.setItem('bl.statsTab', t) } catch { /* private mode */ } }
  return (
    <>
      <div className="mx-auto max-w-lg px-safe pt-4 sm:max-w-3xl">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {TABS.map(([t, l]) => (
            <button key={t} onClick={() => pick(t)} className={`h-9 rounded-lg text-sm font-bold ${tab === t ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
      </div>
      {tab === 'lifting' ? <StatsView user={user} />
        : <section className="mx-auto max-w-lg px-safe pt-4 sm:max-w-3xl">{tab === 'physique' ? <PhysiqueView user={user} /> : <InsightsView user={user} />}</section>}
    </>
  )
}

/** Full stats dashboard for `user` (yourself, or a friend who shares their lifts). */
export function StatsView({ user, embedded }: { user: User; embedded?: boolean }) {
  const unit = useUnit()
  const self = user.id === me()
  const rows = useStatsRows(user.id)
  // Bodyweight in the display unit: weighted pull-ups/dips count bodyweight + added weight for est. 1RM.
  const bw = toUnit(user.bodyweight_kg || 0, unit)
  const [muscle, setMuscle] = useState('All')
  const [q, setQ] = useState('')
  const [days, setDays] = useState(0)
  const [metric, setMetric] = useState<Metric>('est1rm')
  const [sort, setSort] = useState('recent')
  const [open, setOpen] = useState<string | null>(null)
  const [shared, setShared] = useState('')

  const snap = useMemo(() => {
    if (!rows) return null
    const recs: FlatSet[] = rows.map(({ set: s, ex, workoutName, durationS }) => ({
      date: new Date(s.performed_at), workoutId: s.workout, setId: s.id, durationS, workoutName,
      exercise: ex.name, muscle: ex.muscle, kind: (ex.kind === 'duration' && isCardio(ex) ? 'timed' : ex.kind) as StatKind,
      weight: toUnit(s.weight_kg, unit), reps: s.reps, distance: toDist(s.distance_km, unit), seconds: s.seconds, bw,
    }))
    return buildStats(recs)
  }, [rows, unit, bw])

  // Exercise records by name, so the ⓘ button can open the full info sheet.
  const exOf = useMemo(() => new Map((rows ?? []).map((r) => [r.ex.name, r.ex] as [string, Exercise])), [rows])
  const [info, setInfo] = useState<Exercise | null>(null)

  const muscleOf = useMemo(() => {
    const m = new Map<string, string>()
    // Lats, traps, rear delts etc. show (and filter) as Back / Shoulders here.
    snap?.records.forEach((r) => m.set(r.exercise, muscleGroup(r.muscle)))
    return m
  }, [snap])

  const dirOf = useMemo(() => {
    const m = new Map<string, Dir>()
    snap?.names.forEach((n) => m.set(n, series(snap.summaries.get(n)!, snap.kinds.get(n)!, metric, days, unit).dir))
    return m
  }, [snap, metric, days, unit])

  const list = useMemo(() => {
    if (!snap) return []
    const has = (n: string) => inRange(snap.summaries.get(n)!, days).length > 0
    const last = (n: string) => { const d = snap.summaries.get(n)!; return d[d.length - 1]?.date.getTime() ?? 0 }
    const rank = (n: string, order: Dir[]) => order.indexOf(dirOf.get(n) ?? 'neutral')
    const cmp: Record<string, (a: string, b: string) => number> = {
      recent: (a, b) => last(b) - last(a),
      trend_up: (a, b) => rank(a, ['up', 'neutral', 'down']) - rank(b, ['up', 'neutral', 'down']),
      trend_down: (a, b) => rank(a, ['down', 'neutral', 'up']) - rank(b, ['down', 'neutral', 'up']),
      alpha_asc: (a, b) => a.localeCompare(b),
      alpha_desc: (a, b) => b.localeCompare(a),
      sessions: (a, b) => snap.summaries.get(b)!.length - snap.summaries.get(a)!.length,
      muscle: (a, b) => (muscleOf.get(a) ?? '').localeCompare(muscleOf.get(b) ?? '') || a.localeCompare(b),
    }
    const names = snap.names.filter((n) => muscle === 'All' || muscleOf.get(n) === muscle)
    // While searching, best match first (alternative names, muscles and typos count); otherwise the chosen sort.
    if (q.trim()) return searchExercises(names.map((n) => ({ name: n, muscle: muscleOf.get(n), equipment: exOf.get(n)?.equipment })), q).map((h) => h.item.name)
    return names.sort((a, b) => (has(a) ? 0 : 1) - (has(b) ? 0 : 1) || cmp[sort](a, b))
  }, [snap, q, muscle, sort, days, dirOf, muscleOf, exOf])

  if (!snap) return embedded ? <Spinner /> : <Screen title="Stats"><Spinner /></Screen>
  if (!snap.records.length) return embedded ? <p className="py-6 text-center text-sm text-muted">No lifts to show yet.</p> : (
    <Screen title="Stats">
      <Empty title="No data yet" body="Log workouts or import your Liftoff history to see your lifting journey.">
        <Link to="/import" className="font-bold text-accent">Import from Liftoff</Link>
      </Empty>
    </Screen>
  )

  const daysSince = snap.firstDate ? Math.floor((Date.now() - snap.firstDate.getTime()) / 86400000) : 0
  const since = snap.firstDate?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const counts = (d: Dir) => list.filter((n) => inRange(snap.summaries.get(n)!, days).length && dirOf.get(n) === d).length
  const muscleCounts = [...new Map([...muscleOf.values()].map((m) => [m, [...muscleOf.values()].filter((x) => x === m).length])).entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const share = async () => {
    const text = `My lifting journey on Better Lift: ${snap.totalWorkouts} workouts, ${n0(snap.totalVolume)} ${unit} lifted, ${n0(snap.totalSets)} sets since ${since}. Favorite: ${snap.favorite}. Heaviest: ${n0(snap.heaviest)} ${unit} ${snap.heaviestExercise}.`
    try {
      if (navigator.share) await navigator.share({ title: 'My lifting journey', text })
      else { await navigator.clipboard.writeText(text); setShared('Copied to clipboard') ; setTimeout(() => setShared(''), 2000) }
    } catch { /* cancelled */ }
  }
  const openName = open && snap.summaries.has(open) ? open : null

  return (
    <section className={embedded ? 'space-y-3' : 'mx-auto max-w-lg space-y-3 px-safe pt-4 sm:max-w-3xl'}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className={`${embedded ? 'text-xl' : 'text-[30px]'} font-black leading-tight tracking-tight text-accent`}>{self ? 'Your' : `${user.name || user.username}'s`} Lifting Journey</h1>
          <p className="mt-1 text-[15px] text-muted">{snap.totalWorkouts} workouts tracked across {snap.names.length} exercises since {since}</p>
        </div>
        {self && <button onClick={share} aria-label="Share your stats" className={`mt-1 flex h-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink active:scale-95 ${shared ? 'px-4' : 'w-16'}`}>{shared || <ShareIcon width={22} height={22} strokeWidth={2.2} />}</button>}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([[n0(snap.totalWorkouts), 'Total Workouts'], [`${snap.names.length}`, 'Exercises'], [n0(snap.totalVolume), `Total ${unit === 'lb' ? 'Lbs' : 'Kg'} Lifted`],
          [n0(snap.totalSets), 'Total Sets'], [`${daysSince}`, 'Days Since Start']] as [string, string][]).map(([v, l], i) => (
          <div key={l} className={`rounded-2xl border border-line bg-surface px-2 py-5 text-center ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <p className={`num truncate font-black tracking-wide text-accent ${v.length > 8 ? 'text-[26px]' : 'text-[32px]'} leading-none`}>{v}</p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{l}</p>
          </div>
        ))}
      </div>

      <StrengthCard snap={snap} />
      {rows && <MusclesCard rows={rows} sex={user.sex} />}
      <MoreStats snap={snap} unit={unit} bw={user.bodyweight_kg} height={user.height_cm} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[['All', snap.names.length] as [string, number], ...muscleCounts].map(([m, c]) => (
          <button key={m} onClick={() => setMuscle(m)} className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-bold ${muscle === m ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink'}`}>
            {m === 'All' ? 'All' : label(m)} <span className={`num text-sm font-semibold ${muscle === m ? 'opacity-70' : 'text-muted'}`}>{c}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <SearchIcon width={18} height={18} className="absolute left-3 top-3.5 text-faint" />
        <Input placeholder="Search exercises..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Range</span>
        <Pills value={days} options={RANGES.map(([l, d]) => [d, l] as [number, string])} onChange={setDays} />
      </div>
      <Pills value={metric} options={METRICS} onChange={setMetric} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm font-bold">
          <span className="flex items-center gap-1"><Trend dir="up" size={10} />{counts('up')}</span>
          <span className="flex items-center gap-1"><Trend dir="down" size={10} />{counts('down')}</span>
          <span className="flex items-center gap-1"><Trend dir="neutral" size={10} />{counts('neutral')}</span>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm normal-case tracking-normal text-ink">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {list.length ? (
        <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
          {list.map((n) => (
            <ExerciseCard key={n} name={n} kind={snap.kinds.get(n)!} muscle={muscleOf.get(n) ?? ''} data={snap.summaries.get(n)!}
              globalMetric={metric} globalDays={days} unit={unit} onOpen={() => setOpen(n)} onInfo={exOf.get(n) ? () => setInfo(exOf.get(n)!) : undefined} />
          ))}
        </div>
      ) : <p className="py-8 text-center text-sm text-muted">No exercises found matching your filters.</p>}

      {!embedded && <p className="pb-6 text-center text-xs text-faint">Stats inspired by LiftoffVisualizer & LiftX by JacobG122503.</p>}
      {openName && (
        <Fullscreen name={openName} kind={snap.kinds.get(openName)!} muscle={muscleOf.get(openName) ?? ''} data={snap.summaries.get(openName)!}
          metric0={metric} days0={days} unit={unit} onClose={() => setOpen(null)} onInfo={exOf.get(openName) ? () => { setInfo(exOf.get(openName)!); setOpen(null) } : undefined} />
      )}
      {info && <ExerciseInfo ex={info} userId={user.id} ownerName={self ? undefined : user.username} initialTab="about" onClose={() => setInfo(null)} />}
    </section>
  )
}
