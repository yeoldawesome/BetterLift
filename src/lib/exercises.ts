import type { RecordModel } from 'pocketbase'
import { me, pb, type Exercise, type Kind, type Override, type WSet } from './pb'

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body', 'cardio']
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other']
export const KINDS: [Kind, string][] = [['weight', 'Weight × reps'], ['bodyweight', 'Bodyweight reps'], ['assisted', 'Assisted'], ['duration', 'Timed'], ['cardio', 'Cardio']]
export function defaultLogTip(kind: Kind, equipment = '') {
  if (kind === 'weight') return equipment === 'dumbbell' ? 'Log the weight of one dumbbell and your reps for each set.' : 'Log the weight and reps for each set.'
  return {
    bodyweight: 'Log reps. Only enter a weight if you add extra load like a vest or belt.',
    assisted: 'Log the assistance weight and reps. Less assistance over time means progress.',
    duration: 'Log how many seconds you held it.',
    cardio: 'Log distance and time.',
  }[kind]
}

/** How often and how recently the current user performed each exercise (for picker filters/sorting). */
export type Usage = Map<string, { count: number; last: number }>
export async function loadUsage(): Promise<Usage> {
  const sets = await pb.collection('workout_sets').getFullList<{ exercise: string; workout: string; performed_at: string } & import('pocketbase').RecordModel>({
    filter: pb.filter('user = {:u} && completed = true', { u: me() }), fields: 'exercise,workout,performed_at', batch: 1000,
  })
  // Count sessions (workouts), not sets, so a 5-set exercise doesn't outrank one done more often.
  const seen = new Set<string>()
  const out: Usage = new Map()
  for (const s of sets) {
    const t = new Date(s.performed_at).getTime()
    const u = out.get(s.exercise) ?? { count: 0, last: 0 }
    if (!seen.has(s.exercise + s.workout)) { seen.add(s.exercise + s.workout); u.count++ }
    u.last = Math.max(u.last, t)
    out.set(s.exercise, u)
  }
  return out
}

export const label =(s: string) => s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())

let cache: Promise<Exercise[]> | null = null
export function loadExercises(force = false) {
  // Moderators can also read others' pending submissions; keep those out of the library and pickers.
  if (force || !cache) cache = Promise.all([
    pb.collection('exercises').getFullList<Exercise>({ sort: 'name' }),
    pb.collection('exercise_overrides').getFullList<Override>({ filter: pb.filter('user = {:u}', { u: me() }) }).catch(() => [] as Override[]),
  ])
    .then(([list, overrides]) => {
      // Personal edits replace the displayed details of an exercise for this user only (tracking type never changes).
      const byEx = new Map(overrides.map((o) => [o.exercise, o]))
      return list.filter((e) => !e.owner || e.owner === me()).map((e) => {
        const o = byEx.get(e.id)
        if (!o) return e
        return { ...e, override: o.id, name: o.name || e.name, muscle: o.muscle || e.muscle, equipment: o.equipment || e.equipment,
          secondary: o.secondary?.length ? o.secondary : e.secondary, instructions: o.instructions || e.instructions, log_tip: o.log_tip || e.log_tip,
          rest_s: o.rest_s, rest_after_s: o.rest_after_s }
      }).sort((a, b) => a.name.localeCompare(b.name))
    })
    .catch((e) => { cache = null; throw e })
  return cache
}
export const resetExercises = () => { cache = null }

/** Order-insensitive name key so "Bench Press (Barbell)" matches "Barbell Bench Press". */
export const nameKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map((w) => w.replace(/s$/, '')).sort().join(' ')

// Common names for the same movement as an official exercise (keys are nameKey() form).
const ALIASES: Record<string, string> = Object.fromEntries(([
  ['Barbell Squat', ['back squat', 'barbell back squat', 'squat barbell', 'high bar squat', 'low bar squat']],
  ['Barbell Deadlift', ['conventional deadlift', 'deadlift conventional']],
  ['Barbell Overhead Press', ['overhead press', 'military press', 'ohp', 'standing overhead press', 'barbell shoulder press', 'standing military press']],
  ['Barbell Row', ['bent over row', 'barbell bent over row', 'bent over barbell row', 'bb row']],
  ['Romanian Deadlift', ['rdl', 'barbell rdl', 'barbell romanian deadlift']],
  ['Skull Crusher', ['lying tricep extension', 'lying triceps extension', 'ez bar skull crusher']],
  ['Stair Climber', ['stair machine', 'stairmaster', 'stair master', 'stepmill']],
  ['Cable Curl', ['cable bicep curl', 'cable biceps curl']],
  ['Dumbbell Curl', ['bicep curl', 'biceps curl', 'dumbbell bicep curl', 'dumbbell biceps curl']],
  ['Lat Pulldown', ['lat pull down', 'cable lat pulldown', 'wide grip lat pulldown']],
  ['Tricep Pushdown', ['triceps pushdown', 'cable tricep pushdown']],
  ['Hip Thrust', ['barbell hip thrust', 'hip thrusts']],
] as [string, string[]][]).flatMap(([official, names]) => names.map((n) => [nameKey(n), official])))

