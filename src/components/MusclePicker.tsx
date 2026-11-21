import { label } from '../lib/exercises'
import { primaryOptions, secondaryOptions } from '../lib/muscles'

const chip = (on: boolean) => `h-8 rounded-full px-3 text-sm font-semibold ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`
const head = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-muted'

/** Primary muscles (full set each, at least one) and secondary muscles (half a set each). Tap to toggle. */
export function MusclePicker({ primaries, secondary, onChange }: {
  primaries: string[]; secondary: string[]; onChange: (v: { primaries: string[]; secondary: string[] }) => void
}) {
  const togglePrimary = (m: string) => {
    if (primaries.includes(m)) { if (primaries.length > 1) onChange({ primaries: primaries.filter((x) => x !== m), secondary }) }
    else onChange({ primaries: [...primaries, m], secondary: secondary.filter((x) => x !== m) })
  }
  const toggleSecondary = (m: string) => onChange({ primaries, secondary: secondary.includes(m) ? secondary.filter((x) => x !== m) : [...secondary, m] })
  return (
    <>
      <div>
        <span className={head}>Primary muscles</span>
        <div className="flex flex-wrap gap-1.5">
          {primaryOptions(primaries).map((m) => (
            <button key={m} type="button" aria-pressed={primaries.includes(m)} onClick={() => togglePrimary(m)} className={chip(primaries.includes(m))}>{label(m)}</button>
          ))}
        </div>
      </div>
      <div>
        <span className={head}>Secondary muscles</span>
        <div className="flex flex-wrap gap-1.5">
          {secondaryOptions(primaries, secondary).map((m) => (
            <button key={m} type="button" aria-pressed={secondary.includes(m)} onClick={() => toggleSecondary(m)} className={chip(secondary.includes(m))}>{label(m)}</button>
          ))}
        </div>
      </div>
    </>
  )
}
