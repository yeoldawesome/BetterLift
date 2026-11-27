import type { RecordModel } from 'pocketbase'
import { useEffect, useState } from 'react'
import { bmr, type Person } from './energy'
import { idbGet, idbSet } from './idb'
import { me, newId, pb, type User } from './pb'
import { enqueue, pending as pendingOps } from './outbox'

// ---------- Days ----------

const pad = (n: number) => `${n}`.padStart(2, '0')
/** Local calendar day as YYYY-MM-DD. */
export const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d) }
export const today = () => dayStr(new Date())
export const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s).getTime())
/** "Today", "Yesterday", "Tomorrow", else "Tue, Nov 18" (plus the year when it isn't this year). */
export function dayLabel(s: string) {
  const t = today()
  if (s === t) return 'Today'
  if (s === addDays(t, -1)) return 'Yesterday'
  if (s === addDays(t, 1)) return 'Tomorrow'
  const d = parseDay(s)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

// ---------- Food logs ----------

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: [Meal, string][] = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snacks']]
export type Macros = { kcal: number; p: number; c: number; f: number }
/** One serving of a food. g = grams (or ml) in the serving, when known. */
export type Serving = Macros & { label: string; g?: number }
export type Source = 'quick' | 'text' | 'estimate' | 'search' | 'barcode' | 'recent' | 'saved'
/** One ingredient of a logged (or saved) meal: macros are for `servings` of `base` when it's set. */
export type MealItem = { name: string; detail?: string; servings: number; base: Serving | null; macros: Macros }

export interface FoodLog extends RecordModel {
  user: string; day: string; meal: Meal; name: string; detail: string; servings: number; base: Serving | null
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; source: Source; barcode: string
  /** Ingredients when this entry is a meal; edits here change only this day's copy. */
  items?: MealItem[] | null; saved_meal?: string
}
export type Draft = { name: string; detail?: string; meal: Meal; servings: number; base: Serving | null; macros: Macros; source: Source; barcode?: string; items?: MealItem[]; savedMeal?: string }

export const ZERO: Macros = { kcal: 0, p: 0, c: 0, f: 0 }
export const kcalFrom = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9
const r1 = (n: number) => Math.round(n * 10) / 10
export const scale = (m: Macros, k: number): Macros => ({ kcal: Math.round(m.kcal * k), p: r1(m.p * k), c: r1(m.c * k), f: r1(m.f * k) })
export const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f })
export const logMacros = (l: Pick<FoodLog, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>): Macros => ({ kcal: l.kcal, p: l.protein_g, c: l.carbs_g, f: l.fat_g })
export const sumLogs = (ls: FoodLog[]) => ls.reduce((t, l) => add(t, logMacros(l)), ZERO)

/** "1.5 × 1 cup" style detail line. */
export function servingText(servings: number, base: Serving | null) {
  if (!base) return ''
  const n = r1(servings)
  return n === 1 ? base.label : `${n} × ${base.label}`
}

/** Meal that fits the current time of day. */
export function mealNow(d = new Date()): Meal {
  const h = d.getHours() + d.getMinutes() / 60
  return h >= 4 && h < 10.5 ? 'breakfast' : h < 14.5 ? 'lunch' : h < 17 ? 'snack' : h < 21.5 ? 'dinner' : 'snack'
}

const toRecord = (d: Draft, day: string) => ({
  user: me(), day, meal: d.meal, name: d.name.trim().slice(0, 120) || 'Quick add', detail: (d.detail ?? servingText(d.servings, d.base)).slice(0, 160),
  // Kept precise so an amount re-measured in grams/cups reads back exactly (200 g, not 205 g).
  servings: Math.round(d.servings * 1000) / 1000 || 1, base: d.base, kcal: Math.max(0, Math.round(d.macros.kcal)), protein_g: Math.max(0, r1(d.macros.p)),
  carbs_g: Math.max(0, r1(d.macros.c)), fat_g: Math.max(0, r1(d.macros.f)), source: d.source, barcode: d.barcode ?? '',
  items: d.items?.length ? d.items : null, saved_meal: d.savedMeal ?? '',
})

