import { KG_LB } from './format'
import { me, pb } from './pb'

export type BodyMetric = {
  id: string; measured_at: string; weight_kg: number; bmi: number; body_fat_pct: number; fat_mass_kg: number; muscle_pct: number; muscle_kg: number
  skeletal_pct: number; skeletal_kg: number; bone_kg: number; protein_pct: number; water_pct: number; fat_free_kg: number
  subcut_fat_pct: number; visceral_fat: number; bmr: number; metabolic_age: number
}
export type BodyKey = Exclude<keyof BodyMetric, 'id' | 'measured_at'>
/** kind: mass = stored kg, shown in user unit; pct = %; plain = unitless. */
export const BODY_FIELDS: { k: BodyKey; label: string; kind: 'mass' | 'pct' | 'plain'; suffix?: string }[] = [
  { k: 'weight_kg', label: 'Weight', kind: 'mass' },
  { k: 'body_fat_pct', label: 'Body Fat', kind: 'pct' },
  { k: 'muscle_kg', label: 'Muscle Mass', kind: 'mass' },
  { k: 'skeletal_kg', label: 'Skeletal Muscle', kind: 'mass' },
  { k: 'fat_free_kg', label: 'Fat-Free Mass', kind: 'mass' },
  { k: 'fat_mass_kg', label: 'Fat Mass', kind: 'mass' },
  { k: 'bmi', label: 'BMI', kind: 'plain' },
  { k: 'visceral_fat', label: 'Visceral Fat', kind: 'plain' },
  { k: 'subcut_fat_pct', label: 'Subcutaneous Fat', kind: 'pct' },
  { k: 'water_pct', label: 'Body Water', kind: 'pct' },
  { k: 'protein_pct', label: 'Protein', kind: 'pct' },
  { k: 'muscle_pct', label: 'Muscle %', kind: 'pct' },
  { k: 'skeletal_pct', label: 'Skeletal Muscle %', kind: 'pct' },
  { k: 'bone_kg', label: 'Bone Mass', kind: 'mass' },
  { k: 'bmr', label: 'BMR', kind: 'plain', suffix: 'kcal' },
  { k: 'metabolic_age', label: 'Metabolic Age', kind: 'plain' },
]

// CSV header (lowercased, units stripped) → field.
const COLS: Record<string, BodyKey> = {
  'weight': 'weight_kg', 'bmi': 'bmi', 'body fat percentage': 'body_fat_pct', 'body fat mass': 'fat_mass_kg', 'muscle percentage': 'muscle_pct',
  'muscle mass': 'muscle_kg', 'skeletal muscle percentage': 'skeletal_pct', 'skeletal muscle mass': 'skeletal_kg', 'bone mass': 'bone_kg',
  'protein percentage': 'protein_pct', 'body water percentage': 'water_pct', 'fat-free mass': 'fat_free_kg', 'subcutaneous fat': 'subcut_fat_pct',
  'visceral fat': 'visceral_fat', 'bmr': 'bmr', 'metabolic age': 'metabolic_age',
}

/** Parses a RENPHO-style export. Mass columns in lb are converted to kg. */
export function parseBodyCsv(text: string): Omit<BodyMetric, 'id'>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = lines[0].split(',').map((h) => h.trim())
  const iDate = head.findIndex((h) => /^date$/i.test(h)), iTime = head.findIndex((h) => /^time$/i.test(h))
  if (iDate < 0) throw new Error('No Date column found. Export the CSV from the RENPHO app and try again.')
  const cols = head.map((h) => {
    const base = h.replace(/\(.*?\)/g, '').trim().toLowerCase()
    return { key: COLS[base], lb: /\(lb\)/i.test(h) }
  })
  const out: Omit<BodyMetric, 'id'>[] = []
  for (const line of lines.slice(1)) {
    const c = line.split(',').map((x) => x.trim())
    const [y, mo, d] = (c[iDate] ?? '').split(/[.\-/]/).map(Number)
    if (!y || !mo || !d) continue
    const [h = 0, mi = 0, s = 0] = (iTime >= 0 ? c[iTime] : '').split(':').map(Number)
    const when = new Date(y, mo - 1, d, h, mi, s)
    if (isNaN(when.getTime())) continue
    const row = { measured_at: when.toISOString() } as Omit<BodyMetric, 'id'>
    BODY_FIELDS.forEach((f) => { row[f.k] = 0 })
    cols.forEach((col, i) => {
      if (!col.key) return
      const v = parseFloat(c[i])
      if (!isFinite(v) || v <= 0) return
      row[col.key] = Math.round((col.lb ? v / KG_LB : v) * 1000) / 1000
    })
    if (row.weight_kg > 0) out.push(row)
  }
  return out
}

export const loadBody = () =>
  pb.collection('body_metrics').getFullList<BodyMetric>({ filter: pb.filter('user = {:u}', { u: me() }), sort: 'measured_at' })

/** Inserts readings not already stored (matched to the minute). Returns how many were added. */
export async function importBody(rows: Omit<BodyMetric, 'id'>[], have: BodyMetric[]): Promise<number> {
  const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60000)
  const seen = new Set(have.map((h) => minute(h.measured_at)))
  const fresh = rows.filter((r) => { const m = minute(r.measured_at); if (seen.has(m)) return false; seen.add(m); return true })
  const uid = me()
  for (let i = 0; i < fresh.length; i += 50) {
    const b = pb.createBatch()
    fresh.slice(i, i + 50).forEach((r) => b.collection('body_metrics').create({ ...r, user: uid, source: 'renpho' }))
    await b.send()
  }
  return fresh.length
}
