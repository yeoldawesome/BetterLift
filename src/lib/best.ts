import { useEffect, useState } from 'react'
import { isCardio } from './energy'
import { epley, fromUnit, toUnit } from './format'
import { me, pb, type Exercise, type Unit, type WSet } from './pb'

/** A user's all-time best set for an exercise: strongest by est. 1RM, plus max reps / longest hold for non-weighted kinds. */
export interface Best { e1rm: number; w: number; r: number; maxReps: number; maxSec: number; any: boolean }

const cache = new Map<string, Promise<Best>>()
export const clearBestCache = () => cache.clear()

export function loadBest(exId: string, userId = me()): Promise<Best> {
  const key = `${userId}:${exId}`
  if (!cache.has(key)) {
    const base = pb.filter('user = {:u} && exercise = {:e} && completed = true', { u: userId, e: exId })
    const top = (sort: string) => pb.collection('workout_sets').getList<WSet>(1, 1, { filter: base, sort, fields: 'weight_kg,reps,seconds,e1rm_kg' }).then((r) => r.items[0])
    cache.set(key, Promise.all([top('-e1rm_kg,-weight_kg'), top('-reps'), top('-seconds')]).then(([b, r, s]) => ({
      e1rm: b?.e1rm_kg ?? 0, w: b?.weight_kg ?? 0, r: b?.reps ?? 0, maxReps: r?.reps ?? 0, maxSec: s?.seconds ?? 0, any: !!(b || r || s),
    })).catch((e) => { cache.delete(key); throw e }))
  }
  return cache.get(key)!
}

export function useBest(exId: string, userId?: string) {
  const [best, setBest] = useState<Best | null>(null)
  useEffect(() => { let on = true; loadBest(exId, userId).then((b) => on && setBest(b)).catch(() => {}); return () => { on = false } }, [exId, userId])
  return best
}

/** Smallest plate-friendly weight (in display units) that beats the best est. 1RM at `reps`. */
export function weightToPr(bestE1rmKg: number, reps: number, unit: Unit) {
  const step = unit === 'lb' ? 2.5 : 1.25
  const r = Math.max(1, reps)
  let w = Math.ceil(toUnit(r === 1 ? bestE1rmKg : bestE1rmKg / (1 + r / 30), unit) / step) * step
  while (epley(fromUnit(w, unit), r) <= bestE1rmKg + 0.01) w += step
  return w
}

/** Fewest reps at `weightKg` that beat the best est. 1RM (null if it would take more than 30). */
export function repsToPr(bestE1rmKg: number, weightKg: number) {
  if (weightKg <= 0) return null
  if (weightKg > bestE1rmKg + 0.01) return 1
  // Start from the closed-form estimate, then step up so the result strictly beats the best (guards float rounding).
  let r = Math.max(2, Math.floor(30 * (bestE1rmKg / weightKg - 1)))
  while (epley(weightKg, r) <= bestE1rmKg + 0.01 && r <= 30) r++
  return r <= 30 ? r : null
}

/** Text for the PR line under an exercise during a workout. `altW` is the weight (display units) you're working with. */
export function prLine(ex: Exercise, best: Best | null, reps: number, unit: Unit, liveE1rmKg: number, liveReps: number, liveSec: number, altW = 0) {
  if (!best) return null
  if (!best.any) return { text: 'First time logging this — every set is a PR', hit: false }
  if (ex.kind === 'weight') {
    if (liveE1rmKg > best.e1rm + 0.01) return { text: 'New PR!', hit: true }
    if (!best.e1rm) return null
    const w = weightToPr(best.e1rm, reps, unit)
    const alt = altW > 0 && Math.abs(altW - w) > 0.01 ? repsToPr(best.e1rm, fromUnit(altW, unit)) : null
    return { text: `Do ${reps} reps at ${w} ${unit} to PR${alt ? `  ·  or ${alt} reps at ${altW}` : ''}`, hit: false }
  }
  if (ex.kind === 'bodyweight' || ex.kind === 'assisted') return liveReps > best.maxReps ? { text: 'New rep PR!', hit: true } : { text: `Do ${best.maxReps + 1} reps in one set to PR`, hit: false }
  if (ex.kind === 'duration' && isCardio(ex)) return null // sports/conditioning: no "hold longer" PR
  if (ex.kind === 'duration') return liveSec > best.maxSec ? { text: 'New PR!', hit: true } : { text: `Hold for ${best.maxSec + 1}s to PR`, hit: false }
  return null
}