// ---------- Food logs: on the device first, uploaded in the background (works offline) ----------

/** Every food log this device has seen, by id (memory + IndexedDB), so days open instantly and logging works offline. */
let store: Map<string, FoodLog> | null = null
let storeFor = ''
const storeKey = (u: string) => `foodlogs:${u}`
async function logStore() {
  const u = me()
  if (!store || storeFor !== u) {
    storeFor = u
    store = new Map(((await idbGet<FoodLog[]>(storeKey(u))) ?? []).map((l) => [l.id, l]))
  }
  return store
}
let saveT: ReturnType<typeof setTimeout> | undefined
const saveStore = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (store) idbSet(storeKey(storeFor), [...store.values()]) }, 200) }
const byDay = (a: FoodLog, b: FoodLog) => a.day.localeCompare(b.day) || (a.created ?? '').localeCompare(b.created ?? '')

/** Lay changes that haven't uploaded yet over what the server sent. */
async function overlay(server: FoodLog[]) {
  const ops = await pendingOps('food_logs')
  const out = new Map(server.map((l) => [l.id, l]))
  const st = await logStore()
  for (const op of ops) {
    if (op.kind === 'delete') out.delete(op.id)
    else if (op.kind === 'create') { const l = st.get(op.id); if (l) out.set(op.id, l) }
    else { const l = out.get(op.id) ?? st.get(op.id); if (l) out.set(op.id, { ...l, ...op.body } as FoodLog) }
  }
  return [...out.values()]
}

/** Logs on this device for a range of days (instant; may be out of date until loadLogs refreshes). */
export async function cachedLogs(from: string, to: string): Promise<FoodLog[]> {
  const st = await logStore()
  return [...st.values()].filter((l) => l.day >= from && l.day <= to).sort(byDay)
}

/** Logs for a range of days from the server (plus anything not uploaded yet). Offline: the device's copy. */
export async function loadLogs(from: string, to: string): Promise<FoodLog[]> {
  let server: FoodLog[]
  try {
    server = await pb.collection('food_logs').getFullList<FoodLog>({ filter: pb.filter('user = {:u} && day >= {:a} && day <= {:b}', { u: me(), a: from, b: to }), sort: 'day,created', batch: 1000, requestKey: null })
  } catch (e) {
    if ((e as { status?: number })?.status === 0) return cachedLogs(from, to)
    throw e
  }
  const merged = await overlay(server)
  const st = await logStore()
  for (const [id, l] of st) if (l.day >= from && l.day <= to) st.delete(id)
  for (const l of merged) st.set(l.id, l)
  saveStore()
  return merged.sort(byDay)
}

const localLog = (d: Draft, day: string): FoodLog => {
  const now = new Date().toISOString().replace('T', ' ')
  return { ...toRecord(d, day), id: newId(), collectionId: '', collectionName: 'food_logs', created: now, updated: now } as unknown as FoodLog
}

/** Log foods: saved on the device and shown at once; uploaded when there's a connection. */
export async function addLogs(drafts: Draft[], day: string): Promise<FoodLog[]> {
  const st = await logStore()
  const logs = drafts.map((d) => localLog(d, day))
  for (const l of logs) {
    st.set(l.id, l)
    const { id, collectionId: _c, collectionName: _n, created: _cr, updated: _u, ...body } = l
    enqueue({ kind: 'create', coll: 'food_logs', id, body })
  }
  saveStore()
  return logs
}
export async function updateLog(id: string, d: Draft, day: string) {
  const { user: _u, ...rest } = toRecord(d, day)
  const st = await logStore()
  const cur = st.get(id)
  const next = { ...(cur ?? {}), ...rest, id } as FoodLog
  st.set(id, next); saveStore()
  enqueue({ kind: 'update', coll: 'food_logs', id, body: rest })
  return next
}
export async function deleteLog(id: string) {
  const st = await logStore()
  st.delete(id); saveStore()
  enqueue({ kind: 'delete', coll: 'food_logs', id })
}

