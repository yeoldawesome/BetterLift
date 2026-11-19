import { useState } from 'react'
import { BottomSheet, Button, ErrorText } from '../ui'
import { fmtW, fromUnit, num, toUnit } from '../../lib/format'
import { dayLabel, dayStr, logWeighIn, today, type PaceCheck, type WeightInfo } from '../../lib/nutrition'
import { errMsg, type Unit } from '../../lib/pb'
import { fmtK } from './bits'

export const ScaleIcon = (p: { width?: number; height?: number; className?: string }) => (
  <svg viewBox="0 0 24 24" width={p.width ?? 20} height={p.height ?? 20} className={p.className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8.5 9.5a5 5 0 017 0M12 9.5l1.2-1.6" />
  </svg>
)

const signed = (kg: number, unit: Unit) => `${kg >= 0 ? '+' : '−'}${fmtW(Math.abs(kg), unit)}`

/** Latest weigh-in, change over the last week, pace status, and a Log button. */
export function WeightCard({ weight, pace, unit, onLog }: { weight: WeightInfo | null; pace: PaceCheck; unit: Unit; onLog: () => void }) {
  const ws = weight?.weighIns ?? []
  const last = ws[ws.length - 1]
  const weekAgo = last ? [...ws].reverse().find((w) => w.t <= last.t - 6 * 864e5) : undefined
  const status = pace.status === 'on-track' ? `On pace: ${signed(pace.actualKgWk, unit)} ${unit}/wk`
    : pace.status === 'waiting' ? pace.reason
    : pace.status === 'adjust' ? `${signed(pace.actualKgWk, unit)} ${unit}/wk vs goal ${signed(pace.goalKgWk, unit)}`
    : ''
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4">
      <ScaleIcon className="shrink-0 text-accent" width={22} height={22} />
      <div className="min-w-0 flex-1">
        <p className="num font-extrabold">
          {last ? <>{fmtW(last.kg, unit)} {unit}</> : 'Weight'}
          {last && weekAgo && <span className="ml-2 text-sm font-semibold text-muted">{signed(last.kg - weekAgo.kg, unit)} this week</span>}
        </p>
        <p className="truncate text-xs text-muted">
          {last ? `${dayLabel(dayStr(new Date(last.t)))}${status ? ' · ' : ''}` : 'Log your weight to keep targets on track. '}{status}
        </p>
      </div>
      <button onClick={onLog} className="h-9 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink active:scale-95">Log weight</button>
    </div>
  )
}

export function WeighInSheet({ day, unit, lastKg, onClose, onSaved }: { day: string; unit: Unit; lastKg?: number; onClose: () => void; onSaved?: () => void }) {
  const [v, setV] = useState('')
  const pad = (n: number) => `${n}`.padStart(2, '0')
  const [time, setTime] = useState(() => { const d = new Date(); return day === today() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '08:00' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    const kg = fromUnit(num(v), unit)
    if (kg < 25 || kg > 320) return setErr('Enter a realistic weight.')
    setBusy(true); setErr('')
    try { await logWeighIn(kg, day, time); onSaved?.(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <BottomSheet title={day === today() ? 'Log weight' : `Log weight · ${dayLabel(day)}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="relative block">
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))} aria-label={`Weight (${unit})`}
            placeholder={lastKg ? `${Math.round(toUnit(lastKg, unit) * 10) / 10}` : unit === 'lb' ? '180' : '80'}
            className="num h-16 w-full rounded-2xl border border-line bg-surface-2 px-4 pr-14 text-3xl font-black outline-none placeholder:text-faint focus:border-accent" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-faint">{unit}</span>
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface p-2 pl-3">
          <span className="text-sm text-muted">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time"
            className="num h-10 rounded-lg bg-surface-2 px-2 text-base font-semibold text-ink outline-none" />
        </label>
        <p className="text-xs text-muted">Weigh in at the same time each day (ideally mornings, before eating). Your weekly pace check uses these.</p>
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy || !num(v)}>{busy ? 'Saving…' : 'Save weight'}</Button>
      </form>
    </BottomSheet>
  )
}

const WHY: Record<Extract<PaceCheck, { status: 'adjust' }>['why'], (a: string, g: string) => string> = {
  'slow-gain': (a, g) => `You're bulking but gaining slower than planned (${a}/wk vs ${g}/wk).`,
  'fast-gain': (a, g) => `You're gaining faster than planned (${a}/wk vs ${g}/wk), so more of it is likely fat.`,
  'slow-loss': (a, g) => `You're cutting but losing slower than planned (${a}/wk vs ${g}/wk).`,
  'fast-loss': (a, g) => `You're losing faster than planned (${a}/wk vs ${g}/wk), which risks strength and muscle.`,
  'drift-up': (a) => `You're maintaining, but your weight is creeping up (${a}/wk).`,
  'drift-down': (a) => `You're maintaining, but your weight is drifting down (${a}/wk).`,
}

/** Suggestion from the weekly pace check, with Apply / Not now. */
export function PaceCard({ pace, unit, onApply, onDismiss }: { pace: Extract<PaceCheck, { status: 'adjust' }>; unit: Unit; onApply: () => Promise<void>; onDismiss: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const more = pace.delta > 0
  return (
    <div className="space-y-2 rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-accent">Weekly pace check</p>
      <p className="text-sm">{WHY[pace.why](`${signed(pace.actualKgWk, unit)} ${unit}`, `${signed(pace.goalKgWk, unit)} ${unit}`)}</p>
      <p className="font-bold">{more ? 'Add' : 'Remove'} {fmtK(Math.abs(pace.delta))} kcal a day?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(onDismiss)}>Not now</Button>
        <Button size="sm" disabled={busy} onClick={() => run(onApply)}>{more ? `+${fmtK(pace.delta)}` : `−${fmtK(-pace.delta)}`} kcal</Button>
      </div>
      <p className="text-xs text-muted">Based on {Math.round(pace.days)} days of weigh-ins. Changes are kept small; we'll check again in a week.</p>
    </div>
  )
}
