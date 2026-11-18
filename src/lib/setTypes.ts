export type SetType = 'normal' | 'warmup' | 'failure' | 'drop' | 'cooldown'

/** Letter + colour shown in the set-number cell. Normal sets show their running number instead. */
export const SET_TYPES: { v: SetType; letter: string; label: string; color: string }[] = [
  { v: 'warmup', letter: 'W', label: 'Warm-up Set', color: 'text-amber-400' },
  { v: 'normal', letter: '1', label: 'Normal Set', color: 'text-ink' },
  { v: 'failure', letter: 'F', label: 'Failure Set', color: 'text-red-500' },
  { v: 'drop', letter: 'D', label: 'Drop Set', color: 'text-cyan-300' },
  { v: 'cooldown', letter: 'C', label: 'Cool-down Set', color: 'text-blue-400' },
]

const byType = new Map(SET_TYPES.map((t) => [t.v, t]))

/** Labels for a list of sets: warm-ups/cool-downs/etc get their letter, normal sets are numbered 1, 2, 3… skipping the others. */
export function setLabels(types: (SetType | '' | undefined)[]): { text: string; color: string }[] {
  let n = 0
  return types.map((t) => {
    if (!t || t === 'normal') return { text: `${++n}`, color: '' }
    const d = byType.get(t)!
    return { text: d.letter, color: d.color }
  })
}
