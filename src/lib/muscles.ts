import type { Exercise } from './pb'

/** Back and shoulder muscles are tracked individually; rear delts belong to both (shoulder muscle, trained on back day). */
export const BACK_MUSCLES = ['lats', 'traps', 'upper_back', 'lower_back'] as const
export const DELT_MUSCLES = ['front_delts', 'side_delts', 'rear_delts'] as const

/** Muscle groups drawn on the body graph. */
export const MAP_MUSCLES = ['chest', ...BACK_MUSCLES, ...DELT_MUSCLES, 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'core'] as const
export type MapMuscle = (typeof MAP_MUSCLES)[number]
/** Per-muscle 0..1, plus `cardio` for the heart drawn behind the chest (not a muscle group, so not in MAP_MUSCLES). */
export type Intensity = Partial<Record<MapMuscle | 'cardio', number>>

/** Everything an exercise can be filed under (pickers). */
export const MUSCLES: string[] = [...MAP_MUSCLES, 'full_body', 'cardio']
/** Older whole-group values some custom exercises still carry; they spread across the group's muscles. */
const LEGACY: Record<string, [MapMuscle, number][]> = {
  back: [['lats', 1], ['upper_back', 0.8], ['traps', 0.5], ['lower_back', 0.4]],
  shoulders: [['front_delts', 1], ['side_delts', 0.8], ['rear_delts', 0.6]],
}
/** Filter groups: "Back" lists every back muscle plus rear delts, "Shoulders" every delt. */
export const MUSCLE_GROUPS: Record<string, string[]> = {
  back: [...BACK_MUSCLES, 'rear_delts', 'back'],
  shoulders: [...DELT_MUSCLES, 'shoulders'],
}
/** Top-level filter chips: groups instead of their individual muscles. */
export const FILTER_MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'core', 'full_body', 'cardio']
/** The group a muscle rolls up to (lats → back, side delts → shoulders); anything else is its own group. */
export const muscleGroup = (m: string) => (DELT_MUSCLES as readonly string[]).includes(m) || m === 'shoulders' ? 'shoulders' : MUSCLE_GROUPS.back.includes(m) ? 'back' : m
const matchOne = (m: string, filter: string) => m === filter || (MUSCLE_GROUPS[filter]?.includes(m) ?? false)
/** A muscle filter ("back", "lats", "chest") matches either of an exercise's primary muscles. */
export const matchesMuscle = (ex: { muscle: string; muscle2?: string }, filter: string) =>
  !filter || matchOne(ex.muscle, filter) || (!!ex.muscle2 && matchOne(ex.muscle2, filter))
/** "Chest" or "Chest · Front delts" for an exercise with two primary muscles. */
export const primaryLabel = (ex: { muscle: string; muscle2?: string }, label: (s: string) => string) =>
  [ex.muscle, ex.muscle2].filter(Boolean).map((m) => label(m!)).join(' · ')

/** Primary-muscle picker options; keeps a legacy value selectable if the exercise still has one. */
export const primaryOptions = (cur: string | undefined, label: (s: string) => string): [string, string][] =>
  [...MUSCLES, ...(cur && LEGACY[cur] ? [cur] : [])].map((m) => [m, label(m)])
/** Second primary muscle picker: optional, any body-graph muscle but the first primary. */
export const secondPrimaryOptions = (primary: string, cur: string | undefined, label: (s: string) => string): [string, string][] =>
  [['', 'None'], ...[...MAP_MUSCLES.filter((m) => m !== primary), ...(cur && LEGACY[cur] ? [cur] : [])].map((m): [string, string] => [m, label(m)])]
/** Secondary-muscle chips: every muscle but the primaries, plus any legacy value already ticked (so it can be cleared). */
export const secondaryOptions = (primaries: string[], cur: string[] = []) =>
  [...MAP_MUSCLES.filter((m) => !primaries.includes(m)), ...cur.filter((m) => LEGACY[m])]
