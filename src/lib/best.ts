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

/**
 * "Beat PR" options in display units: more reps at the weight you're using, or the next plate step up.
 * e.g. [{ w: 40, r: 13 }, { w: 45, r: 8 }] → "Beat PR: 40 × 13 or 45 × 8". Bodyweight kinds give reps; holds give seconds.
 */
export type Beat = { hit: true } | { hit: false; first?: boolean; options: { w?: number; r?: number; sec?: number }[] }
export function prBeat(ex: Exercise, best: Best | null, unit: Unit, workingW: number, liveE1rmKg = 0, liveReps = 0, liveSec = 0): Beat | null {
  if (!best) return null
  if (!best.any) return { hit: false, first: true, options: [] }
  if (ex.kind === 'weight') {
    if (liveE1rmKg > best.e1rm + 0.01) return { hit: true }
    if (!best.e1rm) return null
    const step = unit === 'lb' ? 5 : 2.5
    const w = workingW > 0 ? workingW : Number(toUnit(best.w, unit).toFixed(1))
    const options: { w: number; r: number }[] = []
    const r1 = repsToPr(best.e1rm, fromUnit(w, unit))
    if (r1 && r1 <= 20) options.push({ w, r: r1 })
    const up = (Math.floor(w / step) + 1) * step
    const r2 = repsToPr(best.e1rm, fromUnit(up, unit))
    if (r2 && r2 <= 20) options.push({ w: up, r: r2 })
    // Working weight is far below your best: show the weight that beats it at your best set's reps instead.
    if (!options.length) { const r = Math.min(12, best.r || 5); options.push({ w: weightToPr(best.e1rm, r, unit), r }) }
    return { hit: false, options: options.slice(0, 2) }
  }
  if (ex.kind === 'bodyweight' || ex.kind === 'assisted') return liveReps > best.maxReps ? { hit: true } : { hit: false, options: [{ r: best.maxReps + 1 }] }
  if (ex.kind === 'duration' && isCardio(ex)) return null
  if (ex.kind === 'duration') return liveSec > best.maxSec ? { hit: true } : { hit: false, options: [{ sec: best.maxSec + 1 }] }
  return null
}

export const beatText = (o: { w?: number; r?: number; sec?: number }) => (o.sec ? `${o.sec}s` : o.w !== undefined ? `${o.w} × ${o.r}` : `${o.r} reps`)
