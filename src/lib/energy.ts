import { me, pb, type Exercise, type Kind } from './pb'

/**
 * Exercise energy estimates. Everything returned is NET calories (what the session burned above resting), because
 * resting burn is already part of the daily baseline (BMR × activity). Sources, best first:
 *   watch  – active calories the user typed in from a watch/machine
 *   hr     – average heart rate (Keytel et al. 2005)
 *   pace   – distance + time (ACSM walking/running equations, cycling speed bands, Concept2 rowing watts)
 *   effort – the modality's MET (Compendium of Physical Activities) scaled by perceived effort (RPE 1–10)
 *   typical – the modality's MET at a moderate effort
 */

export type Person = { kg: number; cm: number; age: number; sex: '' | 'male' | 'female'; ageKnown?: boolean }
export type Method = 'watch' | 'hr' | 'pace' | 'effort' | 'typical'
export type CardioIn = { name: string; kind: Kind; seconds: number; distanceKm: number; avgHr?: number; rpe?: number; kcal?: number }
export type Estimate = { kcal: number; method: Method; met?: number; label: string }

export const METHOD_LABEL: Record<Method, string> = {
  watch: 'from your watch', hr: 'from heart rate', pace: 'from pace', effort: 'from effort', typical: 'typical effort',
}

/** Exercises we estimate as cardio: distance + time ones, plus timed sports/conditioning. */
export const isCardio = (ex: Pick<Exercise, 'kind' | 'muscle'> | undefined | null) =>
  !!ex && (ex.kind === 'cardio' || (ex.muscle === 'cardio' && ex.kind === 'duration'))

type Mode = { id: string; re: RegExp; met: number }
// Moderate-effort METs. Order matters (first match wins).
const MODES: Mode[] = [
  { id: 'stairs', re: /stair|step ?mill|stepper|step ?machine/, met: 9.0 },
  { id: 'jumprope', re: /jump ?rope|skipping|double under/, met: 11.0 },
  { id: 'sprint', re: /sprint|interval/, met: 10.0 },
  { id: 'hike', re: /hik|ruck/, met: 6.0 },
  { id: 'run', re: /run|jog/, met: 9.8 },
  { id: 'treadmill', re: /treadmill/, met: 5.5 },
  { id: 'walk', re: /walk/, met: 3.5 },
  { id: 'airbike', re: /air ?bike|assault|echo ?bike|fan ?bike/, met: 9.0 },
  { id: 'skierg', re: /ski ?erg/, met: 7.0 },
  { id: 'cycle', re: /spin|cycl|bike|biking|peloton/, met: 7.0 },
  { id: 'elliptical', re: /ellip|cross ?trainer|arc ?trainer/, met: 5.0 },
  { id: 'row', re: /row|erg/, met: 7.0 },
  { id: 'swim', re: /swim/, met: 7.0 },
  { id: 'basketball', re: /basketball/, met: 7.0 },
  { id: 'soccer', re: /soccer|football|rugby|hockey|lacrosse/, met: 7.5 },
  { id: 'racquet', re: /tennis|squash|racquet|racket/, met: 7.0 },
  { id: 'paddle', re: /pickleball|badminton|table tennis|ping ?pong|volleyball/, met: 5.0 },
  { id: 'boxing', re: /box|kickbox|muay|mma|martial|bag work/, met: 7.8 },
  { id: 'circuit', re: /hiit|circuit|crossfit|metcon|burpee|bootcamp|tabata/, met: 8.0 },
  { id: 'sled', re: /sled|prowler|battle ?rope/, met: 8.0 },
  { id: 'climb', re: /climb|boulder/, met: 7.5 },
  { id: 'dance', re: /danc|zumba/, met: 5.5 },
  { id: 'jacks', re: /jumping jack/, met: 8.0 },
  { id: 'mobility', re: /yoga|stretch|mobility|pilates/, met: 3.0 },
  { id: 'golf', re: /golf/, met: 4.5 },
]
const modeOf = (name: string): Mode => MODES.find((m) => m.re.test(name.toLowerCase())) ?? { id: 'cardio', re: /./, met: 6.0 }

/** RPE 1–10 → multiplier on the moderate MET (RPE 5 = 1×, 10 = 1.45×, 1 = 0.64×). */
export const rpeFactor = (rpe?: number) => (rpe && rpe > 0 ? 0.55 + 0.09 * Math.min(10, rpe) : 1)

/** Mifflin-St Jeor resting metabolic rate. Unknown sex uses the midpoint of the two constants. */
export function bmr(p: Person) {
  const s = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78
  return Math.max(800, 10 * p.kg + 6.25 * p.cm - 5 * p.age + s)
}

