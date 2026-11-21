// Insights engine: PR predictions, improvement timeline, body ↔ strength correlation and comparisons to typical lifters.
// All weights returned are in the viewer's display unit unless a name ends in Kg.
import type { BodyMetric } from './body'
import { epley, fromUnit, toUnit } from './format'
import { MAP_MUSCLES, muscleGroup, muscleSetCounts, type MapMuscle } from './muscles'
import type { Lift, Unit } from './pb'
import type { StatRow } from './statsData'

export const DAY = 86400000
const startOfDay = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
const r1 = (n: number) => Math.round(n * 10) / 10

export type Pt = { t: number; v: number }

/** Daily best estimated 1RM for one weighted exercise. */
export interface LiftSeries { name: string; muscle: string; lift: Lift | ''; pts: Pt[]; best: number; bestAt: number; lastAt: number }

export function liftSeries(rows: StatRow[], unit: Unit): LiftSeries[] {
  const by = new Map<string, { muscle: string; lift: Lift | ''; days: Map<number, number> }>()
  for (const { set: s, ex } of rows) {
    // Epley gets unreliable past ~12 reps, so very high-rep sets don't drive strength estimates.
    if (ex.kind !== 'weight' || s.weight_kg <= 0 || s.reps <= 0 || s.reps > 12) continue
    const e = epley(toUnit(s.weight_kg, unit), s.reps)
    const t = startOfDay(new Date(s.performed_at).getTime())
    let g = by.get(ex.name)
    if (!g) by.set(ex.name, (g = { muscle: ex.muscle, lift: ex.main_lift || '', days: new Map() }))
    if (e > (g.days.get(t) ?? 0)) g.days.set(t, e)
  }
  return [...by.entries()].map(([name, g]) => {
    const pts = [...g.days.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t)
    const top = pts.reduce((a, b) => (b.v > a.v ? b : a))
    return { name, muscle: g.muscle, lift: g.lift, pts, best: top.v, bestAt: top.t, lastAt: pts[pts.length - 1].t }
  })
}

// ---------- Predictions ----------

export interface Fit { slope: number; icpt: number; r2: number; n: number; from: number }
/** Least squares of value vs. days (x measured from `from`). */
export function fit(pts: Pt[]): Fit | null {
  const n = pts.length
  if (n < 2) return null
  const from = pts[0].t
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
  for (const p of pts) { const x = (p.t - from) / DAY; sx += x; sy += p.v; sxy += x * p.v; sx2 += x * x; sy2 += p.v * p.v }
  const den = n * sx2 - sx * sx
  if (!den) return null
  const slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n
  const ssTot = sy2 - (sy * sy) / n
  const ssRes = pts.reduce((t, p) => t + (p.v - (icpt + slope * (p.t - from) / DAY)) ** 2, 0)
  return { slope, icpt, r2: ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0, n, from }
}
export const fitAt = (f: Fit, t: number) => f.icpt + f.slope * (t - f.from) / DAY

const MAX_ETA_DAYS = 730
/** When the trend line reaches `target`: a timestamp, 'now' if it already has, or null if never / over two years out. */
export function etaFor(f: Fit | null, target: number, now = Date.now()): number | 'now' | null {
  if (!f || f.slope <= 0) return null
  const t = f.from + ((target - f.icpt) / f.slope) * DAY
  if (t <= now) return 'now'
  return t - now > MAX_ETA_DAYS * DAY ? null : t
}

const PLATES: Record<Unit, number[]> = {
  lb: [95, 135, 185, 225, 275, 315, 365, 405, 455, 495, 545, 585, 635, 675, 725, 765, 815],
  kg: [40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340],
}
export const prStep = (u: Unit) => (u === 'lb' ? 5 : 2.5)
export const nextMilestone = (best: number, u: Unit) => PLATES[u].find((p) => p > best + 0.01) ?? Math.ceil((best + 1) / 50) * 50

export type Status = 'progressing' | 'stalled' | 'declining'
export interface Prediction {
  s: LiftSeries; fit: Fit; perMonth: number; perMonthPct: number; status: Status; confidence: 'high' | 'medium' | 'low'
  nextPr: number; nextPrEta: number | 'now' | null; milestone: number; milestoneEta: number | 'now' | null; weeksSincePr: number
}