/** Recently logged foods (newest first), one per name + serving, for quick re-logging. From the device (instant); refreshed in the background. */
export async function recentFoods(limit = 60): Promise<FoodLog[]> {
  const st = await logStore()
  const pick = (ls: FoodLog[]) => {
    const seen = new Set<string>(), out: FoodLog[] = []
    for (const l of ls) {
      const k = `${l.name.toLowerCase()}|${l.base?.label ?? l.kcal}`
      // Unnamed entries ("Quick add", from Quick or a typed macro sentence) aren't useful to re-pick.
      if (seen.has(k) || l.name === 'Quick add') continue
      seen.add(k); out.push(l)
      if (out.length >= limit) break
    }
    return out
  }
  const fetchRecent = () => pb.collection('food_logs').getList<FoodLog>(1, 300, { filter: pb.filter('user = {:u}', { u: me() }), sort: '-created', requestKey: null })
    .then((r) => { for (const l of r.items) if (!st.has(l.id)) st.set(l.id, l); saveStore(); return r.items })
  const local = [...st.values()].sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))
  if (local.length >= 20) { fetchRecent().catch(() => {}); return pick(local) }
  try { return pick(await fetchRecent()) } catch { return pick(local) }
}

// ---------- Goals ----------

/** track = no daily targets, just log what you eat. */
export type Goal = 'cut' | 'maintain' | 'bulk' | 'track'
export type Settings = {
  setUp: boolean
  goal: Goal
  /** Target weight change, % of bodyweight per week (always positive). */
  rate: number
  /** Non-exercise activity multiplier on BMR (workouts are added on top, per day). */
  activity: number
  birthYear: number
  proteinPerKg: number
  /** Share of (non-exercise) calories from fat. */
  fatPct: number
  /** Share of exercise calories added back to the day's target. */
  eatBack: number
  countLifting: boolean
  /** Fixed daily calories instead of expenditure ± goal (0 = off). */
  kcalOverride: number
  /** Correction to the formula's expenditure, from the weekly pace check. */
  tdeeAdjust: number
  /** When a pace suggestion was last applied or dismissed (ms). The next check only uses weigh-ins after it. */
  lastCheckAt: number
  /** Weight you're cutting or bulking toward, in kg (0 = none set). */
  goalKg: number
}
export const DEFAULT_SETTINGS: Settings = {
  setUp: false, goal: 'maintain', rate: 0.5, activity: 1.375, birthYear: 0, proteinPerKg: 1.8, fatPct: 0.27, eatBack: 0, countLifting: true, kcalOverride: 0, tdeeAdjust: 0, lastCheckAt: 0, goalKg: 0,
}

export type GoalProgress = {
  goalKg: number
  /** kg still to lose (cut) or gain (bulk); ≤ 0 once reached. */
  leftKg: number
  reached: boolean
  /** Goal is on the wrong side of your weight (e.g. cutting to a heavier weight). */
  wrongWay: boolean
  /** Estimated weeks to go at your planned pace, and the day you'd get there. */
  weeks: number
  eta: string
}

