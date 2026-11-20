// Stats page layout modeled on LiftoffVisualizer by JacobG122503 (github.com/JacobG122503/LiftoffVisualizer), used with permission.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloseIcon, InfoIcon, SearchIcon } from '../components/icons'
import { ExerciseInfo } from '../components/ExerciseInfo'
import { searchExercises } from '../lib/search'
import { LineChart } from '../components/LineChart'
import { PhysiqueView } from './Physique'
import { InsightsView } from './Insights'
import { RadarChart } from '../components/RadarChart'
import { BodyMap } from '../components/BodyMap'
import { MAP_MUSCLES, muscleSetCounts } from '../lib/muscles'
import { Empty, Input, Screen, Spinner } from '../components/ui'
import { label } from '../lib/exercises'
import { bmi, distLabel, fmtW, toDist, toUnit } from '../lib/format'
import { me, useUnit, useUser, type Exercise, type Kind, type Unit, type User } from '../lib/pb'
import { useStatsRows, type StatRow } from '../lib/statsData'
import { buildStats, effectiveMetric, metricLabel, trendDirection, trendLine, values, type DaySummary, type FlatSet, type Metric, type Snapshot } from '../lib/stats'

const RANGES: [string, number][] = [['15D', 15], ['30D', 30], ['90D', 90], ['6M', 180], ['1Y', 365], ['All', 0]]
const METRICS: [Metric, string][] = [['bestset', 'Best Set'], ['est1rm', 'Est. 1RM'], ['weight', 'Max Weight'], ['volume', 'Volume'], ['reps', 'Total Reps']]
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
    <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]" onClick={(e) => e.stopPropagation()}>
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className={`shrink-0 rounded-lg font-bold transition ${small ? 'h-7 px-2 text-[11px]' : 'h-8 px-3 text-xs'} ${value === v ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{l}</button>
      ))}
    </div>
  )
}

/** Chart series + headline numbers for one exercise under a metric and range. */
function series(data: DaySummary[], kind: Kind, metric: Metric, days: number, unit: Unit) {
  const d = inRange(data, days)
  const m = effectiveMetric(kind, metric, d)
  const v = values(d, m)
  return {
    d, m, v,
    trend: v.length >= 2 ? trendLine(v) : undefined,
    dir: (d.length >= 2 ? trendDirection(v) : 'neutral') as Dir,
    labels: d.map((x) => x.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })),
    extras: m === 'est1rm' || m === 'bestset' ? d.map((x) => (x.bestWeight > 0 ? `${n0(x.bestWeight)} ${unit} × ${x.bestReps} reps${m === 'bestset' ? ` (est. 1RM ${n0(x.maxE1rm)})` : ''}` : '')) : undefined,
  }
}

function CardStats({ d, kind, unit }: { d: DaySummary[]; kind: Kind; unit: Unit }) {
  if (!d.length) return null
  const best = d.reduce((a, b) => (b.maxE1rm > a.maxE1rm ? b : a))
  const cells: [string, string][] = kind === 'weight' || kind === 'assisted'
    ? [[`${n0(Math.max(...d.map((x) => x.maxWeight)))} ${unit}`, 'Best Weight'], [`${n0(best.maxE1rm)} ${unit}`, 'Est. 1RM'],
      [best.bestWeight > 0 ? `${n0(best.bestWeight)} × ${best.bestReps}` : '-', 'Best Set'], [`${d.length}`, 'Sessions']]
    : kind === 'bodyweight'
      ? [[`${Math.max(...d.map((x) => x.maxReps))}`, 'Best Set (reps)'], [n0(d.reduce((t, x) => t + x.totalReps, 0)), 'Total Reps'], [`${d.length}`, 'Sessions']]
      : kind === 'duration'
        ? [[`${Math.max(...d.map((x) => x.maxSeconds))}s`, 'Best Hold'], [`${Math.round(d.reduce((t, x) => t + x.totalSeconds, 0) / 60)}m`, 'Total Time'], [`${d.length}`, 'Sessions']]
        : [[`${Math.round(d.reduce((t, x) => t + x.totalDistance, 0) * 10) / 10}`, `Total ${distLabel(unit)}`], [`${Math.round(d.reduce((t, x) => t + x.totalSeconds, 0) / 60)}m`, 'Total Time'], [`${d.length}`, 'Sessions']]
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
  name: string; kind: Kind; muscle: string; data: DaySummary[]; globalMetric: Metric; globalDays: number; unit: Unit; onOpen: () => void; onInfo?: () => void
}) {
  // Each card can override range/metric; changing the global controls resets every card to match.
  const [metric, setMetric] = useState(globalMetric)
  const [days, setDays] = useState(globalDays)
  useEffect(() => setMetric(globalMetric), [globalMetric])
  useEffect(() => setDays(globalDays), [globalDays])
  const s = useMemo(() => series(data, kind, metric, days, unit), [data, kind, metric, days, unit])
  const empty = !s.d.length
  return (
    <div onClick={onOpen} className={`cursor-pointer space-y-2 rounded-2xl border border-line bg-surface p-3 transition active:scale-[0.99] ${empty ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-extrabold" title={name}><span className="truncate">{name}</span><InfoButton name={name} onInfo={onInfo} /></p>
          <span className="mt-0.5 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label(muscle)}</span>
        </div>
        <div className="pt-1.5"><Trend dir={s.dir} /></div>
      </div>
      <Pills small value={days} options={RANGES.map(([l, d]) => [d, l] as [number, string])} onChange={setDays} />
      <Pills small value={metric} options={METRICS} onChange={setMetric} />
      <div className="relative">
        {empty
          ? <div className="grid h-40 place-items-center text-sm text-muted">No sessions in this period</div>
          : <LazyChart className="h-40" labels={s.labels} values={s.v} trend={s.trend} extras={s.extras} />}
      </div>
      <CardStats d={s.d} kind={kind} unit={unit} />
    </div>
  )
}

