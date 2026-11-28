import { useState } from 'react'
import { kcalFrom, scale, servingText, type Macros, type Serving } from '../../lib/nutrition'
import { unitOptions, type AmountUnit } from '../../lib/foodParse'
import { portionText } from '../../lib/meals'
import { NumField, Stepper } from './bits'

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const str = (n: number) => (n ? `${Math.round(n * 10) / 10}` : '')

/** Stepper feel per unit: grams and ml move in 10s, spoons and ounces in 1s, cups in quarters. */
const STEP: Record<AmountUnit['u'], { step: number; min: number; max: number }> = {
  serving: { step: 0.5, min: 0.25, max: 100 }, g: { step: 10, min: 1, max: 5000 }, ml: { step: 10, min: 1, max: 5000 },
  oz: { step: 1, min: 0.25, max: 200 }, lb: { step: 0.25, min: 0.05, max: 20 }, floz: { step: 1, min: 0.25, max: 200 }, cup: { step: 0.25, min: 0.25, max: 40 },
  tbsp: { step: 1, min: 0.5, max: 200 }, tsp: { step: 1, min: 0.5, max: 500 },
}
const roundFor = (u: AmountUnit['u'], v: number) => (u === 'g' || u === 'ml' ? Math.round(v) : Math.round(v * 100) / 100)

/** The unit a food was last saved in, read back from its detail line ("… · 200 g", "1.5 cups"). */
function unitFromDetail(detail: string, units: AmountUnit[]) {
  const m = detail.split(' · ').pop()?.match(/^[\d.]+ (.+)$/)
  return m ? units.find((o) => o.u !== 'serving' && (o.name === m[1] || (o.u === 'cup' && m[1] === 'cup'))) : undefined
}

export type FoodAmountInit = { servings: number; base: Serving | null; macros: Macros; detail: string }

/**
 * Amount + macros of one food (a logged food or an item inside a meal): a stepper in servings or re-measured units
 * (g ⇄ cups ⇄ oz …) when the serving is known; typing numbers directly turns it into a custom entry.
 */
export function useFoodAmount(init: FoodAmountInit) {
  const [servings, setServings] = useState(init.servings || 1)
  const [base, setBase] = useState(init.base)
  const [p, setP] = useState(str(init.macros.p))
  const [c, setC] = useState(str(init.macros.c))
  const [f, setF] = useState(str(init.macros.f))
  const [kcal, setKcal] = useState(str(init.macros.kcal))
  const changeServings = (v: number) => {
    setServings(v)
    if (base) { const m = scale(base, v); setP(str(m.p)); setC(str(m.c)); setF(str(m.f)); setKcal(str(m.kcal)) }
  }
  const units = init.base ? unitOptions(init.base) : []
  const [unit, setUnit] = useState<AmountUnit | undefined>(() => unitFromDetail(init.detail, units))
  const cur = base ? unit ?? units[0] : undefined
  const amount = cur ? roundFor(cur.u, servings / cur.per) : servings
  const macros: Macros = { kcal: kcal.trim() ? Math.round(num(kcal)) : Math.round(kcalFrom(num(p), num(c), num(f))), p: num(p), c: num(c), f: num(f) }
  // No known serving (custom / quick-add / label entries): a portion multiplier on the numbers as they were logged.
  // `per` is one portion's macros; typing a number makes the typed values the new amount for the current portion.
  const [portion, setPortion] = useState(init.base ? 1 : init.servings || 1)
  const [per, setPer] = useState<Macros | null>(null)
  const changePortion = (v: number) => {
    const one = per ?? scale(macros, 1 / portion)
    setPer(one); setPortion(v)
    const m = scale(one, v); setP(str(m.p)); setC(str(m.c)); setF(str(m.f)); setKcal(str(m.kcal))
  }
  const typed = (set: (v: string) => void) => (v: string) => { set(v); setPer(null); if (base) { setBase(null); setPortion(1) } }
  const amountText = cur && cur.u !== 'serving' ? `${amount} ${cur.u === 'cup' && amount <= 1 ? 'cup' : cur.name}` : servingText(servings, base)
  const plain = init.detail && !init.base ? init.detail.replace(/^(?:½|[\d.]+)×(?: · | )?/, '') : ''
  const detail = base ? (init.detail.includes(' · ') ? `${init.detail.split(' · ')[0]} · ${amountText}` : amountText) : [portion !== 1 && portionText(portion), plain].filter(Boolean).join(' · ')

  const view = (
    <>
      {base && cur && (
        <div className="space-y-2 rounded-xl bg-surface p-2">
          <div className="flex items-center justify-between gap-3 pl-1">
            <span className="min-w-0 truncate text-sm text-muted">
              {cur.u === 'serving' ? <>Servings of <span className="font-semibold text-ink">{base.label}</span></> : <>Amount in <span className="font-semibold text-ink">{cur.name}</span>{cur.approx && <span className="text-faint"> · rough</span>}</>}
            </span>
            <Stepper key={cur.u} value={amount} onChange={(v) => changeServings(v * cur.per)} {...STEP[cur.u]} />
          </div>
          {units.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {units.map((o) => (
                <button key={o.u} type="button" onClick={() => setUnit(o)}
                  className={`h-8 shrink-0 rounded-full px-3 text-sm font-semibold ${o.u === cur.u ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>
                  {o.u === 'serving' ? base.label : o.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!base && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-2 pl-3">
          <span className="text-sm text-muted">Portion</span>
          <Stepper value={portion} onChange={changePortion} step={0.25} min={0.1} max={20} />
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        <NumField label="kcal" value={kcal} onChange={typed(setKcal)} placeholder={`${Math.round(kcalFrom(num(p), num(c), num(f)))}`} />
        <NumField label="P" value={p} onChange={typed(setP)} dot="#0ea5e9" />
        <NumField label="C" value={c} onChange={typed(setC)} dot="#f59e0b" />
        <NumField label="F" value={f} onChange={typed(setF)} dot="#ec4899" />
      </div>
    </>
  )
  return { servings: base ? servings : portion, base, macros, detail, view }
}
