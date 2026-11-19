import { useState } from 'react'
import { BottomSheet, Button, ErrorText, Input } from '../ui'
import { ask } from '../Dialog'
import { addLogs, dayLabel, deleteLog, isDay, kcalFrom, logMacros, scale, servingText, today, updateLog, type Draft, type FoodLog, type Meal } from '../../lib/nutrition'
import { errMsg } from '../../lib/pb'
import { fmtK, MealChips, NumField, Stepper } from './bits'

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const str = (n: number) => (n ? `${Math.round(n * 10) / 10}` : '')

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

  const changeServings = (v: number) => {
    setServings(v)
    if (base) { const m = scale(base, v); setP(str(m.p)); setC(str(m.c)); setF(str(m.f)); setKcal(str(m.kcal)) }
  }
  const typed = (set: (v: string) => void) => (v: string) => { set(v); setBase(null) }
  const macros = { kcal: kcal.trim() ? Math.round(num(kcal)) : Math.round(kcalFrom(num(p), num(c), num(f))), p: num(p), c: num(c), f: num(f) }
  const draft = (): Draft => ({
    name, meal, servings: base ? servings : 1, base, macros, source: log.source,
    detail: base ? (log.detail.includes(' · ') ? `${log.detail.split(' · ')[0]} · ${servingText(servings, base)}` : servingText(servings, base)) : log.detail && !log.base ? log.detail : '',
    barcode: log.barcode,
  })
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); onChanged(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <BottomSheet title="Edit food" onClose={onClose}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Name" />
        {base && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-2 pl-3">
            <span className="min-w-0 truncate text-sm text-muted">Servings of <span className="font-semibold text-ink">{base.label}</span></span>
            <Stepper value={servings} onChange={changeServings} />
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          <NumField label="kcal" value={kcal} onChange={typed(setKcal)} placeholder={`${Math.round(kcalFrom(num(p), num(c), num(f)))}`} />
          <NumField label="P" value={p} onChange={typed(setP)} dot="#0ea5e9" />
          <NumField label="C" value={c} onChange={typed(setC)} dot="#f59e0b" />
          <NumField label="F" value={f} onChange={typed(setF)} dot="#ec4899" />
        </div>
        <MealChips value={meal} onChange={setMeal} />
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface p-2 pl-3">
          <span className="text-sm text-muted">Day</span>
          <input type="date" value={day} onChange={(e) => isDay(e.target.value) && setDay(e.target.value)} className="h-10 rounded-lg bg-surface-2 px-2 text-base font-semibold text-ink outline-none" />
        </label>
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy || !name.trim() || macros.kcal < 0} onClick={() => run(() => updateLog(log.id, draft(), day))}>{busy ? 'Saving…' : `Save · ${fmtK(macros.kcal)} kcal`}</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => run(() => addLogs([draft()], today()))}>{log.day === today() ? 'Log again' : 'Log again today'}</Button>
          <Button variant="danger" disabled={busy} onClick={async () => { if (await ask({ title: `Delete ${log.name}?`, body: `${dayLabel(log.day)} · ${fmtK(log.kcal)} kcal`,confirmLabel: 'Delete', danger: true })) run(() => deleteLog(log.id)) }}>Delete</Button>
        </div>
      </div>
    </BottomSheet>
  )
}
