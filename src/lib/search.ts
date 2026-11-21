import { altNames } from './exercises'

/**
 * Exercise search shared by the exercise picker / library and Stats.
 * Order-insensitive, plural/hyphen/shorthand tolerant, forgives one-letter typos, and also matches alternative
 * names ("pec deck" → Machine Chest Fly), muscle groups ("chest") and equipment ("cable").
 */

// Shorthands and spellings people actually type → the word used in exercise names.
const SYNONYMS: Record<string, string> = {
  db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ez', smith: 'smith',
  tri: 'tricep', tris: 'tricep', triceps: 'tricep', bi: 'bicep', bis: 'bicep', biceps: 'bicep',
  delt: 'delt', delts: 'delt', shoulder: 'shoulder', lat: 'lat', lats: 'lat', ab: 'ab', abs: 'ab', quad: 'quad', quads: 'quad',
  ham: 'hamstring', hams: 'hamstring', glute: 'glute', glutes: 'glute', calf: 'calf', calves: 'calf', trap: 'trap', traps: 'trap',
  pullup: 'pull up', pullups: 'pull up', chinup: 'chin up', chinups: 'chin up', pushup: 'push up', pushups: 'push up', situp: 'sit up', situps: 'sit up',
  ohp: 'overhead press', rdl: 'romanian deadlift', sldl: 'stiff leg deadlift', ghr: 'glute ham raise',
  bench: 'bench', dl: 'deadlift', flye: 'fly', flyes: 'fly', flies: 'fly', crossover: 'crossover', machine: 'machine',
}

// Words that mean a muscle group, for "chest", "back day", "rear delts" style searches.
const MUSCLE_WORDS: Record<string, string[]> = {
  chest: ['chest', 'pec'], back: ['back', 'lat', 'trap', 'row'], shoulders: ['shoulder', 'delt'],
  lats: ['back', 'lat', 'row'], traps: ['back', 'trap', 'shrug'], upper_back: ['back', 'upper', 'rhomboid', 'row'], lower_back: ['back', 'lower', 'erector'],
  front_delts: ['shoulder', 'delt', 'front'], side_delts: ['shoulder', 'delt', 'side', 'lateral'], rear_delts: ['shoulder', 'delt', 'rear', 'back'], biceps: ['bicep', 'arm'], triceps: ['tricep', 'arm'],
  forearms: ['forearm', 'grip', 'wrist'], quads: ['quad', 'leg', 'thigh'], hamstrings: ['hamstring', 'leg'], glutes: ['glute', 'butt', 'hip'],
  adductors: ['adductor', 'groin', 'inner'], calves: ['calf', 'leg'], core: ['core', 'ab', 'oblique'], cardio: ['cardio'], full_body: ['full', 'body'],
}

/** Lowercase, drop punctuation, split, expand shorthands, singularize. */
export function tokens(s: string): string[] {
  const out: string[] = []
  for (const raw of s.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/)) {
    if (!raw) continue
    const syn = SYNONYMS[raw]
    for (const w of (syn ?? raw).split(' ')) out.push(w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
  }
  return out
}

/** True when a and b differ by at most one edit (typo), for words of 4+ letters. */
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2 } // swapped letters
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** How well one typed word matches a list of words: 3 exact, 2 prefix, 1 typo, 0 none. */
function wordScore(q: string, words: string[]) {
  let best = 0
  for (const w of words) {
    if (w === q) return 3
    if (w.startsWith(q) && q.length >= 2) best = Math.max(best, 2)
    else if (oneEdit(q, w) || (q.length >= 5 && oneEdit(q, w.slice(0, q.length)))) best = Math.max(best, 1)
  }
  return best
}

export type Match = { score: number; via?: string }

/**
 * Score how well `query` matches an exercise; 0 means no match. `via` is the alternative name that matched, if the
 * real name didn't (so the UI can show "aka Pec Deck").
 */
export function matchExercise(query: string, ex: { name: string; muscle?: string; equipment?: string }): Match {
  const q = tokens(query)
  if (!q.length) return { score: 1 }
  const full = query.trim().toLowerCase()

  const scoreAgainst = (text: string) => {
    const words = tokens(text)
    let total = 0
    for (const t of q) {
      const s = wordScore(t, words)
      if (!s) return 0 // every typed word must appear
      total += s
    }
    const lower = text.toLowerCase()
    const bonus = lower === full ? 40 : lower.startsWith(full) ? 20 : lower.includes(full) ? 10 : 0
    return total * 10 + bonus - words.length // shorter names rank a bit higher for the same match
  }

  const byName = scoreAgainst(ex.name)
  let best: Match = { score: byName }
  for (const alt of altNames(ex.name)) {
    const s = scoreAgainst(alt) - 5 // a real-name match beats an alternative-name match
    if (s > best.score) best = { score: s, via: alt }
    // Matching both the name and a common nickname ("bench" → Barbell Bench Press / "Bench Press") = very likely what you meant.
    else if (s > 0 && byName > 0) best = { score: best.score + 8, via: best.via }
  }
  // Typing a muscle ("chest") favours lifts that train it over ones that only mention it ("Chest-Supported Row").
  const muscleWords = ex.muscle ? MUSCLE_WORDS[ex.muscle] ?? [] : []
  if (best.score > 0 && q.some((t) => muscleWords.includes(t))) best = { ...best, score: best.score + 15 }
  if (best.score > 0) return best

  // Muscle / equipment words ("chest", "cable") as a weaker fallback, mixed with name words ("cable chest").
  const extra = [...(ex.muscle ? MUSCLE_WORDS[ex.muscle] ?? [ex.muscle] : []), ...(ex.equipment ? tokens(ex.equipment) : [])]
  const pool = [...tokens(ex.name), ...extra]
  let total = 0
  for (const t of q) {
    const s = wordScore(t, pool)
    if (!s) return { score: 0 }
    total += s
  }
  return { score: total * 4 }
}

/** Filter + rank a list by a search query (keeps everything, in original order, when the query is blank). */
export function searchExercises<T extends { name: string; muscle?: string; equipment?: string }>(list: T[], query: string): { item: T; via?: string }[] {
  if (!query.trim()) return list.map((item) => ({ item }))
  return list
    .map((item) => ({ item, m: matchExercise(query, item) }))
    .filter((x) => x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score || a.item.name.localeCompare(b.item.name))
    .map(({ item, m }) => ({ item, via: m.via }))
}
