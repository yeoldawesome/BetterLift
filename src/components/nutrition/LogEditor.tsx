import { useState } from 'react'
import { BottomSheet, Button, ErrorText, Input } from '../ui'
import { ask } from '../Dialog'
import { addLogs, dayLabel, deleteLog, isDay, kcalFrom, logMacros, scale, servingText, today, updateLog, type Draft, type FoodLog, type Meal } from '../../lib/nutrition'
import { errMsg } from '../../lib/pb'
import { unitOptions, type AmountUnit } from '../../lib/foodParse'
import { fmtK, MealChips, NumField, Stepper } from './bits'
import { ItemsEditor } from './ItemsEditor'
import { createSaved, itemFromDraft, itemsTotal } from '../../lib/meals'
import type { MealItem } from '../../lib/nutrition'

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const str = (n: number) => (n ? `${Math.round(n * 10) / 10}` : '')

/** Stepper feel per unit: grams and ml move in 10s, spoons and ounces in 1s, cups in quarters. */
const STEP: Record<AmountUnit['u'], { step: number; min: number; max: number }> = {
  serving: { step: 0.5, min: 0.25, max: 100 }, g: { step: 10, min: 1, max: 5000 }, ml: { step: 10, min: 1, max: 5000 },
  oz: { step: 1, min: 0.25, max: 200 }, lb: { step: 0.25, min: 0.05, max: 20 }, floz: { step: 1, min: 0.25, max: 200 }, cup: { step: 0.25, min: 0.25, max: 40 },
  tbsp: { step: 1, min: 0.5, max: 200 }, tsp: { step: 1, min: 0.5, max: 500 },
}
const roundFor = (u: AmountUnit['u'], v: number) => (u === 'g' || u === 'ml' ? Math.round(v) : Math.round(v * 100) / 100)

/** The unit a log was last saved in, read back from its detail line ("… · 200 g", "1.5 cups"). */
function unitFromDetail(detail: string, units: AmountUnit[]) {
  const m = detail.split(' · ').pop()?.match(/^[\d.]+ (.+)$/)
  return m ? units.find((o) => o.u !== 'serving' && (o.name === m[1] || (o.u === 'cup' && m[1] === 'cup'))) : undefined
}

/** Edit one logged food: amount (or raw numbers), meal, day; delete; or log it again today. */
export function LogEditor({ log, onClose, onChanged }: { log: FoodLog; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(log.name)
  const [meal, setMeal] = useState<Meal>(log.meal)
  const [day, setDay] = useState(log.day)
  const [servings, setServings] = useState(log.servings || 1)
  // A food with a known serving scales with the stepper; typing numbers directly turns it into a custom entry.
  const [base, setBase] = useState(log.base)
  const m0 = logMacros(log)
  const [p, setP] = useState(str(m0.p))
  const [c, setC] = useState(str(m0.c))
  const [f, setF] = useState(str(m0.f))
  const [kcal, setKcal] = useState(str(m0.kcal))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // A logged meal is edited item by item; this copy belongs to this day only (the saved meal stays as it is).
  const [items, setItems] = useState<MealItem[] | null>(log.items?.length ? log.items : null)

  const changeServings = (v: number) => {
    setServings(v)
    if (base) { const m = scale(base, v); setP(str(m.p)); setC(str(m.c)); setF(str(m.f)); setKcal(str(m.kcal)) }
  }
  // The amount can be shown in the serving itself or re-measured (grams ⇄ cups ⇄ oz …); servings stays the source of truth.
  const units = log.base ? unitOptions(log.base) : []
  const [unit, setUnit] = useState<AmountUnit | undefined>(() => unitFromDetail(log.detail, units))
  const cur = base ? unit ?? units[0] : undefined
  const amount = cur ? roundFor(cur.u, servings / cur.per) : servings
  const typed = (set: (v: string) => void) => (v: string) => { set(v); setBase(null) }
  const macros = items ? itemsTotal(items) : { kcal: kcal.trim() ? Math.round(num(kcal)) : Math.round(kcalFrom(num(p), num(c), num(f))), p: num(p), c: num(c), f: num(f) }
  const amountText = cur && cur.u !== 'serving' ? `${amount} ${cur.u === 'cup' && amount <= 1 ? 'cup' : cur.name}` : servingText(servings, base)
  const draft = (): Draft => items ? ({
    name, meal, servings: 1, base: null, macros, source: log.source, detail: items.map((i) => i.name).join(', '), items, savedMeal: log.saved_meal,
  }) : ({
    name, meal, servings: base ? servings : 1, base, macros, source: log.source,
    detail: base ? (log.detail.includes(' · ') ? `${log.detail.split(' · ')[0]} · ${amountText}` : amountText) : log.detail && !log.base ? log.detail : '',
    barcode: log.barcode,
  })
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); onChanged(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <BottomSheet title={items ? 'Edit meal' : 'Edit food'} onClose={onClose}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Name" />
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
        {items && <>
          <ItemsEditor items={items} onChange={setItems} />
          {log.saved_meal && <p className="px-1 text-xs text-faint">Changes here only affect this day. Edit the saved meal in Meals to change it for next time.</p>}
        </>}
        {!items && <div className="grid grid-cols-4 gap-2">
          <NumField label="kcal" value={kcal} onChange={typed(setKcal)} placeholder={`${Math.round(kcalFrom(num(p), num(c), num(f)))}`} />
          <NumField label="P" value={p} onChange={typed(setP)} dot="#0ea5e9" />
          <NumField label="C" value={c} onChange={typed(setC)} dot="#f59e0b" />
          <NumField label="F" value={f} onChange={typed(setF)} dot="#ec4899" />
        </div>}
        <MealChips value={meal} onChange={setMeal} />
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface p-2 pl-3">
          <span className="text-sm text-muted">Day</span>
          <input type="date" value={day} onChange={(e) => isDay(e.target.value) && setDay(e.target.value)} className="h-10 rounded-lg bg-surface-2 px-2 text-base font-semibold text-ink outline-none" />
        </label>
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy || !name.trim() || macros.kcal < 0} onClick={() => run(() => updateLog(log.id, draft(), day))}>{busy ? 'Saving…' : `Save · ${fmtK(macros.kcal)} kcal`}</Button>
        {!log.saved_meal && (
          <Button variant="ghost" disabled={busy} onClick={() => run(() => createSaved(name, items && items.length > 1 ? 'meal' : 'food', items ?? [itemFromDraft(draft())]))}>Save to My meals</Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => run(() => addLogs([draft()], today()))}>{log.day === today() ? 'Log again' : 'Log again today'}</Button>
          <Button variant="danger" disabled={busy} onClick={async () => { if (await ask({ title: `Delete ${log.name}?`, body: `${dayLabel(log.day)} · ${fmtK(log.kcal)} kcal`,confirmLabel: 'Delete', danger: true })) run(() => deleteLog(log.id)) }}>Delete</Button>
        </div>
      </div>
    </BottomSheet>
  )
}
