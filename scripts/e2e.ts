// Frontend-logic end-to-end test against a running PocketBase. Run: npm run test:e2e
import { emptySet, finishWorkout, makeEx, prevFor, routineExercises, saveAsRoutine, syncRoutine, type Active } from '../src/lib/active'
import { findDuplicates, loadExercises, loadUsage, matchOfficial, mergeExercise, nameKey, saveLiftRest } from '../src/lib/exercises'
import { intensityForExercise, intensityFromSets } from '../src/lib/muscles'
import { inkFor, resolve } from '../src/lib/theme'
import { computeStreak } from '../src/lib/streak'
import { clearBestCache, loadBest, prLine, repsToPr, weightToPr } from '../src/lib/best'
import { loadStatsRows } from '../src/lib/statsData'
import { epley } from '../src/lib/format'
import { deleteAllHistory, deleteWorkout } from '../src/lib/history'
import { runImport } from '../src/lib/importer'
import { importLiftoff, parseDuration } from '../src/lib/liftoff'
import { errMsg, newId, pb, restFor, type Exercise, type RoutineExercise, type User, type Workout, type WSet } from '../src/lib/pb'
import { buildStats, trendDirection, values } from '../src/lib/stats'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++ }
const tag = Math.random().toString(36).slice(2, 8)

const csv = [
  '﻿Date,Duration,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE,Notes',
  '2025-01-06 18:00:00,1 hour 5 minutes,Push A,Bench Press (Barbell),1,185,5,0,0,8,',
  '2025-01-06 18:00:00,1 hour 5 minutes,Push A,Bench Press (Barbell),2,195,3,0,0,9,"felt ""heavy"", ok"',
  '2025-01-06 18:00:00,1 hour 5 minutes,Push A,Push Up,1,0,20,0,0,,',
  '2025-01-06 18:00:00,1 hour 5 minutes,Push A,Mystery Machine Fly,1,90,12,0,0,,',
  '2025-01-08 07:30:00,45 minutes,Legs,Squat (Barbell),1,225,5,0,0,,',
  '2025-01-08 07:30:00,45 minutes,Legs,Plank,1,0,0,0,60,,',
  '2025-01-08 07:30:00,45 minutes,Legs,Treadmill,1,0,0,1.5,900,,',
  '2025-01-10 18:00:00,50 minutes,Push A,Bench Press (Barbell),1,200,3,0,0,,',
].join('\r\n')

const email = `e2e_${tag}@test.local`
await pb.collection('users').create({ email, password: 'password123', passwordConfirm: 'password123', username: `e2e_${tag}`, bodyweight_kg: 90, height_cm: 180, sex: 'male', unit: 'lb' })
await pb.collection('users').authWithPassword(email, 'password123')

ok(parseDuration('1 hour 5 minutes') === 3900, 'duration parser')
ok(nameKey('Bench Press (Barbell)') === nameKey('Barbell Bench Press'), 'name matching is order-insensitive')
const parsed = importLiftoff(csv)
ok(parsed.workouts.length === 3, `CSV -> 3 sessions (${parsed.workouts.length})`)
ok(parsed.kinds.get('plank') === 'duration' && parsed.kinds.get('treadmill') === 'cardio' && parsed.kinds.get('push up') === 'bodyweight', 'kinds inferred')

const r1 = await runImport(parsed, 'lb', () => {})
ok(r1.imported === 3 && r1.createdExercises === 1, `import: ${r1.imported} workouts, ${r1.createdExercises} custom exercise`)
const r2 = await runImport(parsed, 'lb', () => {})
ok(r2.imported === 0 && r2.skipped === 3, 're-import is idempotent')

const lib = await loadExercises(true)
ok(lib.some((e) => e.name === 'Mystery Machine Fly' && e.owner), 'unknown exercise created as custom')
const sets = await pb.collection('workout_sets').getFullList<WSet>({ filter: `user="${pb.authStore.record!.id}"`, expand: 'exercise', sort: 'performed_at' })
const bench = sets.filter((s) => s.expand?.exercise?.name === 'Barbell Bench Press')
ok(bench.length === 3, 'Liftoff bench mapped to library Barbell Bench Press')
ok(bench.some((s) => Math.abs(s.weight_kg - 185 / 2.20462) < 0.01), 'lb converted to kg')
ok(bench.filter((s) => s.is_pr).length === 2, 'import PRs flagged chronologically (2 bench PRs)')