/** MET from pace, or null when the modality/inputs don't support it. */
function paceMet(mode: string, km: number, sec: number): number | null {
  if (km <= 0 || sec < 60) return null
  const kmh = km / (sec / 3600)
  const mpm = (kmh * 1000) / 60
  const walk = () => (0.1 * mpm + 3.5) / 3.5
  const run = () => (0.2 * mpm + 3.5) / 3.5
  switch (mode) {
    case 'walk': return kmh > 30 ? null : kmh >= 8 ? run() : walk()
    case 'hike': return kmh > 15 ? null : walk() * 1.4 // terrain + incline
    case 'run': case 'treadmill': case 'sprint':
      if (kmh > 30 || kmh < 2) return null
      return kmh < (mode === 'treadmill' ? 7 : 6) ? walk() : run()
    case 'cycle': {
      if (kmh > 60 || kmh < 5) return null
      return kmh < 16 ? 4 : kmh < 19 ? 6.8 : kmh < 22.5 ? 8 : kmh < 25.7 ? 10 : kmh < 30.6 ? 12 : 15.8
    }
    default: return null
  }
}

/** Concept2 watts from pace; ~21% efficient, so each watt ≈ 4.1 kcal/h of net burn. Null if pace is implausible. */
function rowNetKcal(km: number, sec: number): number | null {
  if (km <= 0 || sec < 60) return null
  const secPer500 = sec / (km * 2)
  if (secPer500 < 75 || secPer500 > 240) return null
  const watts = 2.8 / (sec / (km * 1000)) ** 3
  return (0.8604 / 0.21) * watts * (sec / 3600)
}

/** Keytel 2005 gross kcal/min from average heart rate. */
function hrKcalPerMin(hr: number, p: Person) {
  const m = (-55.0969 + 0.6309 * hr + 0.1988 * p.kg + 0.2017 * p.age) / 4.184
  const f = (-20.4022 + 0.4472 * hr - 0.1263 * p.kg + 0.074 * p.age) / 4.184
  return p.sex === 'male' ? m : p.sex === 'female' ? f : (m + f) / 2
}

const MAX_NET_PER_MIN = 25

/** Net calories for one cardio set, with how it was worked out. */
export function estimateCardio(c: CardioIn, p: Person): Estimate {
  const min = c.seconds / 60
  const cap = (k: number) => Math.round(Math.max(0, Math.min(k, MAX_NET_PER_MIN * Math.max(min, 1))))
  if (c.kcal && c.kcal > 0) return { kcal: Math.round(c.kcal), method: 'watch', label: METHOD_LABEL.watch }
  if (min <= 0) return { kcal: 0, method: 'typical', label: 'add a time to estimate' }
  const mode = modeOf(c.name)
  const restPerMin = bmr(p) / 1440
  // Keytel over-reads at low heart rates, so only trust it once the heart is clearly working.
  if (c.avgHr && c.avgHr >= 95 && c.avgHr <= 220) {
    const net = (hrKcalPerMin(c.avgHr, p) - restPerMin) * min
    return { kcal: cap(net), method: 'hr', label: `${METHOD_LABEL.hr} (${Math.round(c.avgHr)} bpm)` }
  }
  if (c.kind === 'cardio') {
    if (mode.id === 'row') {
      const k = rowNetKcal(c.distanceKm, c.seconds)
      if (k != null) return { kcal: cap(k), method: 'pace', label: METHOD_LABEL.pace }
    }
    const met = paceMet(mode.id, c.distanceKm, c.seconds)
    if (met != null) return { kcal: cap((met - 1) * p.kg * (min / 60)), method: 'pace', met, label: METHOD_LABEL.pace }
  }
  const met = mode.met * rpeFactor(c.rpe)
  const kcal = cap((met - 1) * p.kg * (min / 60))
  return c.rpe ? { kcal, method: 'effort', met, label: `${METHOD_LABEL.effort} (RPE ${c.rpe})` } : { kcal, method: 'typical', met, label: METHOD_LABEL.typical }
}

/** Resistance training ≈ 3.5 MET averaged over a session (rest periods included) when only the time is known. */
export const LIFT_MET = 3.5

export type LiftEstimate = { kcal: number; minutes: number; met: number; how: string; trimmed: boolean }

/**
 * One lifting session from its time and how many sets you did. Packing more sets into the same time means less
 * rest and harder work, so the MET rises with set density: about 3.4 at a relaxed 1.7 sets per 10 min, 4 at a
 * typical 3.3, 5 at 6+ (Compendium resistance training runs 3.5 to 6). If the timer obviously ran on after you
 * finished (far longer than the sets could take), the time is trimmed; with no time recorded, ~3 min per set.
 */
