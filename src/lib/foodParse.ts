import { bestMatch, LOCAL_FOODS, norm, type Food } from './foods'
import { kcalFrom, type Macros, type Meal } from './nutrition'

/** Meal named in the text ("…for lunch"), if any. */
export function mealIn(text: string): Meal | undefined {
  const t = text.toLowerCase()
  if (/\bbreakfast\b/.test(t)) return 'breakfast'
  if (/\blunch\b/.test(t)) return 'lunch'
  if (/\b(dinner|supper)\b/.test(t)) return 'dinner'
  if (/\bsnacks?\b/.test(t)) return 'snack'
  return undefined
}

// ---------- Weigh-ins: "I weigh 182", "weighed in at 81.5 kg", "weight: 180 lbs" ----------

/** A bodyweight statement. unit is null when not stated (use the account's unit). */
export function parseWeight(text: string): { value: number; unit: 'kg' | 'lb' | null } | null {
  const m = text.toLowerCase().match(/\b(?:i\s+)?(?:weigh(?:ed|t|s)?|bodyweight|body weight|bw|scale(?:\s+(?:says|said|read))?)(?:\s+(?:in|is|was|of|at|today|this morning|now))*\s*[:=]?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(kgs?|kilos?|kilograms?|lbs?|pounds?)?\b/)
  if (!m) return null
  const value = parseFloat(m[1].replace(',', '.'))
  if (!(value >= 25 && value <= 700)) return null
  return { value, unit: m[2] ? (m[2].startsWith('k') ? 'kg' : 'lb') : null }
}

// ---------- Exact macros: "I ate 36g of protein, 26g carbs, and 48g fat at 680 calories" ----------

export type ParsedMacros = { name: string; macros: Macros; kcalGiven: boolean; found: ('p' | 'c' | 'f' | 'kcal')[] }

const N = '(\\d+(?:\\.\\d+)?)'
const MACRO = '(protein|prot|pro|carbohydrates?|carbs?|fats?)'
const CAL = '(?:k?cals?|kcals?|calories?|kilocalories?)'
const keyOf = (w: string) => (w.startsWith('pro') ? 'p' : w.startsWith('carb') ? 'c' : w.startsWith('fat') ? 'f' : 'kcal') as 'p' | 'c' | 'f' | 'kcal'

/** Pulls explicit numbers for protein/carbs/fat/calories out of a sentence. Null if none are stated. */
export function parseMacros(text: string): ParsedMacros | null {
  let t = ` ${text.toLowerCase().replace(/[,;]/g, ' , ')} `
  const got: Partial<Record<'p' | 'c' | 'f' | 'kcal', number>> = {}
  const take = (re: RegExp, pick: (m: RegExpExecArray) => [string, string]) => {
    t = t.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray
      const [k, v] = pick(m)
      const key = keyOf(k)
      if (got[key] === undefined) got[key] = parseFloat(v)
      return ' '
    })
  }
  // "36g of protein", "36 grams protein"
  take(new RegExp(`${N}\\s*(?:g|grams?|gr)\\b\\.?\\s*(?:of\\s+)?${MACRO}\\b`, 'g'), (m) => [m[2], m[1]])
  // "680 calories", "680kcal"
  take(new RegExp(`${N}\\s*${CAL}\\b`, 'g'), (m) => ['cal', m[1]])
  // "protein: 36", "carbs 26g", "calories 680"
  take(new RegExp(`\\b(${MACRO.slice(1, -1)}|${CAL.slice(3, -1)})\\s*[:=-]?\\s*${N}\\s*(?:g|grams?)?\\b`, 'g'), (m) => [m[1], m[2]])
  // "36p 26c 48f" (only when at least two appear, so "2 p" alone isn't misread)
  const compact = [...t.matchAll(/\b(\d+(?:\.\d+)?)\s*([pcf])\b/g)]
  if (compact.length >= 2) take(/\b(\d+(?:\.\d+)?)\s*([pcf])\b/g, (m) => [{ p: 'pro', c: 'carb', f: 'fat' }[m[2] as 'p' | 'c' | 'f'], m[1]])
  const found = (Object.keys(got) as ('p' | 'c' | 'f' | 'kcal')[])
  if (!found.length) return null
  const p = got.p ?? 0, c = got.c ?? 0, f = got.f ?? 0
  const kcalGiven = got.kcal !== undefined
  const macros = { kcal: Math.round(kcalGiven ? got.kcal! : kcalFrom(p, c, f)), p, c, f }
  // Whatever words are left over become the name ("protein shake 30g protein" → "Protein shake").
  const left = t
    .replace(/\b(i|i've|ive|ate|eaten|had|have|just|drank|of|and|at|with|for|a|an|the|total|totals|about|around|approximately|approx|roughly|it|was|that|my|meal|g|grams?|in|macros?|today|tonight|this|morning|breakfast|lunch|dinner|supper|snacks?|which|is|were|plus)\b/g, ' ')
    .replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
  const name = left.length >= 3 ? left[0].toUpperCase() + left.slice(1) : 'Quick add'
  return { name: name.slice(0, 80), macros, kcalGiven, found }
}

// ---------- Meal estimate: "two chicken tacos with cheese and salsa and a diet soda" ----------

export type EstItem = { food: Food; servings: number; said: string; approx?: boolean }
export type MealEstimate = { items: EstItem[]; unknown: string[] }

const WORDNUM: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, quarter: 0.25, couple: 2, pair: 2, few: 3, several: 3, dozen: 12,
}
const UNICODE_FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
const SIZE: Record<string, number> = { small: 0.75, medium: 1, regular: 1, large: 1.33, big: 1.33, huge: 1.6, jumbo: 1.6, xl: 1.6 }