// Live workout finish: one heavier bench set should be a PR.
const benchEx = lib.find((e) => e.name === 'Barbell Bench Press')!
const x = await makeEx(benchEx, 2)
// The card shows at once; last session's sets load in the background (the workout fills them in).
ok(x.prevPending === true && x.prev.length === 0, 'new exercise card shows before its previous sets load')
const lastSets = await prevFor(benchEx.id)
ok(lastSets.length === 1 && Math.round(lastSets[0].weight_kg * 2.20462) === 200, `previous-set hint loads last session (${lastSets.length} set)`)
x.sets = [{ ...emptySet(), w: '205', r: '3', done: true }, { ...emptySet(), w: '135', r: '10', done: false }]
const a: Active = { id: newId(), name: 'Live push', routine: '', startedAt: new Date(Date.now() - 1800e3).toISOString(), notes: '', exercises: [x] }
const wid = await finishWorkout(a, 'lb', 'private', 91.5)
const live = await pb.collection('workout_sets').getFullList<WSet>({ filter: `workout="${wid}"` })
ok(live.length === 1 && live[0].is_pr, 'finish saves only completed sets and flags PR')
const lw = await pb.collection('workouts').getOne<Workout>(wid)
ok(lw.visibility === 'private' && lw.bodyweight_kg === 91.5, 'finish stores visibility and bodyweight')
const rid = await saveAsRoutine(a, 'My Push', 'lb')
let rex = await pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: `routine="${rid}"` })
// Rest you never set yourself is stored as 0 = "follow my Settings default".
ok(rex.length === 1 && rex[0].reps === 3 && rex[0].target_sets === 1 && rex[0].rest_s === 0, 'save-as-routine stores sets, single reps, and rest that follows Settings')
// Rest edited for this workout (Edit Rest) is set on purpose, so the routine keeps it.
x.rest = 150; x.restSet = true; x.sets = [{ ...emptySet(), w: '200', r: '5', done: true }, { ...emptySet(), w: '200', r: '5', done: true }, { ...emptySet(), w: '200', r: '4', done: true }]
x.note = 'pause at chest'
await syncRoutine(a, rid, 'lb', 'all')
rex = await pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: `routine="${rid}"` })
ok(rex.length === 1 && rex[0].reps === 5 && rex[0].target_sets === 3 && rex[0].rest_s === 150, 'update-routine replaces sets/reps/rest')
ok(rex[0].sets?.length === 3 && Math.round(rex[0].sets[0].w * 2.20462) === 200 && rex[0].sets[2].r === 4 && rex[0].note === 'pause at chest', 'update-routine (everything) saves per-set weights and note')
x.rest = 60; x.note = 'other'; x.sets = [{ ...emptySet(), w: '210', r: '2', done: true }]
await syncRoutine(a, rid, 'lb', 'weights')
rex = await pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: `routine="${rid}"` })
ok(rex.length === 1 && rex[0].target_sets === 3 && rex[0].reps === 5 && rex[0].rest_s === 150 && rex[0].note === 'pause at chest', 'weights-only keeps sets/reps/rest/note')
ok(rex[0].sets?.length === 3 && rex[0].sets.every((p) => Math.round(p.w * 2.20462) === 210) && rex[0].sets[0].r === 5, `weights-only updates every set's weight (${JSON.stringify(rex[0].sets)})`)
const started = await routineExercises(rid)
ok(started[0].plan?.length === 3 && started[0].note === 'pause at chest', 'starting the routine carries the plan and note')
ok((await pb.collection('routines').getOne(rid)).name === 'My Push', 'routine name unchanged by sync')

