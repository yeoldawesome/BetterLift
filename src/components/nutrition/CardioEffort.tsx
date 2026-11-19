import { useState } from 'react'
import { estimateCardio, type Estimate, type Person } from '../../lib/energy'
import { DEFAULT_SETTINGS, personFor, useNutrition } from '../../lib/nutrition'
import { nutritionOn, useUser, type Kind } from '../../lib/pb'
import { BottomSheet, Button } from '../ui'
import { FlameIcon } from '../icons'

export type Effort = { hr?: string; rpe?: number; kcal?: string }

export const RPE_LABELS: [number, string][] = [
  [1, 'Very easy'], [2, 'Easy'], [3, 'Easy'], [4, 'Comfortable'], [5, 'Moderate'], [6, 'Moderate+'], [7, 'Hard'], [8, 'Very hard'], [9, 'Near max'], [10, 'All out'],
]
export const rpeLabel = (r?: number) => RPE_LABELS.find(([v]) => v === r)?.[1] ?? ''

const n = (s?: string) => { const v = parseFloat((s ?? '').replace(',', '.')); return Number.isFinite(v) ? v : 0 }

/** The current user as the energy maths sees them (falls back to defaults until goals load). */
export function usePerson(): Person | null {
  const user = useUser()
  const { person } = useNutrition(user)
  return person ?? (user ? personFor(user, DEFAULT_SETTINGS) : null)
}

/** One-line effort summary + estimated burn; tap to set RPE / heart rate / watch calories. */
export function CardioEffort({ name, kind, seconds, distanceKm, effort, onChange, className = '' }: {
  name: string; kind: Kind; seconds: number; distanceKm: number; effort: Effort; onChange: (e: Effort) => void; className?: string
}) {
  const [open, setOpen] = useState(false)
  const person = usePerson()
  const calories = nutritionOn(useUser()) // nutrition off: effort only, no calorie talk
  const est = calories && person ? estimateCardio({ name, kind, seconds, distanceKm, avgHr: n(effort.hr), rpe: effort.rpe, kcal: n(effort.kcal) }, person) : null
  const parts = [effort.rpe ? `RPE ${effort.rpe} · ${rpeLabel(effort.rpe).toLowerCase()}` : '', n(effort.hr) ? `${Math.round(n(effort.hr))} bpm` : '', calories && n(effort.kcal) ? 'watch' : ''].filter(Boolean)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 text-left text-xs font-semibold active:bg-surface-2 ${className}`}>
        <FlameIcon width={14} height={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-muted">{parts.length ? parts.join(' · ') : 'Add effort (RPE / heart rate)'}</span>
        {est && est.kcal > 0 && <span className="num shrink-0 text-ink">≈ {est.kcal} kcal</span>}
      </button>
      {open && <EffortSheet name={name} kind={kind} seconds={seconds} distanceKm={distanceKm} effort={effort} person={calories ? person : null} onClose={() => setOpen(false)} onSave={(e) => { onChange(e); setOpen(false) }} />}
    </>
  )
}

/** RPE buttons + average heart rate + watch calories. */
export function EffortFields({ rpe, setRpe, hr, setHr, kcal, setKcal, calories = true }: {
  rpe: number; setRpe: (v: number) => void; hr: string; setHr: (v: string) => void; kcal: string; setKcal: (v: string) => void; calories?: boolean
}) {
  const input = 'num h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-lg font-bold outline-none placeholder:text-faint focus:border-accent'
  return (
    <>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">How hard was it? (RPE)</p>
        <div className="grid grid-cols-5 gap-1.5">
          {RPE_LABELS.map(([v]) => (
            <button key={v} type="button" onClick={() => setRpe(rpe === v ? 0 : v)}
              className={`num h-11 rounded-xl text-lg font-black transition ${rpe === v ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{v}</button>
          ))}
        </div>
        <p className="mt-1.5 min-h-4 text-xs font-semibold text-muted">{rpe ? `${rpe} · ${rpeLabel(rpe)}` : '1 = barely moving · 5 = could talk in short sentences · 10 = all out'}</p>
      </div>
      <div className={`grid gap-2 ${calories ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Avg heart rate</span>
          <span className="relative block">
            <input inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="—" className={input} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">bpm</span>
          </span>
        </label>
        {calories && <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Watch calories</span>
          <span className="relative block">
            <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="—" className={input} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">kcal</span>
          </span>
        </label>}
      </div>
      {calories && <p className="text-xs text-muted">Watch calories should be <span className="font-semibold text-ink">active</span> calories (not total). Best data wins: watch → heart rate → pace → effort.</p>}
    </>
  )
}

export function EffortSheet({ name, kind, seconds, distanceKm, effort, person, onSave, onClose }: {
  name: string; kind: Kind; seconds: number; distanceKm: number; effort: Effort; person: Person | null; onSave: (e: Effort) => void; onClose: () => void
}) {
  const [rpe, setRpe] = useState(effort.rpe ?? 0)
  const [hr, setHr] = useState(effort.hr ?? '')
  const [kcal, setKcal] = useState(effort.kcal ?? '')
  const est = person ? estimateCardio({ name, kind, seconds, distanceKm, avgHr: n(hr), rpe, kcal: n(kcal) }, person) : null
  return (
    <BottomSheet title={`${name} effort`} onClose={onClose}>
      <div className="space-y-4">
        <EffortFields rpe={rpe} setRpe={setRpe} hr={hr} setHr={setHr} kcal={kcal} setKcal={setKcal} calories={!!person} />
        {person && <BurnEstimate est={seconds > 0 ? est : null} />}
        {person && seconds <= 0 && <p className="text-xs font-semibold text-amber-500">Enter the time for this set to estimate calories.</p>}
        <Button onClick={() => onSave({ rpe: rpe || undefined, hr: hr || undefined, kcal: kcal || undefined })}>Done</Button>
      </div>
    </BottomSheet>
  )
}

export function BurnEstimate({ est }: { est: Estimate | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
      <span className="text-sm text-muted">{est ? `Estimated burn, ${est.label}` : 'Estimated burn'}</span>
      <span className="num shrink-0 text-xl font-black">{est ? `≈ ${est.kcal}` : '—'}<span className="text-sm font-bold text-muted"> kcal</span></span>
    </div>
  )
}
