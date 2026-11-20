// Stats engine. Ported from LiftX StatsEngine (github.com/JacobG122503/LiftX), used with permission.
// All weights here are already in the viewer's display unit.
import { epley } from './format'
import type { Kind } from './pb'

/**
 * How the Stats page treats an exercise. Same as Kind, except timed cardio (basketball, jump rope: a 'duration'
 * exercise with muscle 'cardio', entered in minutes) is split from holds like planks (also 'duration', in seconds).
 */
export type StatKind = Kind | 'timed'

export interface FlatSet { date: Date; workoutId: string; durationS: number; workoutName: string; exercise: string; muscle: string; weight: number; reps: number; distance: number; seconds: number; kind: StatKind
  /** Viewer's bodyweight (display unit), so weighted pull-ups/dips can count bodyweight + added weight. */
  bw?: number }

export interface DaySummary {
  date: Date; maxWeight: number; minWeight: number; totalVolume: number; totalReps: number; maxReps: number; totalSets: number
  maxE1rm: number; bestWeight: number; bestReps: number; totalSeconds: number; maxSeconds: number; totalDistance: number
  maxDistance: number
}

export interface Snapshot {
  records: FlatSet[]; names: string[]; summaries: Map<string, DaySummary[]>; kinds: Map<string, StatKind>; muscles: Map<string, number>
  totalWorkouts: number; totalVolume: number; totalSets: number; firstDate: Date | null
  longestStreak: number; longestBreak: number; favorite: string; mostImproved: string; mostImprovedGain: number
  activeWeekday: string; peakMonth: string; perWeek: number; maxSetsInSession: number; maxSetsDate: Date | null
  maxRepsInSession: number; maxRepsExercise: string; maxRepsDate: Date | null; maxExercisesDate: Date | null; heaviest: number; heaviestExercise: string
  maxVolumeInSession: number; maxVolumeDate: Date | null; maxExercisesInSession: number; firstExercise: string
  totalReps: number; consistentMonth: string; avgDurationMin: number; earliest: Date | null; latest: Date | null
  favoriteWorkoutName: string; mostUsedWeight: number; totalDistance: number
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const monthName = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

function group<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>()
  for (const x of xs) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]) }
  return m
}
const maxBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce<T | undefined>((b, x) => (b === undefined || f(x) > f(b) ? x : b), undefined)
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0)

/** Load used for est. 1RM: the bar for lifts; bodyweight + added weight for weighted pull-ups, dips, etc. */
const load = (r: FlatSet) => (r.kind === 'bodyweight' ? (r.bw || 0) + r.weight : r.weight)