const all = await pb.collection('workout_sets').getFullList<WSet>({ filter: `user="${pb.authStore.record!.id}"`, expand: 'exercise,workout', sort: 'performed_at' })
const snap = buildStats(all.map((s) => ({
  date: new Date(s.performed_at), workoutId: s.workout, durationS: s.expand!.workout!.duration_s, workoutName: s.expand!.workout!.name,
  exercise: s.expand!.exercise!.name, muscle: s.expand!.exercise!.muscle, kind: s.expand!.exercise!.kind,
  weight: s.weight_kg * 2.20462, reps: s.reps, distance: s.distance_km, seconds: s.seconds,
})))
ok(snap.totalWorkouts === 4, `stats: ${snap.totalWorkouts} workouts`)
ok(snap.favorite === 'Barbell Bench Press', `stats: favorite ${snap.favorite}`)
ok(trendDirection(values(snap.summaries.get('Barbell Bench Press')!, 'est1rm')) === 'up', 'stats: bench trending up')
ok(snap.maxRepsDate instanceof Date && snap.maxExercisesDate instanceof Date, 'stats: record dates present for More Stats')

// Body graph intensities + exercise usage + themes
const benchEx2 = lib.find((e) => e.name === 'Barbell Bench Press')!
const inten = intensityFromSets([{ ex: benchEx2 }, { ex: benchEx2 }, { ex: lib.find((e) => e.name === 'Barbell Squat')! }])
ok(inten.chest === 1 && (inten.triceps ?? 0) > 0 && (inten.triceps ?? 0) < 1 && (inten.quads ?? 0) > 0 && !inten.biceps, 'body graph: primary full, secondary partial, untouched muscles off')
const one = intensityForExercise(benchEx2)
ok(one.chest === 1 && one.triceps === 0.45, 'info sheet highlight for a single exercise')
const imported = intensityFromSets(all.filter((s) => s.workout !== wid).map((s) => ({ ex: s.expand?.exercise })))
ok((imported.chest ?? 0) > 0 && (imported.quads ?? 0) > 0, 'body graph works for older (imported) workouts too')
const usage = await loadUsage()
ok((usage.get(benchEx2.id)?.count ?? 0) >= 3 && (usage.get(benchEx2.id)?.last ?? 0) > 0, 'exercise usage counts sessions and last-performed time')
ok(resolve({ base: 'nope', accent: 'red' }).base === 'midnight' && resolve({ base: 'light', accent: '#38bdf8' }).accent === '#38bdf8', 'theme resolve validates input')
ok(inkFor('#a3e635') !== '#ffffff' && inkFor('#1e3a8a') === '#ffffff', 'accent text color picks contrast')

// Streak: up to 2 rest days in a row; must lift on the 3rd day.
const D = (n: number) => new Date(2026, 0, n, 18)
const at = (n: number) => new Date(2026, 0, n, 12)
ok(computeStreak([], at(5)).days === 0, 'streak: none without workouts')
ok(computeStreak([D(1), D(4), D(7)], at(7)).days === 7, 'streak: 2 rest days between lifts keeps it (7 days)')
ok(computeStreak([D(1), D(5)], at(5)).days === 1, 'streak: 3 rest days in a row breaks it')
const risk = computeStreak([D(1), D(3)], at(6))
ok(risk.days === 6 && risk.atRisk && risk.restLeft === 0, 'streak: 3rd day after last lift is the last chance')
ok(computeStreak([D(1), D(3)], at(7)).days === 0, 'streak: lost the day after that')
const restart = computeStreak([D(1), D(3), D(10)], at(10))
ok(restart.days === 1 && restart.restLeft === 2 && restart.best === 3, 'streak: restarts and remembers best')

// PR target math
const w2 = weightToPr(epley(100, 5), 5, 'kg')
ok(epley(w2, 5) > epley(100, 5) && w2 === 101.25, `to-PR weight beats best by the smallest plate step (${w2} kg)`)
clearBestCache()
const bb = await loadBest(benchEx2.id)
ok(bb.any && bb.e1rm > 0 && bb.w > 0 && bb.r > 0, 'best set loaded for PR line')
ok(prLine(benchEx2, bb, 5, 'lb', bb.e1rm + 1, 5, 0)?.hit === true, 'PR line flips to "New PR" when a set beats the best')
ok(/^Do 5 reps at [\d.]+ lb to PR/.test(prLine(benchEx2, bb, 5, 'lb', 0, 0, 0)?.text ?? ''), 'PR line reads "Do 5 reps at X lb to PR" before you beat it')

