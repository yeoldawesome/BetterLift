import { label } from '../lib/exercises'
import { secondPrimaryOptions, secondaryOptions } from '../lib/muscles'
import { Select } from './ui'

/** Optional second primary muscle, then secondary muscles (half a set each, tap to toggle). */
export function MuscleChips({ muscle, muscle2, onMuscle2, secondary, onChange }: {
  muscle: string; muscle2: string; onMuscle2: (v: string) => void; secondary: string[]; onChange: (v: string[]) => void
}) {
  const single = muscle === 'full_body' || muscle === 'cardio'
  const m2 = single || muscle2 === muscle ? '' : muscle2
  return (
    <>
      {!single && <Select label="Second primary muscle (optional)" value={m2} onChange={(v) => { onMuscle2(v); onChange(secondary.filter((x) => x !== v)) }} options={secondPrimaryOptions(muscle, m2, label)} />}
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Secondary muscles</span>
        <div className="flex flex-wrap gap-1.5">
          {secondaryOptions([muscle, m2], secondary).map((m) => (
            <button key={m} type="button" aria-pressed={secondary.includes(m)} onClick={() => onChange(secondary.includes(m) ? secondary.filter((x) => x !== m) : [...secondary, m])}
              className={`h-8 rounded-full px-3 text-sm font-semibold ${secondary.includes(m) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{label(m)}</button>
          ))}
        </div>
      </div>
    </>
  )
}