type Unit = 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'floz' | 'pint' | 'count'
const UNITS: Record<string, Unit> = {
  g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  cup: 'cup', cups: 'cup', c: 'cup', tbsp: 'tbsp', tbs: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', pint: 'pint', pints: 'pint',
  slice: 'count', slices: 'count', piece: 'count', pieces: 'count', pc: 'count', pcs: 'count', scoop: 'count', scoops: 'count',
  serving: 'count', servings: 'count', bowl: 'count', bowls: 'count', plate: 'count', plates: 'count', can: 'count', cans: 'count',
  bottle: 'count', bottles: 'count', glass: 'count', glasses: 'count', handful: 'count', handfuls: 'count', order: 'count', orders: 'count',
  helping: 'count', helpings: 'count', portion: 'count', portions: 'count', container: 'count', containers: 'count', packet: 'count', packets: 'count',
}
const MASS_G: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 }
// Volume in teaspoons.
const VOL_TSP: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, cup: 48, floz: 6, pint: 96, ml: 1 / 4.929, l: 1000 / 4.929 }

const parseNum = (w: string): number | null => {
  if (/^\d+(\.\d+)?$/.test(w)) return parseFloat(w)
  const fr = w.match(/^(\d+)\/(\d+)$/)
  if (fr && +fr[2]) return +fr[1] / +fr[2]
  if (w in UNICODE_FRAC) return UNICODE_FRAC[w]
  return null
}

type Qty = { qty: number | null; unit: Unit | null; size: number; rest: string[]; explicit: boolean }

/** Reads "2", "1 1/2", "half a", "a couple of", "200 g", "large", "cups of" from the front (or a trailing "200g"/"x2"). */
function parseQty(words: string[]): Qty {
  let i = 0, qty: number | null = null, unit: Unit | null = null, size = 1, explicit = false, article = false
  while (i < words.length) {
    const w = words[i], n = parseNum(w)
    if (n !== null) {
      qty = qty !== null && !article && n < 1 ? qty + n : n // "1 1/2"
      explicit = true; article = false
    } else if (w in WORDNUM) {
      if (w === 'a' || w === 'an') { if (qty === null) { qty = 1; article = true } }
      else if (w === 'half' && qty !== null && !article) qty *= 0.5 // "two half cups" (rare)
      else { qty = w === 'dozen' && qty !== null && !article ? qty * 12 : WORDNUM[w]; article = false }
      explicit = true
    } else if (w in SIZE) size = SIZE[w]
    else if (w === 'fl' && /^oz|ounces?$/.test(words[i + 1] ?? '')) { unit = 'floz'; i++ }
    // A unit word counts after an amount ("2 cups rice") or before "of" ("cup of coffee") — so "cup noodles" stays a food.
    else if (w in UNITS && !unit && (qty !== null || words[i + 1] === 'of')) unit = UNITS[w]
    else if (w === 'of' || w === 'x') { /* "cup of", "2 x" */ }
    else break
    i++
  }
  let rest = words.slice(i)
  // Trailing amounts: "chicken 200 g", "rice x2"
  const tail = rest.length >= 2 ? parseNum(rest[rest.length - 2]) : null
  if (qty === null && tail !== null && rest[rest.length - 1] in UNITS) { qty = tail; unit = UNITS[rest[rest.length - 1]]; rest = rest.slice(0, -2); explicit = true }
  else if (qty === null && rest.length >= 2 && rest[rest.length - 2] === 'x' && parseNum(rest[rest.length - 1]) !== null) { qty = parseNum(rest[rest.length - 1]); rest = rest.slice(0, -2); explicit = true }
  return { qty, unit, size, rest, explicit }
}

/** "1/2 cup" → { n: 0.5, unit: 'cup' } */
function labelAmount(label: string): { n: number; unit: Unit | null } {
  const m = label.toLowerCase().match(/^([\d./]+)\s*(fl oz|[a-z]+)/)
  if (!m) return { n: 1, unit: null }
  const n = parseNum(m[1]) ?? 1
  return { n, unit: m[2] === 'fl oz' ? 'floz' : UNITS[m[2]] ?? null }
}

const isDrink = (f: Food) => /fl oz|can|cup|bottle/.test(f.servings[0].label) && (f.servings[0].g ?? 0) >= 200

