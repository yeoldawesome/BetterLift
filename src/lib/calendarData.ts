import { useEffect, useState } from 'react'
import { loadExercises } from './exercises'
import { idbGet, idbSet } from './idb'
import { me, pb, type Exercise, type Workout } from './pb'

/**
 * Data behind the Calendar: every workout, plus which exercises each one had (for the mini body graphs).
 * Kept in memory and on the device (IndexedDB), so the Calendar opens instantly from the last copy and refreshes
 * quietly behind it. The app also pre-loads it shortly after launch (prefetchCalendar).
 */
export type CalWorkout = Pick<Workout, 'id' | 'name' | 'started_at' | 'duration_s' | 'accent' | 'pr_count'>
export type CalData = { workouts: CalWorkout[]; exercisesOf: Map<string, Exercise[]> }

type Packed = { v: 1; ws: CalWorkout[]; wx: [workout: string, exerciseIds: string[]][] }
const key = (u: string) => `calendar:${u}`
const mem = new Map<string, { at: number; packed: Packed }>()
const inflight = new Map<string, Promise<Packed>>()
const FRESH_MS = 60_000

/** Something changed (a workout finished, edited or deleted): the next open refetches. */
export const invalidateCalendar = () => mem.forEach((v) => { v.at = 0 })

async function fetchPacked(u: string): Promise<Packed> {
  const [ws, sets] = await Promise.all([
    pb.collection('workouts').getFullList<CalWorkout>({ filter: pb.filter('user = {:u}', { u }), sort: 'started_at', fields: 'id,name,started_at,duration_s,accent,pr_count', batch: 1000, requestKey: null }),
    // Just which exercise each set was (the exercise details come from the on-device library): far lighter than expanding.
    pb.collection('workout_sets').getFullList<{ workout: string; exercise: string }>({ filter: pb.filter('user = {:u} && completed = true', { u }), fields: 'workout,exercise', batch: 5000, requestKey: null }),
  ])
  const by = new Map<string, string[]>()
  for (const s of sets) by.set(s.workout, [...(by.get(s.workout) ?? []), s.exercise])
  const packed: Packed = { v: 1, ws, wx: [...by] }
  mem.set(u, { at: Date.now(), packed })
  idbSet(key(u), packed)
  return packed
}

function refresh(u: string) {
  const running = inflight.get(u)
  if (running) return running
  const p = fetchPacked(u).finally(() => inflight.delete(u))
  inflight.set(u, p)
  return p
}

async function unpack(p: Packed): Promise<CalData> {
  const lib = new Map((await loadExercises().catch(() => [] as Exercise[])).map((e) => [e.id, e]))
  const exercisesOf = new Map<string, Exercise[]>()
  for (const [w, ids] of p.wx) exercisesOf.set(w, ids.map((id) => lib.get(id)).filter(Boolean) as Exercise[])
  return { workouts: p.ws, exercisesOf }
}

/** The last copy we have (memory, then device), without waiting on the network. */
async function cached(u: string): Promise<Packed | null> {
  const m = mem.get(u)
  if (m) return m.packed
  const p = await idbGet<Packed>(key(u))
  if (!p || p.v !== 1) return null
  if (!mem.has(u)) mem.set(u, { at: 0, packed: p }) // at 0 = stale: still refresh
  return p
}

/** Warm everything up in the background: the Calendar screen's code and its data. */
export function prefetchCalendar() {
  const u = me()
  if (!u) return
  import('../screens/Calendar').catch(() => {})
  const m = mem.get(u)
  if (!m || Date.now() - m.at > FRESH_MS) refresh(u).catch(() => {})
}

/** Calendar data: shows the saved copy at once, then the fresh one when it arrives. null while there's nothing yet. */
export function useCalendarData(): CalData | null {
  const [data, setData] = useState<CalData | null>(null)
  useEffect(() => {
    const u = me()
    let live = true
    let shown = false
    cached(u).then(async (p) => { if (p && live && !shown) { const d = await unpack(p); if (live && !shown) setData(d) } })
    const m = mem.get(u)
    const fresh = m && Date.now() - m.at < FRESH_MS
    ;(fresh ? Promise.resolve(m!.packed) : refresh(u))
      .then(async (p) => { const d = await unpack(p); if (live) { shown = true; setData(d) } })
      .catch(() => { if (live) setData((d) => d ?? { workouts: [], exercisesOf: new Map() }) })
    return () => { live = false }
  }, [])
  return data
}
