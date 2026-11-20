import { useState } from 'react'
import { CloseIcon, PlusIcon } from '../icons'
import { itemFromDraft, itemsTotal, withServings } from '../../lib/meals'
import { today, type MealItem } from '../../lib/nutrition'
import { AddFood } from './AddFood'
import { fmtK, MacroLine, Stepper } from './bits'

/** Ingredient list of a meal: change amounts, remove items, add more (search, scan, describe, or type macros). */
export function ItemsEditor({ items, onChange }: { items: MealItem[]; onChange: (items: MealItem[]) => void }) {
  const [adding, setAdding] = useState(false)
  const total = itemsTotal(items)
  const set = (i: number, it: MealItem) => onChange(items.map((x, k) => (k === i ? it : x)))
  return (
    <div className="rounded-xl bg-surface">
      <div className="flex items-baseline justify-between px-3 pt-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">{items.length} item{items.length === 1 ? '' : 's'}</span>
        <span className="num text-sm font-bold">{fmtK(total.kcal)} kcal</span>
      </div>
      <ul className="divide-y divide-line px-3">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 py-2.5" data-item={it.name}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{it.name}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="num shrink-0 text-xs font-bold">{fmtK(it.macros.kcal)}</span>
                <MacroLine m={it.macros} className="shrink-0" />
              </span>
            </span>
            {it.base && <Stepper value={Math.round(it.servings * 100) / 100} onChange={(v) => set(i, withServings(it, v))} />}
            <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remove ${it.name}`}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-danger/15 text-danger"><CloseIcon width={16} height={16} /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setAdding(true)} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-bold text-accent">
        <PlusIcon width={18} height={18} />Add item
      </button>
      {adding && <AddFood day={today()} meal="snack" tab="search" title="Add to meal" onClose={() => setAdding(false)}
        collect={(ds) => onChange([...items, ...ds.map(itemFromDraft)])} />}
    </div>
  )
}
