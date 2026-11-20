import type { RoutineUpdate } from '../lib/pb'

export const ROUTINE_UPDATES: [RoutineUpdate, string, string][] = [
  ['all', 'Everything', 'Exercises, order, sets, reps, rest, weights and notes'],
  ['weights', 'Weights only', 'Keep the routine, just update each set’s weight'],
  ['none', 'Keep the same', 'Don’t change the routine'],
]

/** What finishing a routine workout saves back to the routine. */
export function RoutineUpdatePicker({ value, onChange }: { value: RoutineUpdate; onChange: (v: RoutineUpdate) => void }) {
  return (
    <div className="space-y-2" role="radiogroup">
      {ROUTINE_UPDATES.map(([v, t, d]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${value === v ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
          <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${value === v ? 'border-accent' : 'border-faint'}`}>
            {value === v && <span className="size-2.5 rounded-full bg-accent" />}
          </span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{t}</span><span className="block text-sm text-muted">{d}</span></span>
        </button>
      ))}
    </div>
  )
}
