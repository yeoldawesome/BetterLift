import type { RecordModel } from 'pocketbase'
import { idbDel, idbGet, idbSet } from './idb'
import { loadStatsRows, warmStats } from './statsData'
import { me, pb, type Exercise, type Kind, type Override, type WSet } from './pb'

export { MUSCLES } from './muscles'
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
export function usageFrom(rows: { set: Pick<WSet, 'exercise' | 'workout' | 'performed_at'> }[]): Usage {
  // Count sessions (workouts), not sets, so a 5-set exercise doesn't outrank one done more often.
  const seen = new Set<string>()
  const out: Usage = new Map()
  for (const { set: s } of rows) {
    const t = new Date(s.performed_at).getTime()
    const u = out.get(s.exercise) ?? { count: 0, last: 0 }
    if (!seen.has(s.exercise + s.workout)) { seen.add(s.exercise + s.workout); u.count++ }
    u.last = Math.max(u.last, t)
    out.set(s.exercise, u)
  }
  return out
}
const usageKey = () => `bl.usage:${me()}`
/** Small synchronous copy of the usage map, so the picker's Most performed / Recent lists show instantly. */
export function quickUsage(): Usage | null {
  try {
    const raw = JSON.parse(localStorage.getItem(usageKey()) || 'null') as [string, number, number][] | null
    return Array.isArray(raw) ? new Map(raw.map(([id, count, last]) => [id, { count, last }])) : null
  } catch { return null }
}
function keepUsage(u: Usage) {
  try { localStorage.setItem(usageKey(), JSON.stringify([...u].map(([id, v]) => [id, v.count, v.last]))) } catch { /* full / private */ }
  return u
}
/** Shares the Stats data (and its on-device cache), so the picker and Stats page never download sets twice. */
export async function loadUsage(force = false): Promise<Usage> {
  return keepUsage(usageFrom(await loadStatsRows(me(), force)))
}
/** Usage from data already on this device, or null. */
export async function cachedUsage(): Promise<Usage | null> {
  const rows = await warmStats(me())
  return rows ? keepUsage(usageFrom(rows)) : null
}
/** Fast first guess from the latest sets only (one small request), for when nothing is on the device yet. */
export async function recentUsage(): Promise<Usage> {
  const r = await pb.collection('workout_sets').getList<WSet>(1, 1000, {
    filter: pb.filter('user = {:u} && completed = true', { u: me() }), sort: '-performed_at', fields: 'exercise,workout,performed_at', skipTotal: true, requestKey: null,
  })
  return usageFrom(r.items.map((set) => ({ set })))
}

export const label =(s: string) => s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())

let cache: Promise<Exercise[]> | null = null
let latest: Promise<Exercise[]> | null = null
const exKey = () => `exercises:${me()}`

function fetchExercises() {
  // Moderators can also read others' pending submissions; keep those out of the library and pickers.
  return Promise.all([
    pb.collection('exercises').getFullList<Exercise>({ sort: 'name', batch: 1000, requestKey: null }),
    pb.collection('exercise_overrides').getFullList<Override>({ filter: pb.filter('user = {:u}', { u: me() }), requestKey: null }).catch(() => [] as Override[]),
  ])
    .then(([list, overrides]) => {
      // Personal edits replace the displayed details of an exercise for this user only (tracking type never changes).
      const byEx = new Map(overrides.map((o) => [o.exercise, o]))
      const out = list.filter((e) => !e.owner || e.owner === me()).map((e) => {
        const o = byEx.get(e.id)
        if (!o) return e
        // A personal muscle choice replaces primary + secondary; otherwise the official ones (and later fixes to them) apply.
        const mine = !!o.muscle
        return { ...e, override: o.id, name: o.name || e.name, equipment: o.equipment || e.equipment,
          muscle: mine ? o.muscle : e.muscle, primaries: mine ? o.primaries ?? [] : e.primaries, secondary: mine ? o.secondary ?? [] : e.secondary,
          official: { muscle: e.muscle, primaries: e.primaries, secondary: e.secondary }, instructions: o.instructions || e.instructions, log_tip: o.log_tip || e.log_tip,
          rest_s: o.rest_s, rest_after_s: o.rest_after_s }
      }).sort((a, b) => a.name.localeCompare(b.name))
      idbSet(exKey(), out)
      return out
    })
}