function Fullscreen({ name, kind, muscle, data, metric0, days0, unit, onClose, onInfo }: {
  name: string; kind: Kind; muscle: string; data: DaySummary[]; metric0: Metric; days0: number; unit: Unit; onClose: () => void; onInfo?: () => void
}) {
  const [metric, setMetric] = useState(metric0)
  const [days, setDays] = useState(days0)
  const s = useMemo(() => series(data, kind, metric, days, unit), [data, kind, metric, days, unit])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl space-y-3 rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xl font-extrabold"><span className="min-w-0">{name}</span><InfoButton name={name} onInfo={onInfo} /></p>
            <span className="inline-block rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label(muscle)}</span>
          </div>
          <div className="pt-2"><Trend dir={s.dir} size={14} /></div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2"><CloseIcon width={18} height={18} /></button>
        </div>
        <Pills value={days} options={RANGES.map(([l, d]) => [d, l] as [number, string])} onChange={setDays} />
        <Pills value={metric} options={METRICS} onChange={setMetric} />
        <p className="text-xs font-bold text-muted">{metricLabel(s.m, unit, distLabel(unit))}</p>
        {s.d.length
          ? <LineChart className="h-[50vh] max-h-96" labels={s.labels} values={s.v} trend={s.trend} extras={s.extras} />
          : <div className="grid h-60 place-items-center text-sm text-muted">No sessions in this period</div>}
        <CardStats d={s.d} kind={kind} unit={unit} />
      </div>
    </div>
  )
}

type MuscleRange = '7d' | 'lastweek' | 'all'

