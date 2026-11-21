import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { epley, fmtDist, fmtW, fromDist, fromUnit, num } from './format'
import type { SetType } from './setTypes'
import { loadExercises, matchOfficial, nameKey } from './exercises'
import { myAccent } from './theme'
import { idbDel, idbGet, idbSet } from './idb'
import { scheduleRestPush } from './push'
import { DEFAULT_REST, me, newId, pb, restFor, type Exercise, type PlanSet, type Routine, type RoutineExercise, type Unit, type User, type Visibility, type WSet } from './pb'

/** hr/rpe/kcal: cardio effort (average heart rate, perceived effort 1–10, active calories from a watch). */
export type ASet = { w: string; r: string; sec: string; dist: string; done: boolean; type?: SetType; hr?: string; rpe?: number; kcal?: string }
export type Prev = { w: number; r: number; sec: number; dist: number }
/** rest = between sets, restAfter = after the last set (transition to the next exercise). */
/** note: undefined = no note box shown. superset: shared id for exercises done back-to-back. */
export type AEx = { key: string; ex: Exercise; rest: number; restAfter?: number; target: string; sets: ASet[]; prev: Prev[]; note?: string; superset?: string; collapsed?: boolean
  /** Planned weight (kg) and reps per set, saved on the routine. Used before `prev` for placeholders / one-tap fill. */
  plan?: PlanSet[]
  /** Last session's sets are still loading (the card shows right away; placeholders fill in when they arrive). */
  prevPending?: boolean }
export type Active = { id: string; name: string; routine: string; startedAt: string; notes: string; exercises: AEx[] }
type Rest = { end: number; total: number; name?: string } | null

interface Ctx {
  active: Active | null
  update: (fn: (a: Active) => Active) => void
  start: (name: string, routine?: string, exercises?: AEx[]) => void
  discard: () => void
  rest: Rest
  startRest: (s: number, name?: string) => void
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
  // Mirror to IndexedDB: survives if the OS clears localStorage or the app is killed / updated mid-workout.
  if (v) idbSet(k, v); else idbDel(k)
}
// Ask the browser not to evict our storage under pressure (best effort).
try { navigator.storage?.persist?.().catch(() => {}) } catch { /* unsupported */ }

/** Drop fields from older saved sessions (e.g. RPE). */
function clean(a: Active | null): Active | null {
  if (!a || !Array.isArray(a.exercises)) return null
  return { ...a, exercises: a.exercises.map((x) => ({ ...x, sets: (x.sets ?? []).map(({ w, r, sec, dist, done, type, hr, rpe, kcal }) => ({ w, r, sec, dist, done, type, hr, rpe, kcal })) })) }
}

export const emptySet = (): ASet => ({ w: '', r: '', sec: '', dist: '', done: false })

export function ActiveProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(() => clean(load<Active>(KEY)))
  const [rest, setRest] = useState<Rest>(() => load(RKEY))
  const restored = useRef(!!active)
  // localStorage came back empty (cleared / evicted): fall back to the IndexedDB copy.
  useEffect(() => {
    if (restored.current) return
    idbGet<Active>(KEY).then((a) => {
      const c = clean(a ?? null)
      if (c && !restored.current) { restored.current = true; setActive((cur) => cur ?? c) }
    })
    idbGet<Rest>(RKEY).then((r) => r && r.end > Date.now() && setRest((cur) => cur ?? r))
  }, [])
  useEffect(() => {
    // Don't wipe the IndexedDB copy before we've had a chance to read it.
    if (!active && !restored.current) { try { localStorage.removeItem(KEY) } catch { /* */ } return }
    restored.current = true
    store(KEY, active)
  }, [active])
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
  // Push "rest is over" from the server, so it arrives with the app closed or the phone locked.
  const pushed = useRef<number | null>(rest?.end ?? null)
  useEffect(() => {
    const end = rest && rest.end > Date.now() ? rest.end : null
    if (end === pushed.current) return
    if (end) scheduleRestPush((end - Date.now()) / 1000, rest?.name)
    else if (pushed.current && pushed.current > Date.now() + 1000) scheduleRestPush(0)
    pushed.current = end
  }, [rest])

  // New exercise cards show at once; their "previous" sets load here in the background.
  const loadingPrev = useRef(new Set<string>())
  useEffect(() => {
    for (const x of active?.exercises ?? []) {
      if (!x.prevPending || loadingPrev.current.has(x.key)) continue
      loadingPrev.current.add(x.key)
      prevFor(x.ex.id).catch(() => [] as WSet[]).then((ss) => {
        loadingPrev.current.delete(x.key)
        const prev = ss.map((s) => ({ w: s.weight_kg, r: s.reps, sec: s.seconds, dist: s.distance_km }))
        setActive((a) => (a && a.exercises.some((e) => e.key === x.key)
          ? { ...a, exercises: a.exercises.map((e) => (e.key === x.key ? { ...e, prev: e.prev.length ? e.prev : prev, prevPending: undefined } : e)) } : a))
      })
    }
  }, [active])

  const update = useCallback((fn: (a: Active) => Active) => setActive((a) => (a ? fn(a) : a)), [])
  const start = useCallback((name: string, routine = '', exercises: AEx[] = []) => {
    restored.current = true
    setActive({ id: newId(), name, routine, startedAt: new Date().toISOString(), notes: '', exercises })
  }, [])
  const discard = useCallback(() => { restored.current = true; setActive(null); setRest(null) }, [])
  const startRest = useCallback((s: number, name?: string) => setRest(s > 0 ? { end: Date.now() + s * 1000, total: s, name } : null), [])
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