function summarize(sets: FlatSet[]): DaySummary[] {
  return [...group(sets, (r) => dayKey(r.date)).values()].map((g) => {
    // Bodyweight: best set = most reps, ties go to the heavier one. Lifts: highest est. 1RM.
    const best = g[0].kind === 'bodyweight' ? maxBy(g, (r) => r.reps * 1000 + r.weight)! : maxBy(g, (r) => epley(load(r), r.reps))!
    const weighted = g.filter((r) => r.weight > 0)
    return {
      date: startOfDay(g[0].date),
      maxWeight: Math.max(...g.map((r) => r.weight)),
      minWeight: weighted.length ? Math.min(...weighted.map((r) => r.weight)) : 0,
      totalVolume: sum(g, (r) => r.weight * r.reps),
      totalReps: sum(g, (r) => r.reps),
      maxReps: Math.max(...g.map((r) => r.reps)),
      totalSets: g.length,
      // Bodyweight exercises need the lifter's bodyweight for a real 1RM; without it (hidden), leave it out.
      maxE1rm: g[0].kind === 'bodyweight' && !g[0].bw ? 0 : Math.max(...g.map((r) => epley(load(r), r.reps))),
      bestWeight: best.weight, bestReps: best.reps,
      totalSeconds: sum(g, (r) => r.seconds), maxSeconds: Math.max(...g.map((r) => r.seconds)),
      totalDistance: sum(g, (r) => r.distance), maxDistance: Math.max(...g.map((r) => r.distance)),
    }
  }).sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function buildStats(records: FlatSet[]): Snapshot {
  const names = [...new Set(records.map((r) => r.exercise))].sort()
  const byEx = group(records, (r) => r.exercise)
  const summaries = new Map(names.map((n) => [n, summarize(byEx.get(n)!)]))
  const kinds = new Map(names.map((n) => [n, byEx.get(n)![0].kind]))
  const muscles = new Map<string, number>()
  names.forEach((n) => { const m = byEx.get(n)![0].muscle; muscles.set(m, (muscles.get(m) ?? 0) + 1) })

  const snap: Snapshot = {
    records, names, summaries, kinds, muscles, totalWorkouts: 0, totalVolume: 0, totalSets: 0, firstDate: null,
    longestStreak: 0, longestBreak: 0, favorite: '-', mostImproved: '-', mostImprovedGain: 0, activeWeekday: '-', peakMonth: '-',
    perWeek: 0, maxSetsInSession: 0, maxSetsDate: null, maxRepsInSession: 0, maxRepsExercise: '-', maxRepsDate: null, maxExercisesDate: null, heaviest: 0, heaviestExercise: '-',
    maxVolumeInSession: 0, maxVolumeDate: null, maxExercisesInSession: 0, firstExercise: '-', totalReps: 0, consistentMonth: '-',
    avgDurationMin: 0, earliest: null, latest: null, favoriteWorkoutName: '-', mostUsedWeight: 0, totalDistance: 0,
  }
  if (!records.length) return snap

  const lifts = records.filter((r) => r.kind === 'weight')
  const days = [...new Map(records.map((r) => [dayKey(r.date), startOfDay(r.date)])).values()].sort((a, b) => a.getTime() - b.getTime())
  snap.totalWorkouts = new Set(records.map((r) => r.workoutId)).size
  snap.totalVolume = sum(lifts, (r) => r.weight * r.reps)
  snap.totalSets = records.length
  snap.firstDate = new Date(Math.min(...records.map((r) => r.date.getTime())))

  // Streak allows up to 2 rest days between lifts.
  let streak = 1, maxStreak = 1, maxBreak = 0
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((days[i].getTime() - days[i - 1].getTime()) / 86400000)
    if (gap <= 3) maxStreak = Math.max(maxStreak, ++streak); else streak = 1
    if (gap > 1) maxBreak = Math.max(maxBreak, gap - 1)
  }
  snap.longestStreak = maxStreak
  snap.longestBreak = maxBreak

  snap.favorite = maxBy(names, (n) => summaries.get(n)!.length) ?? '-'
  const improved = maxBy(
    names.filter((n) => kinds.get(n) === 'weight' && summaries.get(n)!.some((s) => s.maxWeight > 0))
      .map((n) => { const s = summaries.get(n)!; return { n, gain: Math.max(...s.map((x) => x.maxWeight)) - s.find((x) => x.maxWeight > 0)!.maxWeight } }),
    (x) => x.gain)
  snap.mostImproved = improved?.n ?? '-'
  snap.mostImprovedGain = improved?.gain ?? 0

  const wd = group(days, (d) => `${d.getDay()}`)
  snap.activeWeekday = WEEKDAYS[+(maxBy([...wd.keys()], (k) => wd.get(k)!.length) ?? 0)]
  const months = group(days, (d) => `${d.getFullYear()}-${d.getMonth()}`)
  const peak = maxBy([...months.keys()], (k) => months.get(k)!.length)!
  snap.peakMonth = monthName(+peak.split('-')[0], +peak.split('-')[1])
  const consistent = maxBy([...months.keys()], (k) => { const [y, m] = k.split('-').map(Number); return months.get(k)!.length / new Date(y, m + 1, 0).getDate() })!
  snap.consistentMonth = monthName(+consistent.split('-')[0], +consistent.split('-')[1])

  const weeks = Math.max(1, (Date.now() - snap.firstDate.getTime()) / (7 * 86400000))
  snap.perWeek = Math.round((snap.totalWorkouts / weeks) * 10) / 10

  const byWorkout = [...group(records, (r) => r.workoutId).values()]
  const maxSets = maxBy(byWorkout, (g) => g.length)!
  snap.maxSetsInSession = maxSets.length
  snap.maxSetsDate = maxSets[0].date
  const repsGroups = [...group(records, (r) => `${r.workoutId}|${r.exercise}`).values()]
  const maxReps = maxBy(repsGroups, (g) => sum(g, (r) => r.reps))!
  snap.maxRepsInSession = sum(maxReps, (r) => r.reps)
  snap.maxRepsExercise = maxReps[0].exercise
  snap.maxRepsDate = maxReps[0].date
  const heaviest = maxBy(lifts.filter((r) => r.weight > 0), (r) => r.weight)
  snap.heaviest = heaviest?.weight ?? 0
  snap.heaviestExercise = heaviest?.exercise ?? '-'
  const vol = (g: FlatSet[]) => sum(g.filter((r) => r.kind === 'weight'), (r) => r.weight * r.reps)
  const maxVol = maxBy(byWorkout, vol)!
  snap.maxVolumeInSession = vol(maxVol)
  snap.maxVolumeDate = maxVol[0].date
  const maxEx = maxBy(byWorkout, (g) => new Set(g.map((r) => r.exercise)).size)!
  snap.maxExercisesInSession = new Set(maxEx.map((r) => r.exercise)).size
  snap.maxExercisesDate = maxEx[0].date
  snap.firstExercise = records.reduce((a, b) => (b.date < a.date ? b : a)).exercise
  snap.totalReps = sum(records, (r) => r.reps)

  const durs = byWorkout.map((g) => g[0].durationS).filter((d) => d > 0)
  snap.avgDurationMin = durs.length ? sum(durs, (d) => d) / durs.length / 60 : 0
  const tod = (d: Date) => d.getHours() * 60 + d.getMinutes()
  snap.earliest = records.reduce((a, b) => (tod(b.date) < tod(a.date) ? b : a)).date
  snap.latest = records.reduce((a, b) => (tod(b.date) > tod(a.date) ? b : a)).date

  const wnames = group(byWorkout.map((g) => g[0].workoutName).filter(Boolean), (n) => n)
  snap.favoriteWorkoutName = maxBy([...wnames.keys()], (k) => wnames.get(k)!.length) ?? '-'
  const wts = group(lifts.filter((r) => r.weight > 0), (r) => `${Math.round(r.weight * 10) / 10}`)
  snap.mostUsedWeight = +(maxBy([...wts.keys()], (k) => wts.get(k)!.length) ?? 0)
  snap.totalDistance = sum(records.filter((r) => r.kind === 'cardio'), (r) => r.distance)
  return snap
}

