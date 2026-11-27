import type { RecordModel } from 'pocketbase'
import { add, addLogs, scale, servingText, ZERO, type Draft, type FoodLog, type Macros, type Meal, type MealItem } from './nutrition'
import { idbGet, idbSet } from './idb'
import { me, newId, pb } from './pb'
import { enqueue, pending } from './outbox'

/** A saved meal (several items) or food (one item) for one-tap logging. Logging copies it, so day edits never touch it. */
export interface SavedMeal extends RecordModel { user: string; name: string; kind: 'meal' | 'food'; items: MealItem[] | null; uses: number }

export const itemsTotal = (items: MealItem[]): Macros => items.reduce((t, i) => add(t, i.macros), ZERO)
export const itemFromDraft = (d: Draft): MealItem => ({ name: d.name, detail: d.detail ?? servingText(d.servings, d.base), servings: d.servings, base: d.base, macros: d.macros })
/** Items a log is made of: its own list for meals, or itself as a single item. */
export const itemsOfLog = (l: FoodLog): MealItem[] =>
  l.items?.length ? l.items : [{ name: l.name, detail: l.detail, servings: l.servings, base: l.base, macros: { kcal: l.kcal, p: l.protein_g, c: l.carbs_g, f: l.fat_g } }]
/** Re-measures an item with a known serving; items typed as raw numbers keep their macros. */
export const withServings = (i: MealItem, servings: number): MealItem =>
  i.base ? { ...i, servings, detail: servingText(servings, i.base), macros: scale(i.base, servings) } : i

// Saved meals live on the device too: the list opens instantly and creating, editing, deleting and logging them work
// offline (changes upload in the background, see outbox).
const COLL = 'saved_meals'
const skey = (u: string) => `saved:${u}`
let list: SavedMeal[] | null = null
let listFor = ''
const sortList = (l: SavedMeal[]) => [...l].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
async function local() {
  if (!list || listFor !== me()) { listFor = me(); list = (await idbGet<SavedMeal[]>(skey(listFor))) ?? [] }
  return list
}
const keep = (l: SavedMeal[]) => { list = sortList(l); idbSet(skey(listFor), list); return list }

/** Saved meals on this device (instant; may be a little out of date). */
export const cachedSaved = async () => sortList(await local())

/** Saved meals from the server (with changes not uploaded yet laid over). Offline: the device's copy. */
export async function loadSaved(): Promise<SavedMeal[]> {
  let server: SavedMeal[]
  try { server = await pb.collection(COLL).getFullList<SavedMeal>({ filter: pb.filter('user = {:u}', { u: me() }), sort: '-uses,name', requestKey: null }) }
  catch (e) { if ((e as { status?: number })?.status === 0) return cachedSaved(); throw e }
  const byId = new Map(server.map((m) => [m.id, m]))
  const mine = new Map((await local()).map((m) => [m.id, m]))
  for (const op of await pending(COLL)) {
    if (op.kind === 'delete') byId.delete(op.id)
    else if (op.kind === 'create') { const m = mine.get(op.id); if (m) byId.set(op.id, m) }
    else { const m = byId.get(op.id) ?? mine.get(op.id); if (m) byId.set(op.id, { ...m, ...op.body, uses: m.uses } as SavedMeal) }
  }
  return keep([...byId.values()])
}

export async function createSaved(name: string, kind: SavedMeal['kind'], items: MealItem[]): Promise<SavedMeal> {
  const body = { user: me(), name: name.trim().slice(0, 120), kind, items, uses: 0 }
  const m = { ...body, id: newId(), collectionId: '', collectionName: COLL } as SavedMeal
  keep([...(await local()), m])
  enqueue({ kind: 'create', coll: COLL, id: m.id, body })
  return m
}
export async function updateSaved(id: string, patch: Partial<Pick<SavedMeal, 'name' | 'items' | 'kind'>>) {
  keep((await local()).map((m) => (m.id === id ? { ...m, ...patch } : m)))
  enqueue({ kind: 'update', coll: COLL, id, body: patch })
}
export async function deleteSaved(id: string) {
  keep((await local()).filter((m) => m.id !== id))
  enqueue({ kind: 'delete', coll: COLL, id })
}

/** Draft for logging a saved meal: one entry that carries its own copy of the items. */
export function savedDraft(s: SavedMeal, meal: Meal): Draft {
  const items = s.items ?? []
  if (s.kind === 'food' && items.length === 1) {
    const i = items[0]
    return { name: s.name, detail: i.detail, meal, servings: i.servings, base: i.base, macros: i.macros, source: 'saved', savedMeal: s.id }
  }
  return { name: s.name, detail: items.map((i) => i.name).join(', '), meal, servings: 1, base: null, macros: itemsTotal(items), source: 'saved', items, savedMeal: s.id }
}

export async function logSaved(s: SavedMeal, meal: Meal, day: string) {
  const logs = await addLogs([savedDraft(s, meal)], day)
  keep((await local()).map((m) => (m.id === s.id ? { ...m, uses: m.uses + 1 } : m)))
  enqueue({ kind: 'update', coll: COLL, id: s.id, body: { 'uses+': 1 } })
  return logs
}
