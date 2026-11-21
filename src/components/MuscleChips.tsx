import { label } from '../lib/exercises'
import { secondaryOptions } from '../lib/muscles'

/** Secondary muscles (half a set each): tap to toggle. */
export function MuscleChips({ muscle, secondary, onChange }: { muscle: string; secondary: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Secondary muscles</span>
      <div className="flex flex-wrap gap-1.5">
        {secondaryOptions(muscle, secondary).map((m) => (
          <button key={m} type="button" aria-pressed={secondary.includes(m)} onClick={() => onChange(secondary.includes(m) ? secondary.filter((x) => x !== m) : [...secondary, m])}
            className={`h-8 rounded-full px-3 text-sm font-semibold ${secondary.includes(m) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{label(m)}</button>
        ))}
      </div>
    </div>
  )
}
