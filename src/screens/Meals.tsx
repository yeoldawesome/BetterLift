import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ask } from '../components/Dialog'
import { BookIcon, CheckIcon, PlusIcon } from '../components/icons'
import { fmtK, MacroLine } from '../components/nutrition/bits'
import { ItemsEditor } from '../components/nutrition/ItemsEditor'
import { BottomSheet, Button, Card, Empty, ErrorText, Input, Screen, Segmented, Spinner } from '../components/ui'
import { createSaved, deleteSaved, itemsTotal, loadSaved, logSaved, updateSaved, type SavedMeal } from '../lib/meals'
import { mealNow, MEALS, today, type Meal, type MealItem } from '../lib/nutrition'
import { errMsg } from '../lib/pb'

type Kind = SavedMeal['kind']

/** Saved meals & foods: build them once, then log with one tap. Logging makes a copy you can tweak for that day. */
export default function Meals() {
  const nav = useNavigate()
  const [list, setList] = useState<SavedMeal[] | null>(null)
  const [kind, setKind] = useState<Kind>('meal')
  const [editing, setEditing] = useState<SavedMeal | { new: true; kind: Kind } | null>(null)
  const [logging, setLogging] = useState<SavedMeal | null>(null)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const reload = () => loadSaved().then(setList).catch((e) => { setErr(errMsg(e)); setList((l) => l ?? []) })
  useEffect(() => { reload() }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t) }, [toast])

  const shown = list?.filter((m) => m.kind === kind) ?? []
  const log = async (m: SavedMeal, meal: Meal) => {
    setLogging(null)
    try { await logSaved(m, meal, today()); setToast(`Added ${m.name} to ${MEALS.find(([k]) => k === meal)![1].toLowerCase()}`) } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <Screen title="Meals" back action={<Button size="sm" onClick={() => setEditing({ new: true, kind })}>+ New</Button>}>
      <Segmented value={kind} onChange={setKind} options={[['meal', 'Meals'], ['food', 'Foods']]} />
      <ErrorText>{err}</ErrorText>
      {toast && (
        <button onClick={() => nav('/nutrition')} className="flex w-full items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-left text-sm font-bold text-accent">
          <CheckIcon width={16} height={16} className="shrink-0" /><span className="flex-1">{toast}</span><span className="text-xs">View day</span>
        </button>
      )}
      {!list ? <Spinner /> : !shown.length ? (
        <Empty title={kind === 'meal' ? 'No saved meals' : 'No saved foods'}
          body={kind === 'meal' ? 'Save the meals you eat often, like a burrito bowl with all its toppings, and log them in one tap.' : 'Save single foods with your usual amount for one-tap logging.'}>
          <Button onClick={() => setEditing({ new: true, kind })}>Create {kind}</Button>
        </Empty>
      ) : shown.map((m) => {
        const t = itemsTotal(m.items ?? [])
        return (
          <Card key={m.id} className="flex items-center gap-3 !p-3" data-saved={m.name}>
            <button onClick={() => setEditing(m)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><BookIcon width={22} height={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{m.name}</span>
                <span className="block truncate text-xs text-muted">{m.kind === 'meal' ? (m.items ?? []).map((i) => i.name).join(', ') : m.items?.[0]?.detail}</span>
                <span className="mt-0.5 flex items-center gap-2"><span className="num text-sm font-black">{fmtK(t.kcal)} kcal</span><MacroLine m={t} /></span>
              </span>
            </button>
            <button onClick={() => setLogging(m)} aria-label={`Log ${m.name}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink active:scale-95">
              <PlusIcon width={20} height={20} />
            </button>
          </Card>
        )
      })}

      {logging && (
        <BottomSheet title={`Log ${logging.name}`} onClose={() => setLogging(null)}>
          <div className="grid grid-cols-2 gap-2">
            {MEALS.map(([k, l]) => (
              <Button key={k} variant={k === mealNow() ? 'primary' : 'ghost'} onClick={() => log(logging, k)}>{l}</Button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-faint">Adds a copy to today. Tap it in your day to tweak it (e.g. no queso) without changing this saved meal.</p>
        </BottomSheet>
      )}
      {editing && <MealEditor meal={'new' in editing ? null : editing} kind={'new' in editing ? editing.kind : editing.kind} onClose={() => setEditing(null)} onSaved={reload} />}
    </Screen>
  )
}

function MealEditor({ meal, kind: kind0, onClose, onSaved }: { meal: SavedMeal | null; kind: Kind; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(meal?.name ?? '')
  const [items, setItems] = useState<MealItem[]>(meal?.items ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const kind: Kind = items.length > 1 ? 'meal' : kind0
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); onSaved(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const save = () => run(() => meal ? updateSaved(meal.id, { name: name.trim(), items, kind }) : createSaved(name || items[0]?.name || 'Meal', kind, items))
  return (
    <BottomSheet title={meal ? `Edit ${kind}` : `New ${kind}`} onClose={onClose}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={kind === 'meal' ? 'Name, e.g. Chipotle burrito' : 'Name, e.g. Morning oats'} aria-label="Meal name" />
        <ItemsEditor items={items} onChange={setItems} />
        {meal && <p className="px-1 text-xs text-faint">Changes apply the next time you log it. Days you already logged keep their own copy.</p>}
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy || !items.length || !(name.trim() || items[0]?.name)} onClick={save}>{busy ? 'Saving…' : `Save ${kind} · ${fmtK(itemsTotal(items).kcal)} kcal`}</Button>
        {meal && <Button variant="danger" disabled={busy} onClick={async () => { if (await ask({ title: `Delete ${meal.name}?`, body: 'Days you already logged it keep their copy.', confirmLabel: 'Delete', danger: true })) run(() => deleteSaved(meal.id)) }}>Delete</Button>}
      </div>
    </BottomSheet>
  )
}