/** A new exercise card. Its previous sets aren't fetched here (that waited on the network): the workout loads them after it shows. */
export async function makeEx(ex: Exercise, sets = 1, rest = DEFAULT_REST, target = '', restAfter = rest): Promise<AEx> {
  return { key: newId(), ex, rest, restAfter, target, sets: Array.from({ length: Math.max(1, sets) }, emptySet), prev: [], prevPending: true }
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
    const plan = Array.isArray(i.sets) ? i.sets.filter(Boolean) : []
    const timed = ex.kind === 'cardio' || ex.kind === 'duration'
    return makeEx(ex, plan.length || i.target_sets || 1, i.rest_s, i.reps && !timed ? `${i.reps}` : '', restFor(ex, u).after).then((x) => ({
      ...x,
      // Planned values show as placeholders (one tap fills them); set types (warm-up, failure…) carry over as-is.
      sets: x.sets.map((st, j) => (plan[j]?.type && plan[j].type !== 'normal' ? { ...st, type: plan[j].type as SetType } : st)),
      ...(plan.length ? { plan } : {}), ...(i.note ? { note: i.note } : {}),
    }))
  }))
}

/** A routine as editable exercise cards (same shape as a live workout): the planned values are filled in. */
export async function routineDraft(routineId: string, unit: Unit): Promise<AEx[]> {
  const items = await pb.collection('routine_exercises').getFullList<RoutineExercise>({
    filter: pb.filter('routine = {:r}', { r: routineId }), sort: 'position,created', expand: 'exercise',
  })
  const lib = new Map((await loadExercises()).map((e) => [e.id, e]))
  const u = pb.authStore.record as User | null
  return Promise.all(items.filter((i) => i.expand?.exercise).map(async (i) => {
    const ex = lib.get(i.exercise) ?? i.expand!.exercise!
    const x = await makeEx(ex, 1, i.rest_s, '', restFor(ex, u).after)
    const plan = Array.isArray(i.sets) && i.sets.length ? i.sets
      : Array.from({ length: Math.max(1, i.target_sets || 1) }, () => ({ w: 0, r: ex.kind === 'cardio' || ex.kind === 'duration' ? 0 : i.reps || 0 }))
    return { ...x, key: i.id, note: i.note ? i.note : undefined, sets: plan.map((p) => planToSet(p, unit)) }
  }))
}

const planToSet = (p: PlanSet, unit: Unit): ASet => ({
  ...emptySet(), w: p.w ? fmtW(p.w, unit) : '', r: p.r ? `${p.r}` : '', sec: p.sec ? `${p.sec}` : '', dist: p.dist ? fmtDist(p.dist, unit) : '',
  ...(p.type && p.type !== 'normal' ? { type: p.type as SetType } : {}),
})

const setToPlan = (s: ASet, unit: Unit): PlanSet => {
  const out: PlanSet = { w: Math.round(fromUnit(num(s.w), unit) * 100) / 100, r: Math.round(num(s.r)) }
  if (num(s.sec) > 0) out.sec = Math.round(num(s.sec))
  if (num(s.dist) > 0) out.dist = Math.round(fromDist(num(s.dist), unit) * 1000) / 1000
  if (s.type && s.type !== 'normal') out.type = s.type
  return out
}

/** Routine record fields for an exercise card: every set (types and values), plus the summary columns. */
function routineRow(x: AEx, sets: ASet[], unit: Unit) {
  const plan = sets.map((s) => setToPlan(s, unit))
  const timed = x.ex.kind === 'cardio' || x.ex.kind === 'duration'
  const reps = timed ? 0 : mode(plan.filter((p) => p.type !== 'warmup' && p.type !== 'cooldown').map((p) => p.r).filter((r) => r > 0)) || parseInt(x.target) || 0
  return { exercise: x.ex.id, target_sets: Math.max(1, plan.length), reps, rest_s: x.rest, sets: plan.length ? plan : null, note: (x.note ?? '').trim() }
}

/**
 * Saves the routine editor's cards: updates kept exercises, creates new ones (their key is the new record id),
 * deletes removed ones. `saved` is the set of record ids that exist on the server; it's updated in place.
 */