ok(repsToPr(epley(100, 5), 100) === 6 && repsToPr(epley(100, 5), 110) === 2 && repsToPr(epley(100, 5), 120) === 1, 'reps-to-PR at a given weight (ties never count)')
ok(prLine(benchEx2, bb, 5, 'lb', 0, 0, 0, 185)?.text.includes('reps at 185') === true, 'PR line offers reps needed at your working weight')
ok(values([{ ...snap.summaries.get('Barbell Bench Press')!.at(-1)! }], 'bestset')[0] > 0, 'stats: Best Set metric charts the best set weight')
const rows1 = await loadStatsRows(pb.authStore.record!.id, true)
ok(rows1.length === all.length && rows1.every((r) => r.ex && r.workoutName), 'slim stats loader joins exercise + workout for every set')

// Personal edit of an official exercise shows in your library only
const ovr = await pb.collection('exercise_overrides').create({ user: pb.authStore.record!.id, exercise: benchEx2.id, name: 'Bench (my way)', instructions: 'Pause on the chest.' })
const libO = await loadExercises(true)
const mineB = libO.find((e) => e.id === benchEx2.id)!
ok(mineB.name === 'Bench (my way)' && mineB.override === ovr.id && mineB.kind === 'weight' && mineB.muscle === 'chest', 'personal edit merged into your exercise list (tracking unchanged)')
await pb.collection('exercise_overrides').delete(ovr.id)
ok((await loadExercises(true)).find((e) => e.id === benchEx2.id)!.name === 'Barbell Bench Press', 'reset to official version')

// Per-lift rest: own setting > account default; -1 = off; after-exercise falls back to between-sets
const u0 = { default_rest_s: 120, default_rest_after_s: 0 } as unknown as User
ok(restFor({}, u0).rest === 120 && restFor({}, u0).after === 120, 'rest: account defaults (after falls back to between-sets)')
ok(restFor({ rest_s: 60, rest_after_s: -1 }, u0).rest === 60 && restFor({ rest_s: 60, rest_after_s: -1 }, u0).after === 0, 'rest: per-lift values and "off"')
await saveLiftRest(benchEx2, { rest_s: 150, rest_after_s: 200 })
const withRest = (await loadExercises(true)).find((e) => e.id === benchEx2.id)!
ok(withRest.rest_s === 150 && withRest.rest_after_s === 200 && withRest.name === 'Barbell Bench Press', 'per-lift rest saved without renaming the lift')
const made = await makeEx(withRest, 3, restFor(withRest, u0).rest, '', restFor(withRest, u0).after)
ok(made.rest === 150 && made.restAfter === 200, 'adding the lift to a workout uses its own rest times')
await pb.collection('exercise_overrides').delete(withRest.override!)

// Same movement, different name → official exercise (import matching + merging existing duplicates)
const libM = await loadExercises(true)
ok(matchOfficial('Bench Press', libM)?.name === 'Barbell Bench Press' && matchOfficial('Military Press', libM)?.name === 'Barbell Overhead Press'
  && matchOfficial('Incline Bench Press', libM)?.name === 'Incline Barbell Bench Press' && !matchOfficial('Smith Machine Bench Press', libM), 'import name matching picks the official lift (and leaves real variations alone)')