/** "Mar 14" (with the year when it isn't this year), for a goal's estimated date. */
export const fmtEta = (day: string) => {
  const d = parseDay(day)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

/** How far you are from your goal weight while cutting or bulking. Null when there's no goal weight or you're not cutting/bulking. */
export function goalProgress(s: Settings, kg: number, now = new Date()): GoalProgress | null {
  if (!s.goalKg || (s.goal !== 'cut' && s.goal !== 'bulk')) return null
  const dir = s.goal === 'cut' ? -1 : 1
  const leftKg = (s.goalKg - kg) * dir
  // Within ~0.25 kg counts as there (scale noise).
  const reached = leftKg <= 0.25
  const wrongWay = leftKg < -2
  const perWk = Math.abs(weeklyChangeKg(s, kg))
  const weeks = reached || !perWk ? 0 : Math.ceil(leftKg / perWk)
  const end = new Date(now); end.setDate(end.getDate() + weeks * 7)
  return { goalKg: s.goalKg, leftKg, reached, wrongWay, weeks, eta: dayStr(end) }
}
export const GOALS: [Goal, string][] = [['cut', 'Cut'], ['maintain', 'Maintain'], ['bulk', 'Bulk'], ['track', 'Just track']]
export const RATES: Record<'cut' | 'bulk', { v: number; label: string; hint: string }[]> = {
  cut: [
    { v: 0.25, label: 'Gentle', hint: 'Easiest to sustain; keeps the most strength.' },
    { v: 0.5, label: 'Moderate', hint: 'A good default for most lifters.' },
    { v: 0.75, label: 'Aggressive', hint: 'Faster, but expect training to suffer a bit.' },
    { v: 1, label: 'Very aggressive', hint: 'Short stints only. Harder to keep muscle.' },
  ],
  bulk: [
    { v: 0.1, label: 'Lean', hint: 'Slow gain, minimal fat. Best for experienced lifters.' },
    { v: 0.25, label: 'Moderate', hint: 'Steady muscle gain with some fat.' },
    { v: 0.5, label: 'Aggressive', hint: 'Fastest gains for newer lifters; more fat.' },
  ],
}
export const ACTIVITY: { v: number; label: string; hint: string }[] = [
  { v: 1.2, label: 'Mostly sitting', hint: 'Desk job, under ~5k steps a day' },
  { v: 1.375, label: 'Lightly active', hint: 'On your feet some, ~5–8k steps' },
  { v: 1.55, label: 'Active', hint: 'On your feet most of the day, ~8–12k steps' },
  { v: 1.725, label: 'Very active', hint: 'Physical job, 12k+ steps' },
]
/** Protein presets in g per kg (shown per lb for lb users). */
export const PROTEIN = [1.6, 1.8, 2.0, 2.2, 2.6]
export const proteinDefault = (g: Goal) => (g === 'cut' ? 2.2 : g === 'bulk' ? 1.8 : 1.8)
export const KCAL_PER_KG = 7700

export interface Profile extends RecordModel { user: string; settings: Partial<Settings> | null }

// Module cache so every screen shares one copy of the settings.
let cache: { id: string; s: Settings } | null = null
let pending: Promise<{ id: string; s: Settings }> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export function loadSettings(force = false): Promise<{ id: string; s: Settings }> {
  if (cache && !force) return Promise.resolve(cache)
  if (pending && !force) return pending
  const uid = me()
  pending = pb.collection('nutrition_profiles').getFirstListItem<Profile>(pb.filter('user = {:u}', { u: uid }), { requestKey: null })
    .then((r) => ({ id: r.id, s: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) } }))
    .catch(async (e) => {
      if (e?.status === 404) return { id: '', s: { ...DEFAULT_SETTINGS } }
      // Offline: the copy saved on this device.
      const saved = e?.status === 0 ? await idbGet<{ id: string; s: Settings }>(`nutrition:${uid}`) : undefined
      if (saved) return { id: saved.id, s: { ...DEFAULT_SETTINGS, ...saved.s } }
      throw e
    })
    .then((v) => { if (me() === uid) { cache = v; idbSet(`nutrition:${uid}`, v); emit() } return v })
    .finally(() => { pending = null })
  return pending
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = cache ?? await loadSettings()
  const s = { ...cur.s, ...patch, setUp: true }
  // Saved on the device at once; uploaded when there's a connection (a first save creates the profile with its id).
  const id = cur.id || newId()
  cache = { id, s }; idbSet(`nutrition:${me()}`, cache); emit()
  if (cur.id) enqueue({ kind: 'update', coll: 'nutrition_profiles', id, body: { settings: s } })
  else enqueue({ kind: 'create', coll: 'nutrition_profiles', id, body: { user: me(), settings: s } })
  return s
}

