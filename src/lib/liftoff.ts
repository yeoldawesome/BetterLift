// Liftoff "Export Workouts" CSV parser. Ported from LiftX (github.com/JacobG122503/LiftX), used with permission.
// Columns: Date,Duration,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE,Notes
import { guessKind } from './exercises'
import type { Kind } from './pb'

export interface ImpSet { weight: number; reps: number; distance: number; seconds: number }
export interface ImpExercise { name: string; sets: ImpSet[] }
export interface ImpWorkout { sourceId: string; date: Date; name: string; durationS: number; exercises: ImpExercise[] }
export interface ImpResult { workouts: ImpWorkout[]; kinds: Map<string, Kind>; names: string[] }

export const looksLikeLiftoff = (text: string) => {
  const first = text.replace(/^﻿/, '').split('\n')[0] ?? ''
  return first.includes('Exercise Name') && first.includes('Date')
}

/** RFC 4180-ish: quoted fields, "" escapes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0].length > 0) rows.push(row)
      row = []
    } else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function parseDuration(s: string) {
  const m = /(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*minutes?)?\s*(?:(\d+)\s*seconds?)?/i.exec(s || '')
  if (!m) return 0
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0))
}

function parseDate(s: string): Date | null {
  for (const v of [s, s.replace(' at ', ' '), s.replace(' ', 'T')]) {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function inferKind(name: string, rows: ImpSet[]): Kind {
  const anyW = rows.some((r) => r.weight > 0), anyR = rows.some((r) => r.reps > 0)
  const anyD = rows.some((r) => r.distance > 0), anyS = rows.some((r) => r.seconds > 0)
  const guess = guessKind(name)
  if (!anyW && !anyR && (anyD || anyS)) return anyD || guess === 'cardio' ? 'cardio' : 'duration'
  if (guess === 'assisted') return 'assisted'
  if (!anyW && anyR) return 'bodyweight'
  if (!anyW && !anyR && guess !== 'weight') return guess
  return 'weight'
}

export function importLiftoff(csv: string): ImpResult {
  const rows = parseCsv(csv.replace(/^﻿/, ''))
  if (rows.length < 2) throw new Error('The CSV file is empty.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (n: string) => header.indexOf(n.toLowerCase())
  const c = { date: col('Date'), dur: col('Duration'), wname: col('Workout Name'), ex: col('Exercise Name'), order: col('Set Order'),
    w: col('Weight'), r: col('Reps'), d: col('Distance'), s: col('Seconds') }
  if (c.date < 0 || c.ex < 0) throw new Error("This doesn't look like a Liftoff export (missing Date / Exercise Name columns).")
  const get = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i].trim() : '')
  const n = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) ? v : 0 }

  type Row = { dateText: string; date: Date; dur: string; wname: string; ex: string; order: number } & ImpSet
  const parsed: Row[] = []
  for (const r of rows.slice(1)) {
    const ex = get(r, c.ex), dateText = get(r, c.date)
    const date = ex && parseDate(dateText)
    if (!date) continue
    parsed.push({ dateText, date, dur: get(r, c.dur), wname: get(r, c.wname), ex, order: Math.round(n(get(r, c.order))),
      weight: n(get(r, c.w)), reps: Math.round(n(get(r, c.r))), distance: n(get(r, c.d)), seconds: Math.round(n(get(r, c.s))) })
  }
  if (!parsed.length) throw new Error('No workout rows found in the CSV.')

  const byEx = new Map<string, Row[]>()
  for (const p of parsed) {
    const k = p.ex.toLowerCase()
    byEx.set(k, [...(byEx.get(k) ?? []), p])
  }
  const kinds = new Map<string, Kind>()
  byEx.forEach((list, k) => kinds.set(k, inferKind(list[0].ex, list)))

  // One workout per Liftoff session, identified by its exact start timestamp.
  const sessions = new Map<string, Row[]>()
  for (const p of parsed) sessions.set(p.dateText, [...(sessions.get(p.dateText) ?? []), p])
  const workouts: ImpWorkout[] = []
  sessions.forEach((list, key) => {
    const exs = new Map<string, ImpExercise>()
    for (const p of [...list].sort((a, b) => a.order - b.order)) {
      const k = p.ex.toLowerCase()
      if (!exs.has(k)) exs.set(k, { name: p.ex, sets: [] })
      exs.get(k)!.sets.push({ weight: p.weight, reps: p.reps, distance: p.distance, seconds: p.seconds })
    }
    workouts.push({ sourceId: `liftoff:${key}`, date: list[0].date, name: list[0].wname || 'Workout', durationS: parseDuration(list[0].dur), exercises: [...exs.values()] })
  })
  workouts.sort((a, b) => a.date.getTime() - b.date.getTime())
  return { workouts, kinds, names: [...byEx.values()].map((l) => l[0].ex) }
}
