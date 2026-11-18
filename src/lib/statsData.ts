import { loadExercises } from './exercises'
import { pb, type Exercise, type Workout, type WSet } from './pb'

/** Raw rows behind the Stats page, joined in memory (much lighter than expanding exercise + workout on every set). */
export type StatRow = { set: WSet; ex: Exercise; workoutName: string; durationS: number }

const cache = new Map<string, { at: number; rows: StatRow[] }>()
const FRESH_MS = 60_000

export const cachedStats = (userId: string) => cache.get(userId)?.rows ?? null
export const invalidateStats = (userId?: string) => (userId ? cache.delete(userId) : cache.clear())

export async function loadStatsRows(userId: string, force = false): Promise<StatRow[]> {
  const hit = cache.get(userId)
  if (hit && !force && Date.now() - hit.at < FRESH_MS) return hit.rows
  const filter = pb.filter('user = {:u}', { u: userId })
  const [sets, exercises, workouts] = await Promise.all([
    pb.collection('workout_sets').getFullList<WSet>({
      filter: pb.filter('user = {:u} && completed = true', { u: userId }), sort: 'performed_at', batch: 1000,
      fields: 'exercise,workout,performed_at,weight_kg,reps,seconds,distance_km', requestKey: null,
    }),
    loadExercises(),
    pb.collection('workouts').getFullList<Workout>({ filter, fields: 'id,name,duration_s', batch: 1000, requestKey: null }),
  ])
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const wById = new Map(workouts.map((w) => [w.id, w]))
  const rows: StatRow[] = []
  for (const s of sets) {
    const ex = exById.get(s.exercise)
    if (!ex) continue // e.g. a friend's private custom exercise
    const w = wById.get(s.workout)
    rows.push({ set: s, ex, workoutName: w?.name ?? '', durationS: w?.duration_s ?? 0 })
  }
  cache.set(userId, { at: Date.now(), rows })
  return rows
}