// Drop cached data only when a different account signs in (onChange also fires when your own user record is saved).
let cachedFor = pb.authStore.record?.id ?? ''
pb.authStore.onChange((_t, r) => {
  const id = r?.id ?? ''
  if (id === cachedFor) return emit()
  cachedFor = id; cache = null; weightCache = null; emit()
  if (id) { loadSettings().catch(() => {}); loadWeight().catch(() => {}) }
})

/** Shared settings + the person they apply to. Re-renders when either changes. */
export function useNutrition(user: User | null) {
  const [, tick] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => {
    const f = () => tick((t) => t + 1)
    listeners.add(f)
    loadSettings().catch((e) => setErr(e?.message || 'Could not load your nutrition goals.'))
    loadWeight().catch(() => {})
    return () => { listeners.delete(f) }
  }, [])
  const s = cache?.s ?? null
  const person = user && s ? personFor(user, s) : null
  return { settings: s, person, weight: weightCache, err }
}

// ---------- Bodyweight ----------

type Weigh = { measured_at: string; weight_kg: number }
export type WeightInfo = { kg: number; from: 'scale' | 'profile'; weighIns: { t: number; kg: number }[] }
let weightCache: WeightInfo | null = null

/** Recent weigh-ins (body_metrics: RENPHO imports + weigh-ins logged here). */
export async function loadWeight(force = false): Promise<WeightInfo | null> {
  if (weightCache && !force) return weightCache
  const since = new Date(Date.now() - 120 * 864e5)
  const u = me()
  let weighIns: { t: number; kg: number }[]
  try {
    const rows = await pb.collection('body_metrics').getFullList<Weigh>({
      filter: pb.filter('user = {:u} && measured_at >= {:s} && weight_kg > 0', { u, s: since }), fields: 'id,measured_at,weight_kg', sort: 'measured_at', requestKey: null,
    })
    // Weigh-ins logged on this device that haven't uploaded yet still count.
    const ids = new Set(rows.map((r) => (r as Weigh & { id: string }).id))
    const waiting = (await pendingOps('body_metrics'))
      .flatMap((o) => (o.kind === 'create' && !ids.has(o.id) ? [{ t: new Date(String(o.body.measured_at)).getTime(), kg: Number(o.body.weight_kg) }] : []))
    weighIns = [...rows.map((r) => ({ t: new Date(r.measured_at).getTime(), kg: r.weight_kg })), ...waiting].sort((a, b) => a.t - b.t)
    idbSet(`weighins:${u}`, weighIns)
  } catch (e) {
    if ((e as { status?: number })?.status !== 0) throw e
    weighIns = weightCache?.weighIns ?? (await idbGet<{ t: number; kg: number }[]>(`weighins:${u}`)) ?? []
  }
  // Smooth day-to-day water swings: average of the last week's readings, if there are any in the last two weeks.
  const last = weighIns[weighIns.length - 1]
  let kg = 0
  if (last && Date.now() - last.t < 14 * 864e5) {
    const week = weighIns.filter((w) => w.t > last.t - 7 * 864e5)
    kg = week.reduce((t, w) => t + w.kg, 0) / week.length
  }
  weightCache = { kg, from: kg ? 'scale' : 'profile', weighIns }
  emit()
  return weightCache
}

/**
 * Log a weigh-in on a day at a time of day ("HH:MM"; defaults to now today, 8:00 on other days). Stored with your body
 * stats (so it shows on Stats → Physique next to scale imports); the newest one also becomes your profile bodyweight.
 */
