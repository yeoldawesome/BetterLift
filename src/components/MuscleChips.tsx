import { label } from '../lib/exercises'
import { cycleMuscle, secondaryOptions } from '../lib/muscles'

/** The other muscles an exercise works. Tap once = secondary (half a set), twice = also primary (full set), again = off. */
export function MuscleChips({ muscle, co, secondary, onChange }: {
  muscle: string; co: string[]; secondary: string[]; onChange: (v: { co_primary: string[]; secondary: string[] }) => void
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Other muscles</span>
      <div className="flex flex-wrap gap-1.5">
        {secondaryOptions(muscle, [...co, ...secondary]).map((m) => {
          const on = co.includes(m) ? 'primary' : secondary.includes(m) ? 'secondary' : ''
          return (
            <button key={m} type="button" aria-pressed={!!on} onClick={() => onChange(cycleMuscle(m, co, secondary))}
              className={`h-8 rounded-full px-3 text-sm font-semibold ${on === 'primary' ? 'bg-accent text-accent-ink' : on === 'secondary' ? 'bg-accent/25 text-accent' : 'bg-surface-2 text-muted'}`}>
              {label(m)}{on === 'primary' && ' · primary'}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-[11px] text-faint">Tap once for secondary (half a set), twice for primary (full set).</p>
    </div>
  )
}
