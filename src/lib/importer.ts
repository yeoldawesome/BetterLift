import { guessEquipment, guessMuscle, loadExercises, matchOfficial, nameKey } from './exercises'
import { epley, fromDist, fromUnit } from './format'
import type { ImpResult, ImpWorkout } from './liftoff'
import { me, newId, pb, type Exercise, type Unit, type Workout } from './pb'
import { invalidateStats } from './statsData'
import { clearBestCache } from './best'

const MAX_BATCH = 400

export async function alreadyImported(): Promise<Set<string>> {
  const prior = await pb.collection('workouts').getFullList<Workout>({ filter: pb.filter('user = {:u} && source_id != ""', { u: me() }), fields: 'source_id' })
  return new Set(prior.map((w) => w.source_id))
}

/** Idempotent: workouts whose source_id already exists are skipped (also enforced by a unique index). */
export async function runImport(parsed: ImpResult, unit: Unit, onProgress: (done: number, total: number) => void) {
  const uid = me()
  const existing = await alreadyImported()
  const fresh: ImpWorkout[] = parsed.workouts.filter((w) => !existing.has(w.sourceId))

  // Map exercise names to the library (custom ones win), creating customs for unknown names.
  const byKey = new Map<string, Exercise>()
  let lib: Exercise[] = []
  const index = (list: Exercise[]) => { lib = list; for (const e of list) if (!byKey.has(nameKey(e.name)) || e.owner) byKey.set(nameKey(e.name), e) }
  // Exact name first, then the official exercise it means ("Bench Press" → "Barbell Bench Press"), else a new custom one.
  const resolve = (n: string) => byKey.get(nameKey(n)) ?? matchOfficial(n, lib)
  index(await loadExercises(true))
  const missing = [...new Map(parsed.names.filter((n) => !resolve(n)).map((n) => [nameKey(n), n])).values()]
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const b = pb.createBatch()
    missing.slice(i, i + MAX_BATCH).forEach((n) => b.collection('exercises').create({
      name: n.slice(0, 80), muscle: guessMuscle(n), equipment: guessEquipment(n), kind: parsed.kinds.get(n.toLowerCase()) ?? 'weight', owner: uid,
    }))
    await b.send()
  }
  if (missing.length) index(await loadExercises(true))

  // Seed running bests with what's already logged so imported PRs are real PRs.
  const best = new Map<string, number>()
  let batch = pb.createBatch(), queued = 0, pending = 0, done = 0
  const flush = async () => {
    if (queued) await batch.send()
    batch = pb.createBatch(); queued = 0; done += pending; pending = 0
    onProgress(done, fresh.length)
  }
  onProgress(0, fresh.length)
  for (const w of fresh) {
    const id = newId()
    const sets = w.exercises.flatMap((x, pos) => {
      const ex = resolve(x.name)!
      return x.sets.map((s, idx) => {
        const kg = fromUnit(s.weight, unit)
        return { ex, pos, idx, kg, reps: s.reps, sec: s.seconds, dist: fromDist(s.distance, unit), e1: ex.kind === 'weight' ? epley(kg, s.reps) : 0 }
      })
    })
    const prIdx = new Set<number>()
    for (const exId of new Set(sets.map((s) => s.ex.id))) {
      let bi = -1
      sets.forEach((s, i) => { if (s.ex.id === exId && s.e1 > 0 && (bi < 0 || s.e1 > sets[bi].e1)) bi = i })
      if (bi >= 0 && sets[bi].e1 > (best.get(exId) ?? 0) + 0.01) { prIdx.add(bi); best.set(exId, sets[bi].e1) }
    }
    if (queued && queued + sets.length + 1 > MAX_BATCH) await flush()
    batch.collection('workouts').create({
      id, user: uid, name: w.name.slice(0, 80), started_at: w.date.toISOString(), ended_at: new Date(w.date.getTime() + w.durationS * 1000).toISOString(),
      duration_s: w.durationS, volume_kg: sets.reduce((t, s) => t + (s.ex.kind === 'weight' ? s.kg * s.reps : 0), 0), pr_count: prIdx.size, source_id: w.sourceId,
    })
    sets.forEach((s, i) => batch.collection('workout_sets').create({
      workout: id, user: uid, exercise: s.ex.id, performed_at: w.date.toISOString(), position: s.pos, set_index: s.idx,
      weight_kg: s.kg, reps: s.reps, seconds: s.sec, distance_km: s.dist, completed: true, e1rm_kg: s.e1, is_pr: prIdx.has(i),
    }))
    queued += sets.length + 1
    pending++
  }
  await flush()
  invalidateStats(); clearBestCache()
  return { imported: fresh.length, skipped: parsed.workouts.length - fresh.length, createdExercises: missing.length }
}