export async function logWeighIn(kg: number, day?: string, time?: string) {
  const r = Math.round(kg * 100) / 100
  const [h, m] = (time ?? '').split(':').map(Number)
  const when = Number.isFinite(h) && time
    ? new Date(parseDay(day ?? today()).getTime() + (h * 60 + (m || 0)) * 60e3)
    : !day || day === today() ? new Date() : new Date(parseDay(day).getTime() + 8 * 3600e3)
  // Saved on the device and shown at once; uploaded when there's a connection.
  enqueue({ kind: 'create', coll: 'body_metrics', id: newId(), body: { user: me(), measured_at: when.toISOString(), weight_kg: r, source: 'manual' } })
  const prev = weightCache?.weighIns ?? []
  const newest = !prev.length || when.getTime() >= prev[prev.length - 1].t
  if (newest) {
    enqueue({ kind: 'update', coll: 'users', id: me(), body: { bodyweight_kg: r } })
    // Your profile bodyweight updates right away on this device too.
    const rec = pb.authStore.record
    if (rec) pb.authStore.save(pb.authStore.token, { ...rec, bodyweight_kg: r })
  }
  const weighIns = [...prev, { t: when.getTime(), kg: r }].sort((a, b) => a.t - b.t)
  const last = weighIns[weighIns.length - 1]
  const week = weighIns.filter((w) => w.t > last.t - 7 * 864e5)
  weightCache = { kg: week.reduce((t, w) => t + w.kg, 0) / week.length, from: 'scale', weighIns }
  idbSet(`weighins:${me()}`, weighIns)
  emit()
  loadWeight(true).catch(() => {})
}

export const ageOf = (s: Settings) => (s.birthYear > 1900 ? new Date().getFullYear() - s.birthYear : 0)

export function personFor(user: Pick<User, 'bodyweight_kg' | 'height_cm' | 'sex'>, s: Settings): Person {
  const age = ageOf(s)
  const kg = weightCache?.kg || user.bodyweight_kg || 75
  return { kg, cm: user.height_cm || 175, age: age || 30, ageKnown: age > 0, sex: user.sex || '' }
}

// ---------- Targets ----------

export type Targets = {
  bmr: number
  /** Formula expenditure before exercise: BMR × activity (+ trend correction). */
  baseline: number
  goalDelta: number
  /** Calories before exercise. */
  base: number
  exerciseBurn: number
  /** Exercise calories added back (burn × eat-back). */
  exercise: number
  kcal: number; p: number; c: number; f: number
  floorHit: boolean
}

export function weeklyChangeKg(s: Settings, kg: number) {
  return s.goal === 'maintain' || s.goal === 'track' ? 0 : (s.goal === 'cut' ? -1 : 1) * (s.rate / 100) * kg
}

export function computeTargets(s: Settings, p: Person, burn = 0): Targets {
  const b = Math.round(bmr(p))
  const baseline = Math.round(b * s.activity + s.tdeeAdjust)
  const goalDelta = Math.round((weeklyChangeKg(s, p.kg) * KCAL_PER_KG) / 7)
  let base = s.kcalOverride > 0 ? s.kcalOverride : baseline + goalDelta
  // Don't plan below resting burn (or common minimums) without an explicit override.
  const floor = Math.max(b, p.sex === 'female' ? 1200 : 1500)
  const floorHit = !s.kcalOverride && base < floor
  if (floorHit) base = floor
  base = Math.round(base)
  const exercise = Math.round(burn * s.eatBack)
  const pG = Math.round(s.proteinPerKg * p.kg)
  const fG = Math.round(Math.max((s.fatPct * base) / 9, 0.6 * p.kg))
  // Carbs fill what's left; exercise calories go to carbs (the fuel they mostly burn).
  const cG = Math.round(Math.max(0, base - pG * 4 - fG * 9) / 4 + exercise / 4)
  return { bmr: b, baseline, goalDelta, base, exerciseBurn: Math.round(burn), exercise, kcal: base + exercise, p: pG, c: cG, f: fG, floorHit }
}

// ---------- Weekly pace check ----------

