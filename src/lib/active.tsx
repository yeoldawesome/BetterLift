import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { epley, fromDist, fromUnit, num } from './format'
import type { SetType } from './setTypes'
import { loadExercises, matchOfficial, nameKey } from './exercises'
import { DEFAULT_REST, me, newId, pb, restFor, type Exercise, type Routine, type RoutineExercise, type Unit, type User, type Visibility, type WSet } from './pb'

export type ASet = { w: string; r: string; sec: string; dist: string; done: boolean; type?: SetType }
export type Prev = { w: number; r: number; sec: number; dist: number }
/** rest = between sets, restAfter = after the last set (transition to the next exercise). */
/** note: undefined = no note box shown. superset: shared id for exercises done back-to-back. */
export type AEx = { key: string; ex: Exercise; rest: number; restAfter?: number; target: string; sets: ASet[]; prev: Prev[]; note?: string; superset?: string }
export type Active = { id: string; name: string; routine: string; startedAt: string; notes: string; exercises: AEx[] }
type Rest = { end: number; total: number } | null

interface Ctx {
  active: Active | null
  update: (fn: (a: Active) => Active) => void
  start: (name: string, routine?: string, exercises?: AEx[]) => void
  discard: () => void
  rest: Rest
  startRest: (s: number) => void
  adjustRest: (d: number) => void
  stopRest: () => void
}

const C = createContext<Ctx>(null!)
export const useActive = () => useContext(C)
const KEY = 'bl.active', RKEY = 'bl.rest'

function load<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null }
}
function store(k: string, v: unknown) {
  try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k) } catch { /* private mode */ }
}

export const emptySet = (): ASet => ({ w: '', r: '', sec: '', dist: '', done: false })

export function ActiveProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(() => {
    const a = load<Active>(KEY)
    // Drop fields from older saved sessions (e.g. RPE).
    return a ? { ...a, exercises: a.exercises.map((x) => ({ ...x, sets: x.sets.map(({ w, r, sec, dist, done, type }) => ({ w, r, sec, dist, done, type })) })) } : null
  })
  const [rest, setRest] = useState<Rest>(() => load(RKEY))
  useEffect(() => store(KEY, active), [active])
  useEffect(() => {
    const onMerge = (ev: Event) => {
      const { from } = (ev as CustomEvent<{ from: string; to: string }>).detail
      setActive((a) => {
        if (!a || !a.exercises.some((x) => x.ex.id === from)) return a
        repairActive(a).then((fixed) => setActive((cur) => (cur && cur.id === fixed.id ? { ...cur, exercises: fixed.exercises.map((x, i) => ({ ...cur.exercises[i], ex: x.ex })) } : cur))).catch(() => {})
        return a
      })
    }
    window.addEventListener('bl:exercise-merged', onMerge)
    return () => window.removeEventListener('bl:exercise-merged', onMerge)
  }, [])
  useEffect(() => store(RKEY, rest), [rest])

  const update = useCallback((fn: (a: Active) => Active) => setActive((a) => (a ? fn(a) : a)), [])
  const start = useCallback((name: string, routine = '', exercises: AEx[] = []) =>
    setActive({ id: newId(), name, routine, startedAt: new Date().toISOString(), notes: '', exercises }), [])
  const discard = useCallback(() => { setActive(null); setRest(null) }, [])
  const startRest = useCallback((s: number) => setRest(s > 0 ? { end: Date.now() + s * 1000, total: s } : null), [])
  const adjustRest = useCallback((d: number) => setRest((r) => (r ? { end: r.end + d * 1000, total: Math.max(1, r.total + d) } : r)), [])
  const stopRest = useCallback(() => setRest(null), [])

  return <C.Provider value={{ active, update, start, discard, rest, startRest, adjustRest, stopRest }}>{children}</C.Provider>
}

/** Sets from the most recent session of this exercise (before `before`, if given). */
export async function prevFor(exId: string, before?: string): Promise<WSet[]> {
  let filter = pb.filter('user = {:u} && exercise = {:e} && completed = true', { u: me(), e: exId })
  if (before) filter += pb.filter(' && performed_at < {:b}', { b: before })
  const res = await pb.collection('workout_sets').getList<WSet>(1, 40, { filter, sort: '-performed_at,set_index' })
  const wid = res.items[0]?.workout
  return res.items.filter((s) => s.workout === wid).sort((a, b) => a.set_index - b.set_index)
}

export async function makeEx(ex: Exercise, sets = 1, rest = DEFAULT_REST, target = '', restAfter = rest): Promise<AEx> {
  const prev = (await prevFor(ex.id).catch(() => [])).map((s) => ({ w: s.weight_kg, r: s.reps, sec: s.seconds, dist: s.distance_km }))
  return { key: newId(), ex, rest, restAfter, target, sets: Array.from({ length: Math.max(1, sets) }, emptySet), prev }
}

export async function routineExercises(routineId: string): Promise<AEx[]> {
  const items = await pb.collection('routine_exercises').getFullList<RoutineExercise>({
    filter: pb.filter('routine = {:r}', { r: routineId }), sort: 'position', expand: 'exercise',
  })
  // Routine rest wins for between-sets; the lift's own (or account) default covers the transition after it.
  const lib = new Map((await loadExercises()).map((e) => [e.id, e]))
  const u = pb.authStore.record as User | null
  return Promise.all(items.filter((i) => i.expand?.exercise).map((i) => {
    const ex = lib.get(i.exercise) ?? i.expand!.exercise!
    return makeEx(ex, i.target_sets || 1, i.rest_s, i.reps ? `${i.reps}` : '', restFor(ex, u).after)
  }))
}