function servingsFor(q: Qty, food: Food): { servings: number; approx?: boolean } {
  const s = food.servings[0]
  const count = q.qty ?? 1
  if (!q.unit || q.unit === 'count') return { servings: count }
  const la = labelAmount(s.label)
  // Same kind of unit as the label (e.g. tbsp vs "2 tbsp", oz vs "4 oz"): exact ratio.
  if (VOL_TSP[q.unit] && la.unit && VOL_TSP[la.unit]) return { servings: (count * VOL_TSP[q.unit]!) / (la.n * VOL_TSP[la.unit]!) }
  if (q.unit === 'oz' && isDrink(food) && s.g) return { servings: (count * 29.57) / s.g }
  if (MASS_G[q.unit] && s.g) return { servings: (count * MASS_G[q.unit]!) / s.g }
  // Volume of a food listed by weight/count: assume ~0.8 g per ml (rough).
  if (VOL_TSP[q.unit] && s.g) return { servings: (count * VOL_TSP[q.unit]! * 4.929 * (isDrink(food) ? 1 : 0.8)) / s.g, approx: true }
  return { servings: count, approx: true }
}

const sizeOfLabel = (label: string) => { const w = Object.keys(SIZE).find((k) => new RegExp(`\\b${k}\\b`).test(label.toLowerCase())); return w ? SIZE[w] : 1 }

// Multi-word foods with a connector inside ("mac and cheese", "spaghetti with meat sauce") — protected before splitting.
let protectedNames: string[] | null = null
function protectList(extra: Food[]) {
  if (!protectedNames) protectedNames = LOCAL_FOODS.flatMap((f) => [f.name, ...(f.aliases ?? [])]).map((a) => a.toLowerCase()).filter((a) => /\s(and|with|n|on the)\s/.test(a))
  return [...protectedNames, ...extra.map((f) => f.name.toLowerCase()).filter((a) => /\s(and|with)\s/.test(a))].sort((a, b) => b.length - a.length)
}

const FILLER = /^(?:(?:i|we)\s+)?(?:just\s+)?(?:ate|had|have|got|drank|eaten|grabbed|ordered|made)\s+|^(?:then|also|plus|some|a side of|side of|side)\s+/

/** Estimates the foods (and amounts) in a plain-English meal description. */
export function estimateMeal(text: string, extra: Food[] = []): MealEstimate {
  let t = ` ${text.toLowerCase().replace(/[’']/g, '').replace(/\bw\/\s*/g, ' with ')} `
  t = t.replace(/\b(for|at|as)\s+(breakfast|lunch|dinner|supper|a snack|snack|dessert)\b/g, ' ')
  t = t.replace(/\b(\d+|one|two|three)\s+and\s+a\s+half\b/g, (_, n) => `${(parseNum(n) ?? WORDNUM[n]) + 0.5}`)
  t = t.replace(/(\d)([a-z])/g, '$1 $2').replace(/\b([a-z]+)(\d)/g, (m, a, d) => (a === 'x' ? `x ${d}` : m))
  for (const name of protectList(extra)) t = t.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), name.replace(/\s/g, '_'))

  const foods = [...LOCAL_FOODS, ...extra]
  const parts = t.split(/(,|;|\n|\+|&|\bwith\b|\band\b|\bplus\b|\balso\b|\bthen\b|\bon the side\b)/)
  const items: EstItem[] = [], unknown: string[] = []
  let topping = false, mainCount = 1
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]
    if (i % 2 === 1) { // separator
      const sep = raw.trim()
      if (sep === 'with') topping = true
      else if (sep !== 'and' && sep !== '&') topping = false // commas etc. end a "with …" list
      continue
    }
    const seg = raw.replace(/_/g, ' ').trim().replace(FILLER, '').replace(FILLER, '').trim()
    if (!seg) continue
    const q = parseQty(seg.split(/\s+/))
    // "…with cheese and salsa and a diet soda": an explicit amount ends the topping list.
    const isTop = topping && !q.explicit
    if (topping && q.explicit) topping = false
    let phrase = norm(q.rest.join(' '))
    const found: { food: Food; first: boolean }[] = []
    for (let guard = 0; guard < 6 && phrase.length; guard++) {
      const m = bestMatch(phrase, foods)
      if (!m) break
      found.push({ food: m.food, first: found.length === 0 })
      phrase = [...phrase.slice(0, m.at), '|', ...phrase.slice(m.at + m.len)].filter((w, j, a) => w !== '|' || (j > 0 && j < a.length - 1))
    }
    if (!found.length) { if (/[a-z]{3,}/.test(seg)) unknown.push(seg); continue }
    for (const { food, first } of found) {
      let res: { servings: number; approx?: boolean }
      if (isTop) res = { servings: (food.topping ?? 1) * mainCount }
      else if (first) res = servingsFor(q, food)
      else res = { servings: 1 }
      if (first && q.size !== 1) res.servings *= q.size / sizeOfLabel(food.servings[0].label)
      items.push({ food, servings: Math.max(0.05, Math.round(res.servings * 100) / 100), said: seg, approx: res.approx })
    }
    // Toppings scale with a counted main item ("two tacos with cheese" → cheese for two).
    if (!isTop) mainCount = !q.unit || q.unit === 'count' ? q.qty ?? 1 : 1
  }
  return { items, unknown }
}
