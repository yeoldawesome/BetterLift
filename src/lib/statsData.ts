import { useEffect, useState } from 'react'
import { freshExercises, loadExercises } from './exercises'
import { idbGet, idbSet } from './idb'
import { invalidateCalendar } from './calendarData'
import { pb, type Exercise, type Workout, type WSet } from './pb'

/** Raw rows behind the Stats page, joined in memory (much lighter than expanding exercise + workout on every set). */
export type StatRow = { set: WSet; ex: Exercise; workoutName: string; durationS: number }

const cache = new Map<string, { at: number; rows: StatRow[] }>()
const inflight = new Map<string, Promise<StatRow[]>>()
const FRESH_MS = 60_000

export const cachedStats = (userId: string) => cache.get(userId)?.rows ?? null
// Workouts changed (finished, edited, deleted, imported…): Stats and the Calendar both refetch on next open.
export const invalidateStats = (userId?: string) => { invalidateCalendar(); return userId ? cache.delete(userId) : cache.clear() }

// On-device copy (IndexedDB) so Stats, Insights and the exercise picker render instantly on the next app open.
type Packed = { v: 1; sets: [exercise: string, workout: string, at: string, kg: number, reps: number, sec: number, km: number][]; workouts: [id: string, name: string, dur: number][] }
const key = (userId: string) => `stats:${userId}`

function join(sets: WSet[], workouts: Pick<Workout, 'id' | 'name' | 'duration_s'>[], exercises: Exercise[]): StatRow[] {
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const wById = new Map(workouts.map((w) => [w.id, w]))
  const rows: StatRow[] = []
  for (const s of sets) {
    const ex = exById.get(s.exercise)
    if (!ex) continue // e.g. a friend's private custom exercise
    const w = wById.get(s.workout)
    rows.push({ set: s, ex, workoutName: w?.name ?? '', durationS: w?.duration_s ?? 0 })
  }
  return rows
}

/** Rows saved on this device from the last load (possibly stale), or null. Never hits the network for sets. */
export async function warmStats(userId: string): Promise<StatRow[] | null> {
  const mem = cachedStats(userId)
  if (mem) return mem
  const p = await idbGet<Packed>(key(userId))
  if (!p || p.v !== 1) return null
  const sets = p.sets.map(([exercise, workout, performed_at, weight_kg, reps, seconds, distance_km]) =>
    ({ exercise, workout, performed_at, weight_kg, reps, seconds, distance_km } as WSet))
  const rows = join(sets, p.workouts.map(([id, name, duration_s]) => ({ id, name, duration_s })), await loadExercises().catch(() => []))
  if (!cache.has(userId)) cache.set(userId, { at: 0, rows }) // at 0 = stale, so the next load still refreshes
  return rows
}

export function loadStatsRows(userId: string, force = false): Promise<StatRow[]> {
  const hit = cache.get(userId)
  if (hit && !force && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.rows)
  const running = inflight.get(userId)
  if (running) return running
  const p = (async () => {
    const [sets, exercises, workouts] = await Promise.all([
      pb.collection('workout_sets').getFullList<WSet>({
        filter: pb.filter('user = {:u} && completed = true', { u: userId }), sort: 'performed_at', batch: 1000,
        fields: 'exercise,workout,performed_at,weight_kg,reps,seconds,distance_km', requestKey: null,
      }),
      // The server copy of the library (not the instant on-device one), so muscle/name fixes show up; on-device copy when offline.
      freshExercises().catch(() => loadExercises()),
      pb.collection('workouts').getFullList<Workout>({ filter: pb.filter('user = {:u}', { u: userId }), fields: 'id,name,duration_s', batch: 1000, requestKey: null }),
    ])
    const rows = join(sets, workouts, exercises)
    cache.set(userId, { at: Date.now(), rows })
    const packed: Packed = {
      v: 1,
      sets: sets.map((s) => [s.exercise, s.workout, s.performed_at, s.weight_kg || 0, s.reps || 0, s.seconds || 0, s.distance_km || 0]),
      workouts: workouts.map((w) => [w.id, w.name, w.duration_s || 0]),
    }
    idbSet(key(userId), packed)
    return rows
  })().finally(() => inflight.delete(userId))
  inflight.set(userId, p)
  return p
}

/** Stats rows for a user: on-device copy first (instant), then refreshed from the server. */
export function useStatsRows(userId: string) {
  const [rows, setRows] = useState<StatRow[] | null>(() => cachedStats(userId))
  useEffect(() => {
    let live = true, fresh = false
    setRows(cachedStats(userId))
    warmStats(userId).then((r) => { if (live && r && !fresh) setRows(r) })
    loadStatsRows(userId).then((r) => { fresh = true; if (live) setRows(r) }).catch(() => { if (live) setRows((r) => r ?? []) })
    return () => { live = false }
  }, [userId])
  return rows
}
