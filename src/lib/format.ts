import type { Unit } from './pb'

export const KG_LB = 2.20462
export const KM_MI = 1.609344
export const toUnit = (kg: number, u: Unit) => (u === 'lb' ? kg * KG_LB : kg)
export const fromUnit = (v: number, u: Unit) => (u === 'lb' ? v / KG_LB : v)
export const toDist = (km: number, u: Unit) => (u === 'lb' ? km / KM_MI : km)
export const fromDist = (v: number, u: Unit) => (u === 'lb' ? v * KM_MI : v)
export const distLabel = (u: Unit) => (u === 'lb' ? 'mi' : 'km')
/** Seconds as minutes for cardio: "45 min", "12.5 min". */
/** Seconds → "45 min", "7.5 min", or "1 h 30 min" from an hour up. */
export const fmtMin = (sec: number) => {
  const m = sec / 60
  if (m >= 60) { const r = Math.round(m); return r % 60 ? `${Math.floor(r / 60)} h ${r % 60} min` : `${r / 60} h` }
  return `${m >= 10 || Number.isInteger(m) ? Math.round(m) : Math.round(m * 10) / 10} min`
}

const r1 = (n: number) => Math.round(n * 10) / 10
export const fmtW = (kg: number, u: Unit) => `${r1(toUnit(kg, u))}`
export const fmtVol = (kg: number, u: Unit) => Math.round(toUnit(kg, u)).toLocaleString()
export const fmtDist = (km: number, u: Unit) => `${Math.round(toDist(km, u) * 100) / 100}`

export const CM_IN = 2.54
export function fmtHeight(cm: number, u: Unit) {
  if (!cm) return '—'
  if (u === 'kg') return `${Math.round(cm)} cm`
  const inches = Math.round(cm / CM_IN)
  return `${Math.floor(inches / 12)}′${inches % 12}″`
}
export const bmi = (kg: number, cm: number) => (kg > 0 && cm > 0 ? kg / (cm / 100) ** 2 : 0)

export const num =(s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const epley = (w: number, r: number) => (w <= 0 || r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30))

export function fmtDur(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function fmtClock(s: number) {
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = `${s % 60}`.padStart(2, '0')
  return h ? `${h}:${`${m}`.padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
