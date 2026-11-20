import type { RecordModel } from 'pocketbase'
import { add, addLogs, scale, servingText, ZERO, type Draft, type FoodLog, type Macros, type Meal, type MealItem } from './nutrition'
import { me, pb } from './pb'

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

const col = () => pb.collection('saved_meals')
export const loadSaved = () => col().getFullList<SavedMeal>({ filter: pb.filter('user = {:u}', { u: me() }), sort: '-uses,name' })
export const createSaved = (name: string, kind: SavedMeal['kind'], items: MealItem[]) => col().create<SavedMeal>({ user: me(), name: name.trim().slice(0, 120), kind, items, uses: 0 })
export const updateSaved = (id: string, patch: Partial<Pick<SavedMeal, 'name' | 'items' | 'kind'>>) => col().update<SavedMeal>(id, patch)
export const deleteSaved = (id: string) => col().delete(id)

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
  col().update(s.id, { 'uses+': 1 }).catch(() => {})
  return logs
}