// ---- Chart metrics ----
export type Metric = 'bestset' | 'est1rm' | 'weight' | 'volume' | 'reps' | 'maxreps' | 'added' | 'assist' | 'time' | 'maxtime' | 'longest' | 'distance' | 'pace'

/** Whether any session of a bodyweight exercise had added weight (weighted pull-ups, dips...). */
export const isWeighted = (data: DaySummary[]) => data.some((d) => d.maxWeight > 0)

/** The chart choices that make sense for each kind of exercise, in pill order. */
export function metricOptions(kind: StatKind, data: DaySummary[]): [Metric, string][] {
  switch (kind) {
    case 'weight': return [['bestset', 'Best Set'], ['est1rm', 'Est. 1RM'], ['weight', 'Max Weight'], ['volume', 'Volume'], ['reps', 'Total Reps']]
    case 'bodyweight': return isWeighted(data)
      ? [['maxreps', 'Best Set'], ['added', 'Added Weight'], ...(data.some((d) => d.maxE1rm > 0) ? [['est1rm', 'Est. 1RM'] as [Metric, string]] : []), ['reps', 'Total Reps']]
      : [['maxreps', 'Best Set'], ['reps', 'Total Reps']]
    case 'assisted': return [['assist', 'Assistance'], ['maxreps', 'Best Set'], ['reps', 'Total Reps']]
    case 'duration': return [['maxtime', 'Best Hold'], ['time', 'Total Time']]
    case 'timed': return [['time', 'Time'], ['longest', 'Longest']]
    case 'cardio': return data.some((d) => d.totalDistance > 0)
      ? [['distance', 'Distance'], ['time', 'Time'], ['pace', 'Pace'], ['longest', 'Longest']]
      : [['time', 'Time'], ['longest', 'Longest']]
  }
}

