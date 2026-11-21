import type { Routine, User, Workout } from './pb'
import { pb } from './pb'

/** Weekly plan: a repeating rotation of routines and rest days, e.g. Push, Pull, Legs, Rest. */
export type PlanStep = string // routine id or 'rest'
/** `skip`: the step you skipped and when; it moves you on to the next workout until you train again. */
export type Plan = { cycle: PlanStep[]; skip?: { step: number; at: string } }
export const REST = 'rest'

export const userPlan = (u: Pick<User, 'plan'> | null | undefined): Plan => {
  const p = u?.plan as Plan | null
  const c = p?.cycle
  const sk = p?.skip
  return {
    cycle: Array.isArray(c) ? c.filter((x) => typeof x === 'string').slice(0, 21) : [],
    ...(sk && typeof sk.step === 'number' && typeof sk.at === 'string' ? { skip: { step: sk.step, at: sk.at } } : {}),
  }
}
export const savePlan = (userId: string, plan: Plan) => pb.collection('users').update(userId, { plan })

const DAY = 86400000
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export type NextUp =
  | { status: 'none' }
  | { status: 'train'; step: number; routine: Routine; afterRest: boolean }
  | { status: 'rest'; step: number; next: Routine | null; nextStep: number }
  | { status: 'done'; step: number; next: Routine | null; nextStep: number; restFirst: boolean }

/**
 * Where you are in the rotation. Position comes from the last finished workout of a planned routine
 * (so a missed day doesn't skip a session); rest days are calendar days after that workout.
 */
export function nextUp(plan: Plan, routines: Routine[], recent: Pick<Workout, 'routine' | 'started_at'>[], now = new Date()): NextUp {
  const byId = new Map(routines.map((r) => [r.id, r]))
  const cycle = plan.cycle.filter((s) => s === REST || byId.has(s))
  const n = cycle.length
  if (!cycle.some((s) => s !== REST)) return { status: 'none' }
  const firstLift = (from: number) => { for (let k = 0; k < n; k++) { const i = (from + k) % n; if (cycle[i] !== REST) return i } return -1 }

  const last = recent.find((w) => w.routine && cycle.includes(w.routine))
  // Skipped since your last planned workout: the next workout after the skipped spot is up now.
  const sk = plan.skip
  if (sk && sk.step >= 0 && sk.step < n && (!last || new Date(sk.at) > new Date(last.started_at))) {
    const i = firstLift(sk.step + 1)
    return { status: 'train', step: i, routine: byId.get(cycle[i])!, afterRest: false }
  }
  if (!last) { const i = firstLift(0); return { status: 'train', step: i, routine: byId.get(cycle[i])!, afterRest: false } }

  // A routine can appear twice (Push, Pull, Legs, Push, Pull, Legs, Rest): pick the spot that follows the workout before it.
  const planned = recent.filter((w) => w.routine && cycle.includes(w.routine))
  const spots = cycle.map((s, i) => (s === last.routine ? i : -1)).filter((i) => i >= 0)
  const prevLift = (i: number) => { for (let k = 1; k < n; k++) { const j = (i - k + n) % n; if (cycle[j] !== REST) return cycle[j] } return '' }
  const at = spots.find((i) => prevLift(i) === planned[1]?.routine) ?? spots[0]
  const days = Math.round((dayStart(now) - dayStart(new Date(last.started_at))) / DAY)
  let rests = 0
  for (let k = 1; k < n && cycle[(at + k) % n] === REST; k++) rests++
  const nextLift = firstLift(at + 1 + rests)
  const next = byId.get(cycle[nextLift]) ?? null
  if (days <= 0) return { status: 'done', step: at, next, nextStep: nextLift, restFirst: rests > 0 }
  if (days <= rests) return { status: 'rest', step: (at + days) % n, next, nextStep: nextLift }
  return { status: 'train', step: nextLift, routine: next!, afterRest: rests > 0 }
}