export type PaceCheck =
  | { status: 'off' }
  | { status: 'waiting'; reason: string; weighIns: number; days: number }
  | { status: 'on-track'; actualKgWk: number; goalKgWk: number; days: number }
  | { status: 'adjust'; actualKgWk: number; goalKgWk: number; days: number; delta: number; why: 'slow-gain' | 'fast-gain' | 'slow-loss' | 'fast-loss' | 'drift-up' | 'drift-down' }

/** Least-squares slope (kg per day). */
function slope(pts: { t: number; kg: number }[]) {
  const n = pts.length, xs = pts.map((p) => p.t / 864e5), mx = xs.reduce((a, b) => a + b, 0) / n, my = pts.reduce((a, p) => a + p.kg, 0) / n
  let num = 0, den = 0
  pts.forEach((p, i) => { num += (xs[i] - mx) * (p.kg - my); den += (xs[i] - mx) ** 2 })
  return den ? num / den : 0
}

export const PACE_MIN_DAYS = 7

/**
 * Compares how fast your weight is actually moving (weigh-ins over the last 1–3 weeks, since your last adjustment)
 * with your goal pace, and suggests a calorie change when they're clearly apart:
 * bulking with no gain → eat more; gaining too fast → eat less; same for cutting; maintaining but drifting → nudge back.
 * Changes are gradual (half the measured gap, 100–300 kcal) because a week of scale data includes water noise.
 */
export function paceCheck(s: Settings, weighIns: { t: number; kg: number }[], kg: number, now = Date.now()): PaceCheck {
  if (s.goal === 'track') return { status: 'off' }
  const since = Math.max(now - 21 * 864e5, s.lastCheckAt || 0)
  const pts = weighIns.filter((w) => w.t >= since && w.t <= now)
  const days = pts.length ? (pts[pts.length - 1].t - pts[0].t) / 864e5 : 0
  if (pts.length < 2 || days < PACE_MIN_DAYS - 0.5) {
    const sinceChange = s.lastCheckAt && now - s.lastCheckAt < PACE_MIN_DAYS * 864e5
    return {
      status: 'waiting', weighIns: pts.length, days,
      reason: sinceChange ? `Checking your pace again a week after your last change.` : `Weigh in a few times over ${PACE_MIN_DAYS} days and we'll check your pace.`,
    }
  }
  const actual = slope(pts) * 7
  const goal = weeklyChangeKg(s, kg)
  const gap = goal - actual // kg/week; positive = you need more food
  // Ignore small differences: ~0.15% bodyweight/week (≈ 0.25 lb at 170 lb) is within scale noise.
  const tolerance = Math.max(0.1, 0.0015 * kg) * (s.goal === 'maintain' ? 1.7 : 1)
  if (Math.abs(gap) < tolerance) return { status: 'on-track', actualKgWk: actual, goalKgWk: goal, days }
  const raw = (gap * KCAL_PER_KG) / 7 / 2
  const delta = Math.sign(raw) * Math.min(300, Math.max(100, Math.round(Math.abs(raw) / 25) * 25))
  const why = s.goal === 'bulk' ? (gap > 0 ? 'slow-gain' : 'fast-gain')
    : s.goal === 'cut' ? (gap > 0 ? 'fast-loss' : 'slow-loss')
    : gap > 0 ? 'drift-down' : 'drift-up'
  return { status: 'adjust', actualKgWk: actual, goalKgWk: goal, days, delta, why }
}

/** Applies a pace suggestion: shifts your fixed calories if you set one, otherwise the expenditure correction. */
export function applyPace(s: Settings, delta: number, now = Date.now()): Partial<Settings> {
  return s.kcalOverride > 0
    ? { kcalOverride: Math.max(800, s.kcalOverride + delta), lastCheckAt: now }
    : { tdeeAdjust: Math.max(-1000, Math.min(1000, s.tdeeAdjust + delta)), lastCheckAt: now }
}
