import { useState } from 'react'
import { CloseIcon, PlusIcon } from '../icons'
import { BottomSheet, Button, Input } from '../ui'
import { itemFromDraft, itemsTotal, withServings } from '../../lib/meals'
import { today, type MealItem } from '../../lib/nutrition'
import { AddFood } from './AddFood'
import { fmtK, MacroLine, Stepper } from './bits'
import { useFoodAmount } from './FoodAmount'

/** Ingredient list of a meal: tap an item to edit it, change amounts, remove items, add more (search, scan, describe, or type macros). */
export function ItemsEditor({ items, onChange, open }: { items: MealItem[]; onChange: (items: MealItem[]) => void; open?: number }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(open ?? null)
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
            <button type="button" onClick={() => setEditing(i)} className="min-w-0 flex-1 text-left active:opacity-70" aria-label={`Edit ${it.name}`}>
              <span className="block truncate font-semibold">{it.name}</span>
              {it.detail && <span className="block truncate text-xs text-muted">{it.detail}</span>}
              <span className="flex min-w-0 items-center gap-2">
                <span className="num shrink-0 text-xs font-bold">{fmtK(it.macros.kcal)}</span>
                <MacroLine m={it.macros} className="shrink-0" />
              </span>
            </button>
            {it.base && <Stepper value={Math.round(it.servings * 100) / 100} onChange={(v) => set(i, withServings(it, v))} />}
            <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remove ${it.name}`}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-danger/15 text-danger"><CloseIcon width={16} height={16} /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setAdding(true)} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-bold text-accent">
        <PlusIcon width={18} height={18} />Add item
      </button>
      {editing !== null && items[editing] && (
        <ItemEditor key={editing} item={items[editing]} onClose={() => setEditing(null)}
          onSave={(it) => { set(editing, it); setEditing(null) }}
          onRemove={() => { onChange(items.filter((_, k) => k !== editing)); setEditing(null) }} />
      )}
      {adding && <AddFood day={today()} meal="snack" tab="search" title="Add to meal" onClose={() => setAdding(false)}
        collect={(ds) => onChange([...items, ...ds.map(itemFromDraft)])} />}
    </div>
  )
}

/** Edit one item inside a meal the same way as a single logged food: name, amount in any unit, or raw numbers. */
function ItemEditor({ item, onClose, onSave, onRemove }: { item: MealItem; onClose: () => void; onSave: (it: MealItem) => void; onRemove: () => void }) {
  const [name, setName] = useState(item.name)
  const amt = useFoodAmount({ servings: item.servings, base: item.base, macros: item.macros, detail: item.detail ?? '' })
  return (
    <BottomSheet title="Edit item" onClose={onClose}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Item name" />
        {amt.view}
        <Button disabled={!name.trim() || amt.macros.kcal < 0}
          onClick={() => onSave({ name: name.trim(), detail: amt.detail || undefined, servings: amt.servings, base: amt.base, macros: amt.macros })}>
          Done · {fmtK(amt.macros.kcal)} kcal
        </Button>
        <Button variant="danger" onClick={onRemove}>Remove from meal</Button>
      </div>
    </BottomSheet>
  )
}
