import { useEffect, useState, type ReactNode } from 'react'
import type { Macros, Meal } from '../../lib/nutrition'
import { MEALS } from '../../lib/nutrition'

/** Fixed macro hues (bars/dots only — text stays in theme colors so it reads on light and dark themes). */
export const MACRO_COLORS = { p: '#0ea5e9', c: '#f59e0b', f: '#ec4899' } as const
export const MACRO_NAMES = { p: 'Protein', c: 'Carbs', f: 'Fat' } as const

export const fmtK = (n: number) => Math.round(n).toLocaleString()
export const fmtG = (n: number) => `${Math.round(n)}`

/** Progress ring. `value`/`max`; goes red past 100%. */
export function Ring({ value, max, size = 132, stroke = 12, children, color }: { value: number; max: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const pct = max > 0 ? value / max : 0
  const over = pct > 1.0001
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        {pct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            stroke={color ?? (over ? 'var(--color-danger)' : 'var(--color-accent)')} strokeDasharray={`${Math.min(1, pct) * c} ${c}`} />
        )}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  )
}

/** One macro: eaten / target, bar, remaining. */
export function MacroBar({ k, eaten, target }: { k: 'p' | 'c' | 'f'; eaten: number; target: number }) {
  const left = target - eaten
  const pct = target > 0 ? Math.min(1, eaten / target) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <span className="size-2 rounded-full" style={{ background: MACRO_COLORS[k] }} />{MACRO_NAMES[k]}
        </span>
      </div>
      <p className="num mt-0.5 truncate text-lg font-black leading-tight">{fmtG(eaten)}<span className="text-sm font-bold text-muted"> / {fmtG(target)}g</span></p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: left < -Math.max(5, target * 0.05) ? 'var(--color-danger)' : MACRO_COLORS[k] }} />
      </div>
      <p className={`num mt-1 text-xs font-semibold ${left < 0 ? 'text-danger' : 'text-muted'}`}>{left >= 0 ? `${fmtG(left)}g left` : `${fmtG(-left)}g over`}</p>
    </div>
  )
}

/** "520 kcal · 32P 40C 18F" */
export function MacroLine({ m, className = '' }: { m: Macros; className?: string }) {
  return (
    <span className={`num flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted ${className}`}>
      {(['p', 'c', 'f'] as const).map((k) => (
        <span key={k} className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: MACRO_COLORS[k] }} />{fmtG(m[k])}{k.toUpperCase()}</span>
      ))}
    </span>
  )
}

export function MealChips({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
      {MEALS.map(([m, l]) => (
        <button key={m} type="button" onClick={() => onChange(m)} className={`h-8 rounded-lg text-xs font-bold transition ${value === m ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{l}</button>
      ))}
    </div>
  )
}

/** Small numeric field with a label, for grams/kcal. */
export function NumField({ label, value, onChange, placeholder, suffix, dot }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string; dot?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}{label}
      </span>
      <span className="relative block">
        <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className={`num h-12 w-full rounded-xl border border-line bg-surface-2 text-lg ${suffix ? 'px-3 pr-10' : 'px-2.5'} font-bold text-ink outline-none placeholder:text-faint focus:border-accent`} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-faint">{suffix}</span>}
      </span>
    </label>
  )
}

/** − value + stepper for servings. Typing keeps its own text so "1." or "0,5" can be entered. */
export function Stepper({ value, onChange, step = 0.5, min = 0.25, max = 100 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [txt, setTxt] = useState(`${value}`)
  useEffect(() => { if (parseFloat(txt.replace(',', '.')) !== value) setTxt(`${value}`) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  return (
    <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-xl bg-surface-2">
      <button type="button" onClick={() => set(value - step)} className="h-full w-9 text-lg font-bold text-muted active:bg-line" aria-label="Less">−</button>
      <input inputMode="decimal" value={txt} onBlur={() => setTxt(`${value}`)}
        onChange={(e) => { setTxt(e.target.value); const n = parseFloat(e.target.value.replace(',', '.')); if (Number.isFinite(n) && n > 0) onChange(Math.min(max, n)) }}
        className="num h-full w-12 bg-transparent text-center font-bold outline-none" aria-label="Servings" />
      <button type="button" onClick={() => set(value + step)} className="h-full w-9 text-lg font-bold text-muted active:bg-line" aria-label="More">+</button>
    </div>
  )
}