export async function saveRoutineDraft(routineId: string, xs: AEx[], unit: Unit, saved: Set<string>) {
  const b = pb.createBatch()
  const keep = new Set(xs.map((x) => x.key))
  for (const id of saved) if (!keep.has(id)) b.collection('routine_exercises').delete(id)
  xs.forEach((x, position) => {
    const row = { ...routineRow(x, x.sets, unit), position }
    if (saved.has(x.key)) b.collection('routine_exercises').update(x.key, row)
    else b.collection('routine_exercises').create({ id: x.key, routine: routineId, user: me(), ...row })
  })
  if (!saved.size && !xs.length) return
  await b.send()
  saved.clear()
  for (const x of xs) saved.add(x.key)
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
        note: idx === 0 ? (x.note ?? '').trim() : '', superset: x.superset ? groups.get(x.superset)! : 0,
        hr: Math.min(250, Math.round(num(s.hr ?? ''))), rpe: s.rpe ?? 0, kcal: Math.min(10000, Math.round(num(s.kcal ?? ''))) }
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
  // Rep records: more reps than ever at this weight or heavier (135 × 9 → 135 × 10), checked on each lift's top set.
  await Promise.all(exIds.map(async (id) => {
    let top = -1
    rows.forEach((r, i) => { if (r.ex.id === id && r.e1 > 0 && r.kg > 0 && (top < 0 || r.kg > rows[top].kg || (r.kg === rows[top].kg && r.reps > rows[top].reps))) top = i })
    if (top < 0 || [...prs].some((i) => rows[i].ex.id === id)) return
    try {
      const r = await pb.collection('workout_sets').getFirstListItem<WSet>(
        pb.filter('user = {:u} && exercise = {:e} && completed = true && weight_kg >= {:w}', { u: uid, e: id, w: rows[top].kg - 0.01 }), { sort: '-reps', fields: 'reps' })
      if (rows[top].reps > r.reps) prs.add(top)
    } catch { /* never lifted this heavy before: the est. 1RM check above covers it */ }
  }))

  const batch = pb.createBatch()
  batch.collection('workouts').create({
    id: a.id, user: uid, routine: a.routine, name: a.name.trim() || 'Workout', notes: a.notes, started_at: a.startedAt, visibility, bodyweight_kg: bodyweightKg,
    ended_at: new Date().toISOString(), duration_s: Math.round((Date.now() - new Date(a.startedAt).getTime()) / 1000),
    volume_kg: rows.reduce((t, r) => t + (r.ex.kind === 'weight' ? r.kg * r.reps : 0), 0), pr_count: prs.size, accent: myAccent(),
  })
  rows.forEach((r, i) => batch.collection('workout_sets').create({
    workout: a.id, user: uid, exercise: r.ex.id, performed_at: a.startedAt, position: r.pos, set_index: r.idx,
    weight_kg: r.kg, reps: r.reps, seconds: r.sec, distance_km: r.dist, completed: true, e1rm_kg: r.e1, is_pr: prs.has(i),
    set_type: r.type, note: r.note, superset: r.superset, avg_hr: r.hr, rpe: r.rpe, kcal: r.kcal,
  }))
  await batch.send()
  return a.id
}

const mode = (xs: number[]) => {
  const c = new Map<number, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
}

/** Per-set values and types from the checked-off sets, for the routine's plan. */
function planOf(x: AEx, unit: Unit) {
  return x.sets.filter((s) => s.done).map((s) => setToPlan(s, unit))
}

/**
 * Saves this workout back to its routine. Never renames the routine.
 *  - all: replaces the routine's exercises with what was done (order, sets, reps, rest, weights, notes).
 *  - weights: keeps the routine as it is, only updating each exercise's planned weights.
 */
export async function syncRoutine(a: Active, routineId: string, unit: Unit, how: 'all' | 'weights' = 'all') {
  const uid = me()
  const old = await pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: pb.filter('routine = {:r}', { r: routineId }), fields: 'id,exercise,target_sets,reps,sets' })
  const b = pb.createBatch()
  if (how === 'weights') {
    let n = 0
    for (const o of old) {
      const x = a.exercises.find((e) => e.ex.id === o.exercise)
      if (!x || x.ex.kind === 'duration' || x.ex.kind === 'cardio') continue
      const done = planOf(x, unit)
      if (!done.length) continue
      // Keep the routine's set count and reps; only the weights change (the last done weight fills extra sets).
      const count = Math.max(1, o.target_sets || done.length)
      const sets = Array.from({ length: count }, (_, i) => ({ ...(o.sets?.[i] ?? {}), w: (done[i] ?? done[done.length - 1]).w, r: o.sets?.[i]?.r || o.reps || done[i]?.r || 0 }))
      b.collection('routine_exercises').update(o.id, { sets })
      n++
    }
    if (n) await b.send()
    return
  }
  old.forEach((o) => b.collection('routine_exercises').delete(o.id))
  a.exercises.forEach((x, pos) => {
    const done = x.sets.filter((s) => s.done)
    b.collection('routine_exercises').create({ routine: routineId, user: uid, position: pos, ...routineRow(x, done.length ? done : x.sets, unit) })
  })
  await b.send()
}

export async function saveAsRoutine(a: Active, name: string, unit: Unit) {
  const count = (await pb.collection('routines').getList(1, 1, { filter: pb.filter('user = {:u}', { u: me() }) })).totalItems
  const r = await pb.collection('routines').create<Routine>({ user: me(), name: name.trim() || 'Workout', position: count })
  await syncRoutine(a, r.id, unit)
  return r.id
}