/** The exercise library. Without `force`, the copy saved on this device is returned instantly while a fresh one loads. */
export function loadExercises(force = false) {
  if (force || !cache) {
    const net = fetchExercises()
    latest = net
    net.then((l) => { if (latest === net) { cache = Promise.resolve(l); mem = l } }, () => {})
    if (force) cache = net.catch((e) => { cache = null; throw e })
    else cache = idbGet<Exercise[]>(exKey()).then((saved) => (saved?.length ? saved : net)).catch((e) => { cache = null; throw e })
    cache.then((l) => { mem = l }, () => {})
  }
  return cache
}
let mem: Exercise[] | null = null
/** The library already in memory this session (synchronous), or null. */
export const cachedExercises = () => (cache ? mem : null)
/** The most recent server load of the library (resolves after loadExercises' instant on-device copy). */
export const freshExercises = () => latest ?? loadExercises(true)
/** Drop the library after an edit so the next load comes from the server (not the on-device copy). */
export const resetExercises = () => { cache = null; latest = null; mem = null; idbDel(exKey()) }

/** Order-insensitive name key so "Bench Press (Barbell)" matches "Barbell Bench Press". */
export const nameKey = (s: string) =>
  s.toLowerCase()
    // Spelling variants that mean the same thing ("One Arm" = "Single-Arm", "Pullups" = "Pull-Ups", "Kettle bell" = "Kettlebell").
    .replace(/\b(one|1|single)[\s-]*arm(ed)?\b/g, 'single arm')
    .replace(/\b(pull|chin|push|sit)[\s-]?ups?\b/g, '$1 up')
    .replace(/\bkettle\s+bells?\b/g, 'kettlebell').replace(/\bdb\b/g, 'dumbbell').replace(/\bbb\b/g, 'barbell')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map((w) => w.replace(/s$/, '')).filter(Boolean).sort().join(' ')

