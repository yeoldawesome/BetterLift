import type { Exercise } from './pb'

/** Muscle groups drawn on the body graph. */
export const MAP_MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'core'] as const
export type MapMuscle = (typeof MAP_MUSCLES)[number]
export type Intensity = Partial<Record<MapMuscle, number>>

const isMap = (m: string): m is MapMuscle => (MAP_MUSCLES as readonly string[]).includes(m)

/**
 * Per-muscle intensity 0..1 from a list of performed sets (one entry per set).
 * Primary muscle counts 1 per set, secondary 0.5; "full body" spreads 0.4 everywhere; cardio leans on legs.
 */
export function intensityFromSets(sets: { ex?: Pick<Exercise, 'muscle' | 'secondary'> }[]): Intensity {
  const raw: Record<string, number> = {}
  const add = (m: string, v: number) => { if (isMap(m)) raw[m] = (raw[m] ?? 0) + v }
  for (const { ex } of sets) {
    if (!ex) continue
    if (ex.muscle === 'full_body') MAP_MUSCLES.forEach((m) => add(m, 0.4))
    else if (ex.muscle === 'cardio') ['quads', 'hamstrings', 'calves', 'glutes'].forEach((m) => add(m, 0.5))
    else add(ex.muscle, 1)
    for (const s of ex.secondary ?? []) add(s, 0.5)
  }
  const max = Math.max(0, ...Object.values(raw))
  const out: Intensity = {}
  if (max > 0) for (const [m, v] of Object.entries(raw)) out[m as MapMuscle] = v / max
  return out
}

/** Weighted set count per muscle (primary 1, secondary 0.5) — the un-normalised numbers behind the body graph. */
export function muscleSetCounts(sets: { ex?: Pick<Exercise, 'muscle' | 'secondary'> }[]): Record<MapMuscle, number> {
  const out = Object.fromEntries(MAP_MUSCLES.map((m) => [m, 0])) as Record<MapMuscle, number>
  for (const { ex } of sets) {
    if (!ex) continue
    if (ex.muscle === 'full_body') MAP_MUSCLES.forEach((m) => { out[m] += 0.4 })
    else if (ex.muscle === 'cardio') (['quads', 'hamstrings', 'calves', 'glutes'] as const).forEach((m) => { out[m] += 0.5 })
    else if (isMap(ex.muscle)) out[ex.muscle] += 1
    for (const s of ex.secondary ?? []) if (isMap(s)) out[s] += 0.5
  }
  return out
}

/** Highlight for a single exercise (info sheet): primary full, secondary half. */
export function intensityForExercise(ex: Pick<Exercise, 'muscle' | 'secondary'>): Intensity {
  const out: Intensity = {}
  if (ex.muscle === 'full_body') MAP_MUSCLES.forEach((m) => { out[m] = 0.6 })
  else if (ex.muscle === 'cardio') (['quads', 'hamstrings', 'calves', 'glutes'] as const).forEach((m) => { out[m] = 0.6 })
  else if (isMap(ex.muscle)) out[ex.muscle] = 1
  for (const s of ex.secondary ?? []) if (isMap(s) && !out[s]) out[s] = 0.45
  return out
}