/** The metric a card shows: the chosen one if it fits this exercise, else the closest equivalent. */
export function effectiveMetric(kind: StatKind, metric: Metric, data: DaySummary[]): Metric {
  const options = metricOptions(kind, data).map(([m]) => m)
  if (options.includes(metric)) return metric
  const totals = metric === 'volume' || metric === 'reps' || metric === 'time'
  switch (kind) {
    case 'weight': return 'bestset'
    case 'bodyweight': return totals ? 'reps' : metric === 'weight' && options.includes('added') ? 'added' : 'maxreps'
    case 'assisted': return totals ? 'reps' : 'assist'
    case 'duration': return totals ? 'time' : 'maxtime'
    case 'timed': return 'time'
    case 'cardio': return totals ? 'time' : options[0]
  }
}

/** Pace in minutes per distance unit (0 when there's no distance). */
export const paceOf = (d: DaySummary) => (d.totalDistance > 0 ? d.totalSeconds / 60 / d.totalDistance : 0)

/** Sessions a metric can be charted for (pace needs a distance). */
export const chartable = (data: DaySummary[], m: Metric) => (m === 'pace' ? data.filter((d) => d.totalDistance > 0 && d.totalSeconds > 0) : data)

export function values(data: DaySummary[], m: Metric): number[] {
  const r1 = (n: number) => Math.round(n * 10) / 10
  const f: Record<Metric, (d: DaySummary) => number> = {
    bestset: (d) => r1(d.bestWeight),
    volume: (d) => Math.round(d.totalVolume), reps: (d) => d.totalReps, maxreps: (d) => d.maxReps, est1rm: (d) => r1(d.maxE1rm),
    added: (d) => r1(d.maxWeight),
    assist: (d) => -d.minWeight, time: (d) => r1(d.totalSeconds / 60), maxtime: (d) => d.maxSeconds, longest: (d) => r1(d.maxSeconds / 60),
    distance: (d) => Math.round(d.totalDistance * 100) / 100, weight: (d) => d.maxWeight, pace: (d) => Math.round(paceOf(d) * 100) / 100,
  }
  return chartable(data, m).map(f[m])
}

/** Metrics where a smaller number is the better result (the trend arrow flips). */
export const lowerIsBetter = (m: Metric) => m === 'pace'

export function metricLabel(m: Metric, unit: string, dist: string) {
  return { bestset: `Best set weight (${unit})`, volume: `Total volume (${unit})`, reps: 'Total reps', maxreps: 'Best set (reps)', est1rm: `Est. 1RM (${unit})`,
    added: `Added weight (+${unit})`, assist: `Assistance (−${unit}, higher = less help)`, time: 'Time (min)', maxtime: 'Best hold (sec)',
    longest: 'Longest session (min)', distance: `Distance (${dist})`, pace: `Pace (min / ${dist}, lower = faster)`,
    weight: `Max weight (${unit})` }[m]
}

/** "8:32" for 8.53 minutes. */
export function fmtPace(min: number) {
  if (!min || !isFinite(min)) return '-'
  const total = Math.round(min * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** "45m", "1h 05m". */
export function fmtMinutes(min: number) {
  const m = Math.round(min)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export function trendLine(v: number[]): number[] {
  const n = v.length
  let sx = 0, sy = 0, sxy = 0, sx2 = 0
  v.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sx2 += i * i })
  const den = n * sx2 - sx * sx
  if (!den) return v.map(() => Math.round((sy / Math.max(1, n)) * 10) / 10)
  const slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n
  return v.map((_, i) => Math.round((icpt + slope * i) * 10) / 10)
}

export function trendDirection(v: number[]): 'up' | 'down' | 'neutral' {
  if (v.length < 2) return 'neutral'
  const t = trendLine(v)
  const avg = Math.abs(sum(v, (x) => x) / v.length)
  if (!avg) return 'neutral'
  const rel = (t[t.length - 1] - t[0]) / avg
  return rel > 0.01 ? 'up' : rel < -0.01 ? 'down' : 'neutral'
}