/** Which muscles you trained in a period: body graph + radar "skills" chart of weighted sets per muscle group. */
function MusclesCard({ rows, sex }: { rows: StatRow[]; sex?: string }) {
  const [range, setRange] = useState<MuscleRange>('7d')
  const { counts, sets, label: rangeLabel } = useMemo(() => {
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
    return { counts: muscleSetCounts(inRangeRows), sets: inRangeRows.length, label: lbl }
  }, [rows, range])
  const max = Math.max(0, ...Object.values(counts))
  const intensity = Object.fromEntries(MAP_MUSCLES.map((m) => [m, max ? counts[m] / max : 0]))
  const ranked = MAP_MUSCLES.filter((m) => counts[m] > 0).sort((a, b) => counts[b] - counts[a])
  const untrained = MAP_MUSCLES.filter((m) => !counts[m])
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-extrabold">Muscles trained</h2>
        <span className="text-xs text-muted">{rangeLabel} · {sets} sets</span>
      </div>
      <div className="flex rounded-xl bg-surface-2 p-1">
        {([['7d', 'Last 7 days'], ['lastweek', 'Last week'], ['all', 'All time']] as [MuscleRange, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} className={`h-8 flex-1 rounded-lg text-xs font-bold transition ${range === v ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      {!sets ? <p className="py-8 text-center text-sm text-muted">No sets logged in this period.</p> : (
        <>
          <div className="grid items-center gap-2 sm:grid-cols-2">
            <div className="flex justify-center"><BodyMap sex={sex} intensity={intensity} className="h-52" labels /></div>
            <RadarChart className="h-64" labels={MAP_MUSCLES.map((m) => label(m))} values={MAP_MUSCLES.map((m) => Math.round(counts[m] * 10) / 10)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ranked.slice(0, 4).map((m, i) => (
              <span key={m} className={`rounded-full px-2.5 py-1 text-xs font-bold ${i === 0 ? 'bg-accent text-accent-ink' : 'bg-accent/15 text-accent'}`}>{label(m)} · {Math.round(counts[m] * 10) / 10}</span>
            ))}
          </div>
          {untrained.length > 0 && untrained.length < MAP_MUSCLES.length && (
            <p className="text-xs text-muted">Not trained: {untrained.map((m) => label(m)).join(', ')}</p>
          )}
          <p className="text-[11px] text-faint">Sets per muscle group — secondary muscles count as half a set.</p>
        </>
      )}
    </div>
  )
}

function MoreStats({ snap, unit, bw, height }: { snap: Snapshot; unit: Unit; bw: number; height: number }) {
  const b = bmi(bw, height)
  const items: [string, string, string, string?][] = [
    ['🔥', `${snap.longestStreak}`, 'Longest Streak (days)'],
    ['😴', `${snap.longestBreak}`, 'Longest Break (days)'],
    ['⭐', snap.favorite, 'Favorite Exercise'],
    ['📈', snap.mostImproved, `Most Improved (+${n0(snap.mostImprovedGain)} ${unit})`],
    ['📅', snap.activeWeekday, 'Day you train most often'],
    ['🗓️', snap.peakMonth, 'Your most active month'],
    ['📊', `${snap.perWeek}`, 'Avg Workouts / Week'],
    ['💪', n0(snap.totalReps), 'Total Reps All Time'],
    ['🏋️', snap.heaviest ? `${n0(snap.heaviest)} ${unit}` : '-', `Heaviest Lift${snap.heaviestExercise !== '-' ? ` (${snap.heaviestExercise})` : ''}`],
    ['⚡', `${snap.maxSetsInSession}`, 'Most Sets in One Day', day(snap.maxSetsDate)],
    ['🔄', `${snap.maxRepsInSession}`, `Most Reps — ${snap.maxRepsExercise}`, day(snap.maxRepsDate)],
    ['💥', `${n0(snap.maxVolumeInSession)} ${unit}`, 'Best Volume in One Day', day(snap.maxVolumeDate)],
    ['🧩', `${snap.maxExercisesInSession}`, 'Most Exercises in One Day', day(snap.maxExercisesDate)],
    ['🌱', snap.firstExercise, 'First Exercise Ever Logged'],
    ['📅', snap.consistentMonth, 'Most Consistent Month'],
    ['⏱️', snap.avgDurationMin ? `${snap.avgDurationMin.toFixed(1)} min` : '-', 'Avg Workout Duration'],
    ['🌅', clock(snap.earliest), 'Earliest Workout Time', snap.earliest ? `on ${day(snap.earliest)}` : ''],
    ['🌙', clock(snap.latest), 'Latest Workout Time', snap.latest ? `on ${day(snap.latest)}` : ''],
    ['🏷️', snap.favoriteWorkoutName, 'Most Frequent Workout Name'],
    ['🏋️‍♂️', snap.mostUsedWeight ? `${n0(snap.mostUsedWeight)} ${unit}` : '-', 'Most Used Weight'],
    ['🚴', snap.totalDistance ? `${snap.totalDistance.toFixed(1)} ${distLabel(unit)}` : '-', 'Total Distance'],
    ['⚖️', bw ? `${fmtW(bw, unit)} ${unit}` : '-', 'Current Bodyweight'],
    ['📏', b ? b.toFixed(1) : '-', 'BMI'],
  ]
  const size = (v: string) => (v.length > 20 ? 'text-xs' : v.length > 14 ? 'text-sm' : v.length > 10 ? 'text-base' : 'text-xl')
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-extrabold">
        More Stats <span className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
        {items.map(([icon, value, lbl, date], i) => (
          <div key={i} className="flex flex-col items-center rounded-xl bg-surface-2 p-3 text-center">
            <span className="text-xl">{icon}</span>
            <span className={`num mt-1 w-full truncate font-black ${size(value)}`} title={value}>{value || '-'}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-muted">{lbl}</span>
            {date && <span className="mt-0.5 text-[10px] text-faint">{date.startsWith('on ') ? date : `set on ${date}`}</span>}
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
  const [muscle, setMuscle] = useState('All')
  const [q, setQ] = useState('')
  const [days, setDays] = useState(0)
  const [metric, setMetric] = useState<Metric>('bestset')
  const [sort, setSort] = useState('recent')
  const [open, setOpen] = useState<string | null>(null)
  const [shared, setShared] = useState('')

  const snap = useMemo(() => {
    if (!rows) return null
    const recs: FlatSet[] = rows.map(({ set: s, ex, workoutName, durationS }) => ({
      date: new Date(s.performed_at), workoutId: s.workout, durationS, workoutName,
      exercise: ex.name, muscle: ex.muscle, kind: ex.kind,
      weight: toUnit(s.weight_kg, unit), reps: s.reps, distance: toDist(s.distance_km, unit), seconds: s.seconds,
    }))
    return buildStats(recs)
  }, [rows, unit])

  // Exercise records by name, so the ⓘ button can open the full info sheet.
  const exOf = useMemo(() => new Map((rows ?? []).map((r) => [r.ex.name, r.ex] as [string, Exercise])), [rows])
  const [info, setInfo] = useState<Exercise | null>(null)

  const muscleOf = useMemo(() => {
    const m = new Map<string, string>()
    snap?.records.forEach((r) => m.set(r.exercise, r.muscle))
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
          <h1 className={`${embedded ? 'text-xl' : 'text-[28px]'} font-extrabold leading-tight tracking-tight`}>{self ? 'Your' : `${user.name || user.username}'s`} Lifting Journey</h1>
          <p className="text-sm text-muted">{snap.totalWorkouts} workouts tracked across {snap.names.length} exercises since {since}</p>
        </div>
        {self && <button onClick={share} className="mt-1 shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink">{shared || 'Share'}</button>}
      </header>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {([[n0(snap.totalWorkouts), 'Total Workouts'], [`${snap.names.length}`, 'Exercises'], [n0(snap.totalVolume), `Total ${unit === 'lb' ? 'Lbs' : 'Kg'} Lifted`],
          [n0(snap.totalSets), 'Total Sets'], [`${daysSince}`, 'Days Since Start']] as [string, string][]).map(([v, l]) => (
          <div key={l} className="rounded-2xl border border-line bg-surface p-3 text-center">
            <p className="num truncate text-xl font-black">{v}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
          </div>
        ))}
      </div>

      {rows && <MusclesCard rows={rows} sex={user.sex} />}
      <MoreStats snap={snap} unit={unit} bw={user.bodyweight_kg} height={user.height_cm} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[['All', snap.names.length] as [string, number], ...muscleCounts].map(([m, c]) => (
          <button key={m} onClick={() => setMuscle(m)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${muscle === m ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>
            {m === 'All' ? 'All' : label(m)} <span className={`rounded-full px-1.5 text-[11px] ${muscle === m ? 'bg-black/15' : 'bg-canvas/60'}`}>{c}</span>
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
        <div className="grid gap-3 pb-4 sm:grid-cols-2">
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