/** Other names people use for an official exercise, shown in grey under its name and matched by search and imports. */
export const AKA: Record<string, string[]> = {
  'Machine Chest Fly': ['Pec Deck', 'Butterfly', 'Pec Fly'],
  'Machine Chest Press': ['Chest Press', 'Seated Chest Press'],
  'Barbell Bench Press': ['Bench Press', 'Flat Bench'],
  'Incline Barbell Bench Press': ['Incline Bench Press'],
  'Decline Barbell Bench Press': ['Decline Bench Press'],
  'Iso-Lateral Chest Press': ['Hammer Strength Chest Press', 'Iso-Lateral Bench Press'],
  'Incline Machine Chest Press': ['Incline Chest Press'],
  'Cable Fly': ['Cable Crossover'],
  'Dip': ['Parallel Bar Dip', 'Chest Dip'],
  'Push-Up': ['Pushup', 'Press-Up'],
  'Barbell Squat': ['Back Squat', 'Squat'],
  'Barbell Deadlift': ['Deadlift', 'Conventional Deadlift'],
  'Romanian Deadlift': ['RDL'],
  'Barbell Overhead Press': ['Overhead Press', 'OHP', 'Military Press'],
  'Barbell Row': ['Bent-Over Row'],
  'Iso-Lateral Row': ['Hammer Strength Row'],
  'Smith Machine Row': ['Smith Machine Bent-Over Row'],
  'Lat Pulldown': ['Pulldown'],
  'Straight-Arm Pulldown': ['Straight-Arm Lat Pulldown'],
  'Pull-Up': ['Pullup'],
  'Chin-Up': ['Chinup'],
  'Back Extension': ['Hyperextension'],
  'Reverse Pec Deck': ['Machine Reverse Fly', 'Rear Delt Machine'],
  'Seated Smith Machine Shoulder Press': ['Smith Machine Shoulder Press'],
  'Dumbbell Curl': ['Bicep Curl'],
  'Cable Curl': ['Cable Bicep Curl'],
  'Barbell Curl': ['Strict Curl'],
  'Skull Crusher': ['Lying Tricep Extension'],
  'Overhead Tricep Extension': ['Cable Overhead Tricep Extension'],
  'Dumbbell Overhead Tricep Extension': ['Tricep Extension', 'French Press'],
  'Tricep Rope Pushdown': ['Rope Pushdown'],
  'Machine Seated Dip': ['Dip Machine', 'Seated Dip'],
  "Farmer's Carry": ["Farmer's Walk"],
  'Leg Press': ['Sled Leg Press', '45° Leg Press'],
  'Seated Leg Press': ['Horizontal Leg Press'],
  'Leg Press Calf Raise': ['Calf Press', 'Machine Calf Press'],
  'Bulgarian Split Squat': ['Rear-Foot-Elevated Split Squat'],
  'Hip Thrust': ['Barbell Hip Thrust'],
  'Hip Adduction': ['Adductor Machine', 'Inner Thigh Machine'],
  'Hip Abduction': ['Abductor Machine', 'Outer Thigh Machine'],
  'Machine Glute Kickback': ['Glute Kickback'],
  'Glute-Ham Raise': ['GHR'],
  'Machine Crunch': ['Ab Crunch Machine'],
  "Captain's Chair Leg Raise": ['Vertical Knee Raise'],
  'Hanging Knee Raise': ['Knee Raise'],
  'Kettlebell Swing': ['KB Swing'],
  'Stair Climber': ['Stair Machine', 'StairMaster'],
  'Rowing Machine': ['Rower', 'Erg'],
  'Cycling': ['Stationary Bike'],
  'Walking': ['Walk'],
  'Running': ['Run', 'Jog'],
}
/** Alternative names for an exercise (empty for customs or ones without any). */
export const altNames = (name: string) => AKA[name] ?? []

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
  // Machines and cables under the names gyms and other apps (Liftoff, Hevy, Strong) use.
  ['Machine Chest Fly', ['pec deck', 'machine fly', 'pec fly', 'butterfly', 'chest fly machine', 'pec deck fly']],
  ['Machine Chest Press', ['chest press', 'seated chest press', 'chest press machine', 'machine bench press']],
  ['Incline Machine Chest Press', ['incline machine bench press', 'incline chest press', 'incline chest press machine', 'machine incline chest press']],
  ['Iso-Lateral Chest Press', ['iso lateral bench press', 'hammer strength chest press', 'iso lateral flat chest press']],
  ['Cable Fly', ['cable crossover', 'cable chest fly', 'standing cable fly']],
  ['Reverse Pec Deck', ['machine reverse fly', 'reverse fly machine', 'rear delt machine', 'rear delt fly machine', 'machine rear delt fly']],
  ['Dumbbell Reverse Fly', ['rear delt fly', 'bent over reverse fly', 'dumbbell rear delt fly', 'bent over dumbbell reverse fly']],
  ['Cable Reverse Fly', ['cable rear delt fly']],
  ['Smith Machine Row', ['smith machine bent over row']],
  ['Seated Smith Machine Shoulder Press', ['smith machine shoulder press', 'smith machine overhead press']],
  ['Machine Seated Dip', ['machine dip', 'dip machine', 'assisted dip machine', 'tricep dip machine']],
  ['Dumbbell Overhead Tricep Extension', ['tricep extension', 'overhead dumbbell extension', 'dumbbell tricep extension', 'seated dumbbell tricep extension']],
  ['Overhead Tricep Extension', ['cable overhead extension', 'rope overhead tricep extension']],
  ['Tricep Rope Pushdown', ['rope pushdown', 'rope tricep pushdown', 'triceps rope pushdown']],
  ['Barbell Curl', ['strict curl', 'barbell strict curl', 'standing barbell curl']],
  ['Cable Hammer Curl', ['rope hammer curl']],
  ['Leg Press', ['sled leg press', '45 degree leg press', 'incline leg press']],
  ['Seated Leg Press', ['horizontal leg press']],
  ['Leg Press Calf Raise', ['machine calf press', 'calf press', 'sled press calf raise', 'calf press on leg press', 'leg press calf press']],
  ['Standing Calf Raise', ['calf raise', 'machine standing calf raise']],
  ['Machine Crunch', ['machine seated crunch', 'ab crunch machine', 'seated crunch machine']],
  ['Captain\'s Chair Leg Raise', ['vertical knee raise', 'captains chair knee raise']],
  ['Hip Adduction', ['adductor machine', 'inner thigh machine']],
  ['Hip Abduction', ['abductor machine', 'outer thigh machine']],
  ['Back Extension', ['hyperextension', '45 degree back extension']],
  ['Hanging Knee Raise', ['knee raise']],
  ['Hand Gripper', ['grip trainer', 'hand grip']],
  ['Walking', ['walk', 'outdoor walk', 'incline walk']],
  ['Running', ['run', 'outdoor run', 'jog', 'jogging']],
  ['Cycling', ['bike', 'stationary bike', 'spin bike']],
] as [string, string[]][]).concat(Object.entries(AKA)).flatMap(([official, names]) => names.map((n) => [nameKey(n), official])))

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
  // Most specific first: "reverse fly" is shoulders not chest, "close grip bench" is triceps, "calf press" is calves, etc.
  const rules: [RegExp, string][] = [
    [/run|jog|bike|cycl|treadmill|elliptical|stair|walk|swim|rowing machine|erg|hike|sprint|basketball|soccer|tennis|jump(ing)? (rope|jack)/, 'cardio'],
    [/calf|calves/, 'calves'], [/wrist|forearm|grip|carry|reverse (ez.?bar |barbell |cable )?curl|dead hang/, 'forearms'],
    [/reverse fly|rear delt|face pull|reverse pec|y.?raise/, 'rear_delts'], [/lateral raise|side raise|upright row/, 'side_delts'], [/front raise/, 'front_delts'],
    [/close.?grip (incline )?bench|jm press|tricep|pushdown|skull|kickback(?!.*glute)|\bdip/, 'triceps'],
    [/adduct|inner thigh|copenhagen/, 'adductors'], [/leg curl|hamstring|romanian|rdl|stiff.?leg|good morning|nordic/, 'hamstrings'],
    [/hip thrust|glute|abduct|bridge|pull.?through|kettlebell swing|kb swing/, 'glutes'],
    [/squat|leg press|lunge|split|step.?up|leg extension|quad|sissy/, 'quads'],
    [/curl|bicep/, 'biceps'],
    [/crunch|plank|sit.?up|\babs?\b|core|twist|rotation|woodchop|pallof|leg raise|knee raise|hollow|dead bug|v.?up/, 'core'],
    [/wide.?grip.*row|chest.?supported|seal row|\bt.?bar|inverted row|pendlay/, 'upper_back'],
    [/bench|chest|fly|pec|push.?up|incline press|decline press/, 'chest'],
    [/shrug/, 'traps'], [/back extension|hyperextension|superman|deadlift|rack pull/, 'lower_back'],
    [/row|pull|lat\b|pulldown/, 'lats'],
    [/shoulder|overhead press|military|arnold|delt|\bpress\b/, 'front_delts'],
    [/clean|snatch|jerk|thruster|burpee|swing|get.?up|sled/, 'full_body'],
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