const EQUIP_WORDS = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell']
const PREFERENCE = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'band', 'other']

/**
 * Find the official exercise a name refers to: an alias, or the same words give or take the official exercise's
 * equipment word ("Bench Press" → "Barbell Bench Press"). When several fit, barbell wins, then dumbbell, machine, cable.
 */
export function matchOfficial(name: string, lib: Exercise[]): Exercise | undefined {
  const official = lib.filter((e) => !e.owner)
  const key = nameKey(name)
  const exact = official.find((e) => nameKey(e.name) === key)
  if (exact) return exact
  const alias = ALIASES[key]
  if (alias) return official.find((e) => e.name === alias)
  const toks = new Set(key.split(' '))
  const cands = official.filter((e) => {
    const eq = e.equipment
    if (!EQUIP_WORDS.includes(eq)) return false
    const ot = new Set(nameKey(e.name).split(' '))
    const plusEq = new Set([...toks, eq])
    const minusEq = new Set([...toks].filter((t) => t !== eq))
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((t) => b.has(t))
    return same(plusEq, ot) || (toks.has(eq) && same(minusEq, new Set([...ot].filter((t) => t !== eq))))
  })
  return cands.sort((a, b) => PREFERENCE.indexOf(a.equipment) - PREFERENCE.indexOf(b.equipment))[0]
}

/** Your custom exercises that are really an official exercise under another name. */
export function findDuplicates(lib: Exercise[]): { from: Exercise; to: Exercise }[] {
  return lib.filter((e) => e.owner === me()).flatMap((e) => {
    const to = matchOfficial(e.name, lib)
    return to && to.id !== e.id ? [{ from: e, to }] : []
  })
}

/**
 * Merge exercise `fromId` into `toId` for the current user: moves every logged set and routine entry, re-flags PRs
 * on the combined history, then deletes `fromId` if it's your own custom exercise. Returns the number of sets moved.
 */
export async function mergeExercise(fromId: string, toId: string, onProgress?: (msg: string) => void): Promise<number> {
  const mine = pb.filter('user = {:u} && exercise = {:e}', { u: me(), e: fromId })
  const sets = await pb.collection('workout_sets').getFullList<WSet>({ filter: mine, fields: 'id', batch: 1000 })
  for (let i = 0; i < sets.length; i += 400) {
    onProgress?.(`Moving sets ${i + 1}–${Math.min(i + 400, sets.length)} of ${sets.length}…`)
    const b = pb.createBatch()
    sets.slice(i, i + 400).forEach((s) => b.collection('workout_sets').update(s.id, { exercise: toId }))
    await b.send()
  }
  const rex = await pb.collection('routine_exercises').getFullList<RecordModel>({ filter: mine, fields: 'id' })
  if (rex.length) {
    const b = pb.createBatch()
    rex.forEach((r) => b.collection('routine_exercises').update(r.id, { exercise: toId }))
    await b.send()
  }
  onProgress?.('Recalculating PRs…')
  await recomputePrs(toId)
  const from = await pb.collection('exercises').getOne<Exercise>(fromId).catch(() => null)
  if (from?.owner === me()) await pb.collection('exercises').delete(fromId)
  resetExercises()
  // Let an in-progress workout swap the merged exercise for its replacement.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bl:exercise-merged', { detail: { from: fromId, to: toId } }))
  return sets.length
}