/**
 * Trend fit for one lift. `from` = start of the chosen period (fit on sessions since then);
 * 0 = automatic (last 4 months, widened to a year if sparse). Only lifts trained in the last 2 months.
 */
export function predict(s: LiftSeries, unit: Unit, from = 0, now = Date.now()): Prediction | null {
  if (now - s.lastAt > 60 * DAY) return null
  let win = s.pts.filter((p) => p.t >= (from || now - 120 * DAY))
  if (!from && win.length < 4) win = s.pts.filter((p) => p.t >= now - 365 * DAY)
  if (win.length < 4) return null
  const f = fit(win)
  if (!f) return null
  const perMonth = f.slope * 30
  const perMonthPct = s.best ? (perMonth / s.best) * 100 : 0
  const status: Status = perMonthPct > 0.5 ? 'progressing' : perMonthPct < -0.5 ? 'declining' : 'stalled'
  const confidence = f.r2 >= 0.5 && f.n >= 8 ? 'high' : f.r2 >= 0.25 && f.n >= 5 ? 'medium' : 'low'
  const step = prStep(unit)
  const nextPr = Math.ceil((s.best + step / 2) / step) * step
  const milestone = nextMilestone(s.best, unit)
  return {
    s, fit: f, perMonth, perMonthPct, status, confidence,
    nextPr, nextPrEta: etaFor(f, nextPr, now), milestone, milestoneEta: etaFor(f, milestone, now),
    weeksSincePr: Math.floor((now - s.bestAt) / (7 * DAY)),
  }
}

// ---------- Improvement timeline ----------

/** gainPct = average % est. 1RM gained from PRs per lift trained that month. */
export interface Month { key: string; t: number; label: string; prs: number; gainPct: number; names: Set<string>; trained: Set<string> }
export interface Improvement {
  months: Month[]; bestMonth: Month | null; bestStretch: { from: Month; to: Month; gainPct: number } | null
  earlyPace: number | null; recentPace: number | null; recent: { name: string; pct: number; from: number; to: number }[]
  byMuscle: { muscle: string; gainPct: number }[]; stalled: { name: string; weeks: number }[]
}

const monthKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}` }
const emptyMonth = (k: string, t: number): Month => ({ key: k, t, label: '', prs: 0, gainPct: 0, names: new Set(), trained: new Set() })

/** PRs are judged against all earlier history, but only months / gains inside the period (`from`, 0 = all time) are reported. */
export function improvement(series: LiftSeries[], from = 0, now = Date.now()): Improvement {
  const months = new Map<string, Month>()
  const muscle = new Map<string, { gain: number; lifts: number }>()
  let first = Infinity
  for (const s of series) {
    let best = 0, total = 0
    for (const p of s.pts) {
      first = Math.min(first, p.t)
      const k = monthKey(p.t)
      let m = months.get(k)
      if (!m) { const d = new Date(p.t); months.set(k, (m = emptyMonth(k, new Date(d.getFullYear(), d.getMonth(), 1).getTime()))) }
      m.trained.add(s.name)
      // First session sets the baseline; later beats of the running best are PRs. Each capped at 20% so a brand-new lift's ramp-up doesn't swamp everything.
      if (best > 0 && p.v > best * 1.001) {
        const g = Math.min(20, ((p.v - best) / best) * 100)
        m.prs++; m.gainPct += g; m.names.add(s.name)
        if (p.t >= from) total += g
      }
      best = Math.max(best, p.v)
    }
    const g = muscleGroup(s.muscle) // "back" / "shoulders" as a whole, not each part
    const mu = muscle.get(g) ?? { gain: 0, lifts: 0 }
    if (s.pts.length >= 3) muscle.set(g, { gain: mu.gain + total, lifts: mu.lifts + 1 })
  }
  // Every month from the first session to now, including empty ones.
  const list: Month[] = []
  if (first < Infinity) {
    const d = new Date(first), end = new Date(now)
    for (let y = d.getFullYear(), m = d.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); m === 11 ? (y++, m = 0) : m++) {
      const k = `${y}-${m}`
      const t = new Date(y, m, 1).getTime()
      const row = months.get(k) ?? emptyMonth(k, t)
      row.label = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      row.gainPct = row.trained.size ? r1(row.gainPct / row.trained.size) : 0
      if (t + 31 * DAY > from) list.push(row)
    }
  }
  const bestMonth = list.reduce<Month | null>((a, b) => (b.gainPct > (a?.gainPct ?? 0) ? b : a), null)
  let bestStretch: Improvement['bestStretch'] = null
  for (let i = 0; i + 2 < list.length; i++) {
    const g = list[i].gainPct + list[i + 1].gainPct + list[i + 2].gainPct
    if (g > (bestStretch?.gainPct ?? 0)) bestStretch = { from: list[i], to: list[i + 2], gainPct: r1(g) }
  }
  const avg = (ms: Month[]) => (ms.length ? r1(ms.reduce((t, m) => t + m.gainPct, 0) / ms.length) : null)
  // Compare beginner pace (first 6 months) with the current pace (last 3 full months) once there is enough history.
  const full = list.slice(0, -1)
  const earlyPace = !from && full.length >= 9 ? avg(full.slice(0, 6)) : null
  const recentPace = !from && full.length >= 9 ? avg(full.slice(-3)) : null

  // Best inside the period vs. best before it (all time: first session vs. best ever).
  const recent = series.flatMap((s) => {
    if (!from) return s.pts.length >= 3 ? [{ name: s.name, pct: r1(((s.best - s.pts[0].v) / s.pts[0].v) * 100), from: s.pts[0].v, to: s.best }] : []
    const before = s.pts.filter((p) => p.t < from), after = s.pts.filter((p) => p.t >= from)
    if (!before.length || after.length < 2) return []
    const a = Math.max(...before.map((p) => p.v)), b = Math.max(...after.map((p) => p.v))
    return [{ name: s.name, pct: r1(((b - a) / a) * 100), from: a, to: b }]
  }).sort((a, b) => b.pct - a.pct)

  const stalled = series
    .filter((s) => now - s.lastAt < 21 * DAY && s.pts.filter((p) => p.t > s.bestAt).length >= 3 && now - s.bestAt > 8 * 7 * DAY)
    .map((s) => ({ name: s.name, weeks: Math.floor((now - s.bestAt) / (7 * DAY)) }))
    .sort((a, b) => b.weeks - a.weeks)

  return {
    months: list, bestMonth, bestStretch, earlyPace, recentPace, recent,
    byMuscle: [...muscle.entries()].filter(([, g]) => g.lifts).map(([m, g]) => ({ muscle: m, gainPct: r1(g.gain / g.lifts) })).sort((a, b) => b.gainPct - a.gainPct),
    stalled,
  }
}

// ---------- Body ↔ strength ----------

export type BodyCorrKey = 'weight_kg' | 'body_fat_pct' | 'muscle_kg' | 'skeletal_kg' | 'fat_free_kg' | 'fat_mass_kg'
export const CORR_KEYS: { k: BodyCorrKey; label: string; mass: boolean }[] = [
  { k: 'weight_kg', label: 'Bodyweight', mass: true },
  { k: 'muscle_kg', label: 'Muscle mass', mass: true },
  { k: 'skeletal_kg', label: 'Skeletal muscle', mass: true },
  { k: 'fat_free_kg', label: 'Fat-free mass', mass: true },
  { k: 'body_fat_pct', label: 'Body fat %', mass: false },
  { k: 'fat_mass_kg', label: 'Fat mass', mass: true },
]

export interface Week { t: number; strength: number | null; body: Partial<Record<BodyCorrKey, number>> }
export interface Corr { k: BodyCorrKey; label: string; r: number; n: number; slope: number; mass: boolean }

const weekStart = (t: number) => { const d = new Date(startOfDay(t)); return d.getTime() - ((d.getDay() + 6) % 7) * DAY }

export function pearson(xs: number[], ys: number[]) {
  const n = xs.length
  if (n < 3) return 0
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n
  let sxy = 0, sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2 }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : 0
}

/**
 * Weekly strength index (each regular lift's latest e1RM as % of its all-time best, averaged; a lift counts for 6 weeks after it was last trained)
 * next to weekly averages of the body metrics, plus how strongly each metric moves with strength.
 */
export function bodyStrength(series: LiftSeries[], body: BodyMetric[], unit: Unit, from = 0) {
  const core = series.filter((s) => s.pts.length >= 5)
  const out: { weeks: Week[]; corr: Corr[] } = { weeks: [], corr: [] }
  if (!core.length || !body.length) return out
  const firstBody = new Date(body[0].measured_at).getTime()
  const start = weekStart(Math.max(firstBody - 8 * 7 * DAY, Math.min(...core.map((s) => s.pts[0].t)), from))
  const end = weekStart(Date.now())
  const idx = core.map(() => 0)
  const bw = new Map<number, BodyMetric[]>()
  for (const b of body) { const w = weekStart(new Date(b.measured_at).getTime()); const a = bw.get(w); if (a) a.push(b); else bw.set(w, [b]) }
  // Step via weekStart (not +7 days) so daylight-saving shifts don't knock keys off local midnight.
  for (let w = start; w <= end; w = weekStart(w + 7.5 * DAY)) {
    const wEnd = w + 7 * DAY
    let tot = 0, cnt = 0
    core.forEach((s, i) => {
      while (idx[i] < s.pts.length && s.pts[idx[i]].t < wEnd) idx[i]++
      const last = s.pts[idx[i] - 1]
      if (last && wEnd - last.t <= 6 * 7 * DAY) { tot += (last.v / s.best) * 100; cnt++ }
    })
    const readings = bw.get(w) ?? []
    const bodyAvg: Week['body'] = {}
    for (const { k, mass } of CORR_KEYS) {
      const vs = readings.map((r) => r[k]).filter((v) => v > 0)
      if (vs.length) { const a = vs.reduce((x, y) => x + y) / vs.length; bodyAvg[k] = r1(mass ? toUnit(a, unit) : a) }
    }
    out.weeks.push({ t: w, strength: cnt ? r1(tot / cnt) : null, body: bodyAvg })
  }
  for (const c of CORR_KEYS) {
    const pairs = out.weeks.filter((w) => w.strength !== null && w.body[c.k] !== undefined)
    if (pairs.length < 6) continue
    const xs = pairs.map((w) => w.body[c.k]!), ys = pairs.map((w) => w.strength!)
    const f = fit(xs.map((x, i) => ({ t: x * DAY, v: ys[i] })))
    out.corr.push({ k: c.k, label: c.label, mass: c.mass, r: Math.round(pearson(xs, ys) * 100) / 100, n: pairs.length, slope: f?.slope ?? 0 })
  }
  return out
}

export function describeR(r: number) {
  const a = Math.abs(r)
  const strength = a >= 0.7 ? 'Strong' : a >= 0.4 ? 'Moderate' : a >= 0.2 ? 'Weak' : 'No clear'
  return a < 0.2 ? 'No clear link' : `${strength} ${r > 0 ? 'positive' : 'negative'} link`
}

/** DOTS score: powerlifting total scaled for bodyweight (kg in, points out). */
export function dots(totalKg: number, bwKg: number, sex: 'male' | 'female') {
  const [a, b, c, d, e] = sex === 'female'
    ? [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
    : [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093]
  const x = Math.min(Math.max(bwKg, 40), sex === 'female' ? 150 : 210)
  return (totalKg * 500) / (a + b * x + c * x ** 2 + d * x ** 3 + e * x ** 4)
}

// ---------- Comparisons ----------

export const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const
/** Approximate 1RM ÷ bodyweight thresholds for each level, from widely used strength standards. */
const STANDARDS: Record<'male' | 'female', Record<Lift, number[]>> = {
  male: { squat: [0.75, 1.25, 1.5, 2.25, 2.75], bench: [0.5, 0.75, 1.25, 1.75, 2.0], deadlift: [1.0, 1.5, 2.0, 2.5, 3.0], ohp: [0.35, 0.55, 0.8, 1.05, 1.35], row: [0.5, 0.75, 1.0, 1.5, 1.75] },
  female: { squat: [0.5, 0.75, 1.25, 1.5, 2.0], bench: [0.25, 0.5, 0.75, 1.0, 1.5], deadlift: [0.5, 1.0, 1.25, 1.75, 2.5], ohp: [0.2, 0.35, 0.5, 0.75, 1.0], row: [0.25, 0.4, 0.65, 0.9, 1.2] },
}
/** Rough share of regular gym-goers at or below each threshold. */
const PCTILES = [5, 20, 50, 80, 95]
export const LIFT_NAMES: Record<Lift, string> = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift', ohp: 'Overhead Press', row: 'Barbell Row' }

export interface Standing { lift: Lift; exercise: string; e1rm: number; ratio: number; level: number; percentile: number; thresholds: number[]; next: number | null; series: LiftSeries }

/** Best est. 1RM per main lift within the period (`from`, 0 = all time) against bodyweight standards. */
export function standings(series: LiftSeries[], bw: number, sex: 'male' | 'female', from = 0): Standing[] {
  if (bw <= 0) return []
  const out: Standing[] = []
  for (const lift of Object.keys(LIFT_NAMES) as Lift[]) {
    // The strongest effort in the period among exercises tagged as this main lift.
    const cand = series.filter((s) => s.lift === lift).map((s) => {
      const recent = s.pts.filter((p) => p.t >= from)
      return { s, v: recent.length ? Math.max(...recent.map((p) => p.v)) : 0 }
    }).filter((c) => c.v > 0).sort((a, b) => b.v - a.v)[0]
    if (!cand) continue
    const th = STANDARDS[sex][lift]
    const ratio = cand.v / bw
    const level = th.filter((x) => ratio >= x).length - 1 // -1 = below beginner
    let pct: number
    if (ratio < th[0]) pct = Math.max(1, (ratio / th[0]) * PCTILES[0])
    else if (ratio >= th[4]) pct = Math.min(99, 95 + ((ratio - th[4]) / (th[4] - th[3])) * 4)
    else pct = PCTILES[level] + ((ratio - th[level]) / (th[level + 1] - th[level])) * (PCTILES[level + 1] - PCTILES[level])
    out.push({ lift, exercise: cand.s.name, e1rm: cand.v, ratio: Math.round(ratio * 100) / 100, level, percentile: Math.round(pct), thresholds: th.map((x) => x * bw), next: level < 4 ? th[level + 1] * bw : null, series: cand.s })
  }
  return out
}

/** Rows in the period and its length in weeks (all time: since the first logged set). */
function periodRows(rows: StatRow[], from: number, now: number) {
  const inRange = rows.filter((r) => new Date(r.set.performed_at).getTime() >= from)
  // Don't count weeks before the first logged set (e.g. "1Y" with only 10 months of history).
  const first = rows.length ? Math.min(...rows.map((r) => new Date(r.set.performed_at).getTime())) : now
  const start = Math.max(from, first)
  return { inRange, weeks: Math.max(1, (now - start) / (7 * DAY)) }
}

/** Average weekly sets per muscle over the period, against the commonly recommended 10–20 hard sets per week. */
export function weeklyVolume(rows: StatRow[], from = 0, now = Date.now()) {
  const { inRange, weeks } = periodRows(rows, from, now)
  const c = muscleSetCounts(inRange)
  return MAP_MUSCLES.map((m: MapMuscle) => ({ muscle: m, perWeek: r1(c[m] / weeks) }))
}

export function workoutsPerWeek(rows: StatRow[], from = 0, now = Date.now()) {
  const { inRange, weeks } = periodRows(rows, from, now)
  return r1(new Set(inRange.map((r) => r.set.workout)).size / weeks)
}

/** Body-fat category (ACE chart). */
export function bodyFatBand(pct: number, sex: 'male' | 'female') {
  const cut = sex === 'female' ? [14, 21, 25, 32] : [6, 14, 18, 25]
  const names = ['Essential', 'Athletic', 'Fitness', 'Average', 'Above average']
  return { name: names[cut.filter((c) => pct >= c).length], cut }
}

/** Fat-free mass index normalised to 1.8 m. Untrained averages are about 19 (men) and 15 (women). */
export function ffmi(ffmKg: number, heightCm: number) {
  const h = heightCm / 100
  return h > 0 && ffmKg > 0 ? r1(ffmKg / h ** 2 + 6.1 * (1.8 - h)) : 0
}
export function ffmiBand(v: number, sex: 'male' | 'female') {
  const cut = sex === 'female' ? [15, 17, 18, 19, 21] : [18, 20, 22, 23, 25]
  const names = ['Below average', 'Average', 'Above average', 'Excellent', 'Superior', 'Exceptional']
  return names[cut.filter((c) => v >= c).length]
}

export const kgFrom = (v: number, u: Unit) => fromUnit(v, u)
