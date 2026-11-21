import { MAP_MUSCLES, muscleSetCounts, type Intensity, type MapMuscle } from './muscles'
import type { Exercise } from './pb'

/** Hours for a muscle to fully recover from a hard session; big muscles take longer. */
const HOURS: Record<MapMuscle, number> = {
  chest: 60, lats: 66, traps: 54, upper_back: 60, lower_back: 72, front_delts: 54, side_delts: 48, rear_delts: 48, biceps: 48, triceps: 48, forearms: 36,
  quads: 72, hamstrings: 72, glutes: 66, adductors: 60, calves: 42, core: 36,
}
/** Weighted sets that fully tire a muscle. */
const FULL = 6
export const RECOVERY_WINDOW_H = 96

export const MUSCLE_NAMES: Record<MapMuscle, string> = {
  chest: 'chest', lats: 'lats', traps: 'traps', upper_back: 'upper back', lower_back: 'lower back',
  front_delts: 'front delts', side_delts: 'side delts', rear_delts: 'rear delts', biceps: 'biceps', triceps: 'triceps', forearms: 'forearms',
  quads: 'quadriceps', hamstrings: 'hamstrings', glutes: 'glutes', adductors: 'adductors', calves: 'calves', core: 'core',
}

type Ex = Pick<Exercise, 'muscle' | 'secondary'> & { primaries?: string[]; kind?: Exercise['kind'] }
/** 0..1 per muscle (1 = fully recovered) from sets done in the last few days. */
export function recovery(sessions: { at: Date; sets: { ex?: Ex }[] }[], now = new Date()): Record<MapMuscle, number> {
  const fatigue = Object.fromEntries(MAP_MUSCLES.map((m) => [m, 0])) as Record<MapMuscle, number>
  for (const s of sessions) {
    const h = (now.getTime() - s.at.getTime()) / 3600000
    if (h < 0 || h > RECOVERY_WINDOW_H) continue
    const counts = muscleSetCounts(s.sets)
    for (const m of MAP_MUSCLES) fatigue[m] += Math.min(FULL, counts[m]) / FULL * Math.max(0, 1 - h / HOURS[m])
  }
  return Object.fromEntries(MAP_MUSCLES.map((m) => [m, Math.max(0, 1 - Math.min(1, fatigue[m]))])) as Record<MapMuscle, number>
}

// Squared so half-recovered muscles look clearly paler than ready ones.
export const recoveryIntensity = (r: Record<MapMuscle, number>): Intensity => Object.fromEntries(MAP_MUSCLES.map((m) => [m, Math.max(0.06, r[m] ** 2)]))

export function recoverySummary(r: Record<MapMuscle, number>) {
  const list = (ms: MapMuscle[]) => {
    const names = ms.map((m) => MUSCLE_NAMES[m])
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }
  const ready = MAP_MUSCLES.filter((m) => r[m] >= 0.95)
  const sore = MAP_MUSCLES.filter((m) => r[m] < 0.6).sort((a, b) => r[a] - r[b])
  return { ready, sore, readyText: list(ready), soreText: list(sore) }
}