/** Re-flag PRs for one exercise across your whole history (chronological running best) and fix workout PR counts. */
async function recomputePrs(exId: string) {
  const sets = await pb.collection('workout_sets').getFullList<WSet>({
    filter: pb.filter('user = {:u} && exercise = {:e} && completed = true', { u: me(), e: exId }),
    sort: 'performed_at,set_index', fields: 'id,workout,performed_at,e1rm_kg,is_pr', batch: 1000,
  })
  const byWorkout = new Map<string, WSet[]>()
  for (const s of sets) byWorkout.set(s.workout, [...(byWorkout.get(s.workout) ?? []), s])
  let best = 0
  const changes: { id: string; is_pr: boolean }[] = []
  const touched = new Set<string>()
  for (const [wid, ws] of byWorkout) {
    const top = ws.reduce((a, b) => (b.e1rm_kg > a.e1rm_kg ? b : a))
    const prId = top.e1rm_kg > best + 0.01 ? top.id : ''
    if (prId) best = top.e1rm_kg
    for (const s of ws) if (s.is_pr !== (s.id === prId)) { changes.push({ id: s.id, is_pr: s.id === prId }); touched.add(wid) }
  }
  for (let i = 0; i < changes.length; i += 400) {
    const b = pb.createBatch()
    changes.slice(i, i + 400).forEach((c) => b.collection('workout_sets').update(c.id, { is_pr: c.is_pr }))
    await b.send()
  }
  const ids = [...touched]
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const prs = await pb.collection('workout_sets').getFullList<WSet>({ filter: `is_pr = true && (${chunk.map((w) => `workout="${w}"`).join(' || ')})`, fields: 'workout' })
    const b = pb.createBatch()
    chunk.forEach((w) => b.collection('workouts').update(w, { pr_count: prs.filter((p) => p.workout === w).length }))
    await b.send()
  }
}

const has = (n: string, re: RegExp) => re.test(n.toLowerCase())

export function guessKind(name: string): Kind {
  if (has(name, /assist/)) return 'assisted'
  if (has(name, /plank|hold|wall sit|dead hang|l-sit/)) return 'duration'
  if (has(name, /run|treadmill|bike|cycl|elliptical|walk|swim|stair|rowing machine|erg|jog|hike/)) return 'cardio'
  if (has(name, /push.?up|pull.?up|chin.?up|\bdips?\b|crunch|sit.?up|burpee|leg raise|muscle.?up|air squat|mountain climber/) && !has(name, /weighted/)) return 'bodyweight'
  return 'weight'
}

export function guessMuscle(name: string): string {
  const rules: [RegExp, string][] = [
    [/bench|chest|fly|pec|push.?up|dip/, 'chest'], [/curl(?!.*leg)|bicep|hammer/, 'biceps'], [/tricep|pushdown|skull|kickback(?!.*cable glute)/, 'triceps'],
    [/squat|leg press|lunge|extension.*leg|leg extension|quad/, 'quads'], [/leg curl|hamstring|romanian|rdl|good morning/, 'hamstrings'],
    [/hip thrust|glute|abduct/, 'glutes'], [/calf/, 'calves'], [/press|raise|delt|shoulder|face pull/, 'shoulders'],
    [/row|pull|lat|deadlift|shrug|back/, 'back'], [/crunch|plank|ab |abs|core|twist|leg raise/, 'core'], [/wrist|forearm|grip|carry/, 'forearms'],
    [/run|bike|cycl|treadmill|elliptical|stair|walk|swim|rowing machine/, 'cardio'],
  ]
  return rules.find(([re]) => has(name, re))?.[1] ?? 'full_body'
}

export function guessEquipment(name: string): string {
  const rules: [RegExp, string][] = [[/barbell|ez.?bar|\bbar\b/, 'barbell'], [/dumbbell|\bdb\b/, 'dumbbell'], [/cable|pulldown|pushdown/, 'cable'],
    [/machine|smith|press machine|leg press|pec deck/, 'machine'], [/kettlebell|\bkb\b/, 'kettlebell'], [/band/, 'band']]
  return rules.find(([re]) => has(name, re))?.[1] ?? (guessKind(name) === 'bodyweight' ? 'bodyweight' : 'other')
}

/** Save a lift's own rest defaults (personal; stored on the user's override). 0 = use account default, -1 = off. */
export async function saveLiftRest(ex: Exercise, patch: { rest_s?: number; rest_after_s?: number }) {
  if (ex.override) await pb.collection('exercise_overrides').update(ex.override, patch)
  else await pb.collection('exercise_overrides').create({ user: me(), exercise: ex.id, ...patch })
  resetExercises()
}
