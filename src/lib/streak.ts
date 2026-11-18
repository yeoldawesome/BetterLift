import { pb, type Workout } from './pb'

/** Up to 2 rest days in a row are allowed; you must train on the 3rd day or the streak resets. */
export const MAX_GAP = 3

export interface Streak {
  days: number        // calendar days from the streak's first workout through today (0 = no active streak)
  workouts: number    // workout days inside the current streak
  restLeft: number    // rest days you can still take before you must lift (0 = lift today or lose it)
  atRisk: boolean     // today is the last day to keep it
  best: number        // longest streak ever, in days
}

const dayIndex = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000)

export function computeStreak(dates: Date[], now = new Date()): Streak {
  const days = [...new Set(dates.map(dayIndex))].sort((a, b) => a - b)
  const today = dayIndex(now)
  const none = { days: 0, workouts: 0, restLeft: 0, atRisk: false, best: 0 }
  if (!days.length) return none
  // Walk runs of workout days where each gap is <= MAX_GAP.
  let best = 1, runStart = days[0]
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] > MAX_GAP) runStart = days[i]
    best = Math.max(best, days[i] - runStart + 1)
  }
  const last = days[days.length - 1]
  const since = today - last
  if (since > MAX_GAP) return { ...none, best }
  let start = last, count = 1
  for (let i = days.length - 2; i >= 0 && days[i + 1] - days[i] <= MAX_GAP; i--) { start = days[i]; count++ }
  const length = today - start + 1
  return { days: length, workouts: count, restLeft: Math.max(0, MAX_GAP - 1 - since), atRisk: since === MAX_GAP, best: Math.max(best, length) }
}

export async function loadStreak(userId: string): Promise<Streak> {
  const ws = await pb.collection('workouts').getFullList<Workout>({ filter: pb.filter('user = {:u}', { u: userId }), fields: 'started_at', sort: '-started_at', batch: 1000 })
  return computeStreak(ws.map((w) => new Date(w.started_at)))
}

export function streakText(s: Streak) {
  if (!s.days) return 'Lift today to start a streak'
  if (s.atRisk) return 'Last day — lift today to keep your streak!'
  if (s.restLeft === 0) return 'Rest today is fine, but lift tomorrow'
  return s.restLeft === 2 ? 'You trained today — 2 rest days banked' : `${s.restLeft} rest day${s.restLeft === 1 ? '' : 's'} left before you need to lift`
}
