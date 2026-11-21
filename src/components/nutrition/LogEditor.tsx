import { useState } from 'react'
import { BottomSheet, Button, ErrorText, Input } from '../ui'
import { ask } from '../Dialog'
import { addLogs, dayLabel, deleteLog, isDay, logMacros, today, updateLog, type Draft, type FoodLog, type Meal } from '../../lib/nutrition'
import { errMsg } from '../../lib/pb'
import { fmtK, MealChips } from './bits'
import { useFoodAmount } from './FoodAmount'
import { ItemsEditor } from './ItemsEditor'
import { createSaved, itemFromDraft, itemsTotal } from '../../lib/meals'
import type { MealItem } from '../../lib/nutrition'

/** Edit one logged food: amount (or raw numbers), meal, day; delete; or log it again today. */
export function LogEditor({ log, item, onClose, onChanged }: {
  log: FoodLog; onClose: () => void; onChanged: () => void
  /** Opens straight onto this item of a meal. */
  item?: number
}) {
  const [name, setName] = useState(log.name)
  const [meal, setMeal] = useState<Meal>(log.meal)
  const [day, setDay] = useState(log.day)
  const amt = useFoodAmount({ servings: log.servings, base: log.base, macros: logMacros(log), detail: log.detail })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // A logged meal is edited item by item; this copy belongs to this day only (the saved meal stays as it is).
  const [items, setItems] = useState<MealItem[] | null>(log.items?.length ? log.items : null)

  const macros = items ? itemsTotal(items) : amt.macros
  const draft = (): Draft => items ? ({
    name, meal, servings: 1, base: null, macros, source: log.source, detail: items.map((i) => i.name).join(', '), items, savedMeal: log.saved_meal,
  }) : ({
    name, meal, servings: amt.servings, base: amt.base, macros, source: log.source, detail: amt.detail, barcode: log.barcode,
  })
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); onChanged(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <BottomSheet title={items ? 'Edit meal' : 'Edit food'} onClose={onClose}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Name" />
        {items && <>
          <ItemsEditor items={items} onChange={setItems} open={item} />
          {log.saved_meal && <p className="px-1 text-xs text-faint">Changes here only affect this day. Edit the saved meal in Meals to change it for next time.</p>}
        </>}
        {!items && amt.view}
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