const dup = await pb.collection('exercises').create<Exercise>({ name: 'Bench Press', muscle: 'chest', equipment: 'barbell', kind: 'weight', owner: pb.authStore.record!.id })
const dw = newId()
const db = pb.createBatch()
db.collection('workouts').create({ id: dw, user: pb.authStore.record!.id, name: 'Old import', started_at: new Date(Date.now() - 400 * 864e5).toISOString() })
db.collection('workout_sets').create({ workout: dw, user: pb.authStore.record!.id, exercise: dup.id, performed_at: new Date(Date.now() - 400 * 864e5).toISOString(), set_index: 0, weight_kg: 60, reps: 5, completed: true, is_pr: true })
await db.send()
ok(findDuplicates(await loadExercises(true)).some((d) => d.from.id === dup.id && d.to.id === benchEx2.id), 'duplicate "Bench Press" detected')
const movedN = await mergeExercise(dup.id, benchEx2.id)
const mergedSets = await pb.collection('workout_sets').getFullList<WSet>({ filter: `workout="${dw}"` })
ok(movedN === 1 && mergedSets[0].exercise === benchEx2.id, 'merge moves the sets to the official exercise')
ok(!(await loadExercises(true)).some((e) => e.id === dup.id), 'duplicate custom exercise deleted after merge')
ok(mergedSets[0].is_pr === false, 'merge re-flags PRs on combined history (a lighter set loses its old PR flag)')

// Finishing a workout whose exercise was merged away mid-session (the "Failed to find all relation records" bug)
const stale = await pb.collection('exercises').create<Exercise>({ name: 'Bench Press', muscle: 'chest', equipment: 'barbell', kind: 'weight', owner: pb.authStore.record!.id })
const sx = await makeEx(stale, 1)
sx.sets = [{ ...emptySet(), w: '100', r: '5', done: true }]
await mergeExercise(stale.id, benchEx2.id) // deletes the custom exercise while the workout is "in progress"
const staleWid = await finishWorkout({ id: newId(), name: 'Stale', routine: '', startedAt: new Date().toISOString(), notes: '', exercises: [sx] }, 'lb', 'public')
const staleSets = await pb.collection('workout_sets').getFullList<WSet>({ filter: `workout="${staleWid}"` })
ok(staleSets.length === 1 && staleSets[0].exercise === benchEx2.id, 'finish repairs exercises merged away mid-workout')
await pb.collection('workouts').delete(staleWid)
ok(errMsg({ response: { message: 'Batch transaction failed.', data: { requests: { '1': { response: { message: 'x', data: { exercise: { message: 'Failed to find all relation records with the provided ids.' } } } } } } } })
  === 'exercise: Failed to find all relation records with the provided ids.', 'batch errors show the real reason')

// Editing a finished workout (same batch the editor sends): replace sets, update details
const ew = await pb.collection('workouts').getOne<Workout>(wid)
const oldSets = await pb.collection('workout_sets').getFullList<WSet>({ filter: `workout="${wid}"`, fields: 'id' })
const eb = pb.createBatch()
eb.collection('workouts').update(wid, { name: 'Edited push', volume_kg: 100 * 5 * 2 })
oldSets.forEach((s) => eb.collection('workout_sets').delete(s.id))
for (const i of [0, 1]) eb.collection('workout_sets').create({ workout: wid, user: ew.user, exercise: benchEx2.id, performed_at: ew.started_at, position: 0, set_index: i, weight_kg: 100, reps: 5, completed: true })
await eb.send()
const edited = await pb.collection('workout_sets').getFullList<WSet>({ filter: `workout="${wid}"` })
ok(edited.length === 2 && edited.every((s) => s.weight_kg === 100 && s.reps === 5) && (await pb.collection('workouts').getOne<Workout>(wid)).name === 'Edited push', 'workout edit replaces sets and details')

// Deleting a workout removes it from stats; clearing history removes everything.
const uid = pb.authStore.record!.id
const before = (await pb.collection('workouts').getFullList({ filter: `user="${uid}"` })).length
await deleteWorkout(wid)
const after = await pb.collection('workout_sets').getFullList<WSet>({ filter: `user="${uid}"` })
ok(!after.some((s) => s.workout === wid) && new Set(after.map((s) => s.workout)).size === before - 1, 'deleted workout gone from stats data')
const n = await deleteAllHistory()
ok(n === before - 1, `delete-all removed ${n} workouts`)
ok((await pb.collection('workout_sets').getFullList({ filter: `user="${uid}"` })).length === 0, 'no sets left after delete-all')
const again = await runImport(parsed, 'lb', () => {})
ok(again.imported === 3, 'Liftoff file can be re-imported after clearing history')

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