/** Tidy before saving: no second primary for full body / cardio or repeating the first; secondary without the primaries. */
export const cleanMuscles = (muscle: string, muscle2: string, sec: string[] = []) => {
  const m2 = muscle2 && muscle2 !== muscle && muscle !== 'full_body' && muscle !== 'cardio' ? muscle2 : ''
  return { muscle, muscle2: m2, secondary: [...new Set(sec)].filter((m) => m !== muscle && m !== m2) }
}

/** Heart strength from a number of cardio sets: any cardio shows clearly, more fills it in. */
export const cardioIntensity = (sets: number) => (sets > 0 ? Math.min(1, 0.6 + 0.2 * (sets - 1)) : 0)

const isMap = (m: string): m is MapMuscle => (MAP_MUSCLES as readonly string[]).includes(m)
/** The map muscles a muscle value covers, with weights (legacy "back" spreads over the back). */
const spread = (m: string): [MapMuscle, number][] => (isMap(m) ? [[m, 1]] : LEGACY[m] ?? [])
const LEGS = ['quads', 'hamstrings', 'calves', 'glutes'] as const

type Ex = Pick<Exercise, 'muscle' | 'secondary'> & { muscle2?: string; kind?: Exercise['kind'] }
/** Lights the heart: exercises filed under the Cardio muscle group, or logged as the Cardio type (runs, bike, rower…). */
export const isCardioEx = (ex: Ex) => ex.muscle === 'cardio' || ex.kind === 'cardio'

/** Weighted work per muscle for one set: each primary 1, secondary 0.5; "full body" spreads 0.4 everywhere; cardio leans on legs. */
function work(ex: Ex, add: (m: MapMuscle, v: number) => void) {
  if (ex.muscle === 'full_body') MAP_MUSCLES.forEach((m) => add(m, 0.4))
  else if (ex.muscle === 'cardio') LEGS.forEach((m) => add(m, 0.5))
  else for (const [m, w] of spread(ex.muscle)) add(m, w)
  if (ex.muscle2) for (const [m, w] of spread(ex.muscle2)) add(m, w)
  for (const s of ex.secondary ?? []) for (const [m, w] of spread(s)) add(m, 0.5 * w)
}

/** Per-muscle intensity 0..1 from a list of performed sets (one entry per set). */
export function intensityFromSets(sets: { ex?: Ex }[]): Intensity {
  const raw: Record<string, number> = {}
  let cardio = 0
  for (const { ex } of sets) {
    if (!ex) continue
    if (isCardioEx(ex)) cardio++
    work(ex, (m, v) => { raw[m] = (raw[m] ?? 0) + v })
  }
  const max = Math.max(0, ...Object.values(raw))
  const out: Intensity = {}
  if (max > 0) for (const [m, v] of Object.entries(raw)) out[m as MapMuscle] = v / max
  if (cardio) out.cardio = cardioIntensity(cardio)
  return out
}

/** Weighted set count per muscle (primary 1, secondary 0.5) — the un-normalised numbers behind the body graph. */
export function muscleSetCounts(sets: { ex?: Ex }[]): Record<MapMuscle, number> {
  const out = Object.fromEntries(MAP_MUSCLES.map((m) => [m, 0])) as Record<MapMuscle, number>
  for (const { ex } of sets) if (ex) work(ex, (m, v) => { out[m] += v })
  return out
}

/** Highlight for a single exercise (info sheet): primaries full, secondary half. */
export function intensityForExercise(ex: Ex): Intensity {
  const out: Intensity = {}
  if (isCardioEx(ex)) out.cardio = 1
  if (ex.muscle === 'full_body') MAP_MUSCLES.forEach((m) => { out[m] = 0.6 })
  else if (ex.muscle === 'cardio') LEGS.forEach((m) => { out[m] = 0.6 })
  else for (const [m, w] of spread(ex.muscle)) out[m] = w
  if (ex.muscle2) for (const [m, w] of spread(ex.muscle2)) out[m] = Math.max(out[m] ?? 0, w)
  for (const s of ex.secondary ?? []) for (const [m, w] of spread(s)) if (!out[m]) out[m] = 0.45 * w
  return out
}