/** Persists the workout + completed sets atomically and flags e1RM PRs. Returns the workout id. */
/**
 * Swap out exercises that no longer exist (e.g. a custom exercise merged into an official one after the
 * workout started) for the exercise they became, so saving never fails on a dangling reference.
 */
export async function repairActive(a: Active): Promise<Active> {
  const lib = await loadExercises(true)
  const byId = new Map(lib.map((e) => [e.id, e]))
  if (a.exercises.every((x) => byId.has(x.ex.id))) return a
  return {
    ...a,
    exercises: a.exercises.map((x) => {
      const fresh = byId.get(x.ex.id)
      if (fresh) return x
      const to = lib.find((e) => nameKey(e.name) === nameKey(x.ex.name)) ?? matchOfficial(x.ex.name, lib)
      if (!to) throw new Error(`“${x.ex.name}” no longer exists. Remove it from this workout (or swap in another exercise) and finish again.`)
      return { ...x, ex: to }
    }),
  }
}

export async function finishWorkout(a: Active, unit: Unit, visibility: Visibility, bodyweightKg = 0): Promise<string> {
  a = await repairActive(a)
  const uid = me()
  // Superset ids → small per-workout group numbers.
  const groups = new Map<string, number>()
  a.exercises.forEach((x) => { if (x.superset && !groups.has(x.superset)) groups.set(x.superset, groups.size + 1) })
  const rows = a.exercises.flatMap((x, pos) =>
    x.sets.filter((s) => s.done).map((s, idx) => {
      const kg = fromUnit(num(s.w), unit), reps = Math.round(num(s.r))
      const type = s.type || 'normal'
      // Warm-ups and cool-downs never count toward PRs.
      const e1 = x.ex.kind === 'weight' && type !== 'warmup' && type !== 'cooldown' ? epley(kg, reps) : 0
      return { ex: x.ex, pos, idx, kg, reps, sec: Math.round(num(s.sec)), dist: fromDist(num(s.dist), unit), e1, type,
        note: idx === 0 ? (x.note ?? '').trim() : '', superset: x.superset ? groups.get(x.superset)! : 0 }
    }))
  if (!rows.length) throw new Error('Check off at least one set before finishing.')

  const exIds = [...new Set(rows.map((r) => r.ex.id))]
  const bestPrev = new Map<string, number>()
  await Promise.all(exIds.map(async (id) => {
    try {
      const r = await pb.collection('workout_sets').getFirstListItem<WSet>(pb.filter('user = {:u} && exercise = {:e}', { u: uid, e: id }), { sort: '-e1rm_kg', fields: 'e1rm_kg' })
      bestPrev.set(id, r.e1rm_kg)
    } catch { bestPrev.set(id, 0) }
  }))
  const prs = new Set<number>()
  for (const id of exIds) {
    let best = -1
    rows.forEach((r, i) => { if (r.ex.id === id && r.e1 > 0 && (best < 0 || r.e1 > rows[best].e1)) best = i })
    if (best >= 0 && rows[best].e1 > (bestPrev.get(id) ?? 0) + 0.01) prs.add(best)
  }

  const batch = pb.createBatch()
  batch.collection('workouts').create({
    id: a.id, user: uid, routine: a.routine, name: a.name.trim() || 'Workout', notes: a.notes, started_at: a.startedAt, visibility, bodyweight_kg: bodyweightKg,
    ended_at: new Date().toISOString(), duration_s: Math.round((Date.now() - new Date(a.startedAt).getTime()) / 1000),
    volume_kg: rows.reduce((t, r) => t + (r.ex.kind === 'weight' ? r.kg * r.reps : 0), 0), pr_count: prs.size,
  })
  rows.forEach((r, i) => batch.collection('workout_sets').create({
    workout: a.id, user: uid, exercise: r.ex.id, performed_at: a.startedAt, position: r.pos, set_index: r.idx,
    weight_kg: r.kg, reps: r.reps, seconds: r.sec, distance_km: r.dist, completed: true, e1rm_kg: r.e1, is_pr: prs.has(i),
    set_type: r.type, note: r.note, superset: r.superset,
  }))
  await batch.send()
  return a.id
}

const mode = (xs: number[]) => {
  const c = new Map<number, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
}

/** Replaces a routine's exercises with what was done in this workout (sets, reps, rest). Never renames the routine. */
export async function syncRoutine(a: Active, routineId: string) {
  const uid = me()
  const old = await pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: pb.filter('routine = {:r}', { r: routineId }), fields: 'id' })
  const b = pb.createBatch()
  old.forEach((o) => b.collection('routine_exercises').delete(o.id))
  a.exercises.forEach((x, pos) => {
    const done = x.sets.filter((s) => s.done)
    const reps = mode(done.map((s) => Math.round(num(s.r))).filter((r) => r > 0)) || parseInt(x.target) || 0
    b.collection('routine_exercises').create({ routine: routineId, user: uid, exercise: x.ex.id, position: pos, target_sets: Math.max(1, done.length || x.sets.length), reps, rest_s: x.rest })
  })
  await b.send()
}

export async function saveAsRoutine(a: Active, name: string) {
  const count = (await pb.collection('routines').getList(1, 1, { filter: pb.filter('user = {:u}', { u: me() }) })).totalItems
  const r = await pb.collection('routines').create<Routine>({ user: me(), name: name.trim() || 'Workout', position: count })
  await syncRoutine(a, r.id)
  return r.id
}