export function liftingSession(seconds: number, sets: number, p: Person): LiftEstimate {
  let min = seconds / 60
  let trimmed = false
  if (sets > 0 && min > sets * 8 + 20) { min = sets * 5 + 15; trimmed = true }
  if (min <= 0 && sets > 0) min = sets * 3
  if (min > 150) { min = 150; trimmed = true }
  if (min < 5) return { kcal: 0, minutes: Math.round(min), met: 0, how: '', trimmed }
  const density = sets ? sets / (min / 10) : 0
  const met = sets ? Math.min(6, Math.max(3, 2.8 + 0.35 * density)) : LIFT_MET
  const pace = density < 2.5 ? 'relaxed pace' : density < 4.5 ? 'steady pace' : 'fast pace'
  return {
    kcal: Math.round((met - 1) * p.kg * (min / 60)), minutes: Math.round(min), met: Math.round(met * 10) / 10, trimmed,
    how: sets ? `${sets} set${sets === 1 ? '' : 's'}, ${pace}${trimmed ? ' (time trimmed)' : ''}` : 'lifting',
  }
}

/** Time-only estimate (no set count). */
export const estimateLifting = (seconds: number, p: Person) => liftingSession(seconds, 0, p).kcal

// ---------- Loading a range of days ----------

export type BurnItem = { workout: string; label: string; minutes: number; kcal: number; how: string; kind: 'cardio' | 'lifting'; sets?: number; day: string }
export type DayBurn = { items: BurnItem[]; total: number }

type WRow = { id: string; name: string; started_at: string; duration_s: number; bodyweight_kg: number }
type SRow = { workout: string; seconds: number; distance_km: number; avg_hr: number; rpe: number; kcal: number; set_type?: string; expand?: { exercise?: Pick<Exercise, 'name' | 'kind' | 'muscle'> } }

const pad = (n: number) => `${n}`.padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Exercise burn per local day (YYYY-MM-DD) for workouts started in [from, to). */
export async function loadBurn(from: Date, to: Date, p: Person, countLifting = true): Promise<Map<string, DayBurn>> {
  const range = { u: me(), a: from, b: to }
  const [ws, sets] = await Promise.all([
    pb.collection('workouts').getFullList<WRow>({ filter: pb.filter('user = {:u} && started_at >= {:a} && started_at < {:b}', range), fields: 'id,name,started_at,duration_s,bodyweight_kg', sort: 'started_at' }),
    pb.collection('workout_sets').getFullList<SRow>({
      filter: pb.filter('user = {:u} && performed_at >= {:a} && performed_at < {:b} && completed = true', range),
      fields: 'workout,seconds,distance_km,avg_hr,rpe,kcal,set_type,expand.exercise.name,expand.exercise.kind,expand.exercise.muscle', expand: 'exercise', batch: 1000,
    }),
  ])
  const byW = new Map<string, SRow[]>()
  const liftSets = new Map<string, number>()
  sets.forEach((s) => {
    if (isCardio(s.expand?.exercise)) byW.set(s.workout, [...(byW.get(s.workout) ?? []), s])
    else liftSets.set(s.workout, (liftSets.get(s.workout) ?? 0) + 1)
  })
  const out = new Map<string, DayBurn>()
  for (const w of ws) {
    const who = w.bodyweight_kg > 0 ? { ...p, kg: w.bodyweight_kg } : p
    const items: BurnItem[] = []
    let cardioSec = 0
    for (const s of byW.get(w.id) ?? []) {
      const ex = s.expand!.exercise!
      cardioSec += s.seconds
      const e = estimateCardio({ name: ex.name, kind: ex.kind, seconds: s.seconds, distanceKm: s.distance_km, avgHr: s.avg_hr, rpe: s.rpe, kcal: s.kcal }, who)
      if (e.kcal > 0) items.push({ workout: w.id, label: ex.name, minutes: Math.round(s.seconds / 60), kcal: e.kcal, how: e.label, kind: 'cardio', day: localDay(new Date(w.started_at)) })
    }
    // Lifting: the workout's time minus its cardio, and how many (non-cardio) sets were done in it.
    const nSets = liftSets.get(w.id) ?? 0
    const lift = countLifting && (nSets > 0 || !byW.has(w.id)) ? liftingSession(Math.max(0, w.duration_s - cardioSec), nSets, who) : null
    if (lift && lift.kcal > 0) items.push({ workout: w.id, label: w.name || 'Workout', minutes: lift.minutes, kcal: lift.kcal, how: lift.how, kind: 'lifting', sets: nSets, day: localDay(new Date(w.started_at)) })
    if (!items.length) continue
    const k = localDay(new Date(w.started_at))
    const d = out.get(k) ?? { items: [], total: 0 }
    d.items.push(...items); d.total += items.reduce((t, i) => t + i.kcal, 0)
    out.set(k, d)
  }
  return out
}
