import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fmtK } from '../components/nutrition/bits'
import { BackIcon, ChevronIcon } from '../components/icons'
import { Card, ErrorText, Screen, Spinner, Stat } from '../components/ui'
import { loadBurn, type DayBurn } from '../lib/energy'
import { addDays, computeTargets, dayStr, loadLogs, sumLogs, today, useNutrition, type FoodLog } from '../lib/nutrition'
import { errMsg, useUser } from '../lib/pb'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const AMBER = '#f59e0b'
type Status = 'on' | 'under' | 'over'

/** On target = within 10% of the day's calorie target. */
const statusOf = (kcal: number, target: number): Status => (kcal > target * 1.1 ? 'over' : kcal < target * 0.9 ? 'under' : 'on')
const COLOR: Record<Status, string> = { on: 'var(--color-accent)', under: AMBER, over: 'var(--color-danger)' }

/** Month of food logs: each day's calories and how close it landed to target. Tap a day to view or edit it. */
export default function NutritionCalendar() {
  const user = useUser()!
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const m = /^\d{4}-\d{2}$/.test(params.get('m') ?? '') ? params.get('m')! : today().slice(0, 7)
  const [y, mo] = m.split('-').map(Number)
  const first = new Date(y, mo - 1, 1)
  const days = new Date(y, mo, 0).getDate()
  const from = dayStr(first), to = addDays(from, days - 1)
  const { settings, person } = useNutrition(user)
  const tracking = settings?.goal === 'track'
  const [logs, setLogs] = useState<FoodLog[] | null>(null)
  const [burn, setBurn] = useState<Map<string, DayBurn>>(new Map())
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    setLogs(null)
    loadLogs(from, to).then((l) => live && setLogs(l)).catch((e) => live && setErr(errMsg(e)))
    return () => { live = false }
  }, [from, to])
  useEffect(() => {
    if (!person || !settings) return
    let live = true
    loadBurn(first, new Date(y, mo, 1), person, settings.countLifting).then((b) => live && setBurn(b)).catch(() => {})
    return () => { live = false }
  }, [from, person?.kg, settings?.countLifting]) // eslint-disable-line react-hooks/exhaustive-deps

  const perDay = useMemo(() => {
    const g = new Map<string, FoodLog[]>()
    logs?.forEach((l) => g.set(l.day, [...(g.get(l.day) ?? []), l]))
    const out = new Map<string, { kcal: number; p: number; target: number; pTarget: number; status: Status }>()
    for (const [d, ls] of g) {
      const sum = sumLogs(ls)
      const t = settings && person ? computeTargets(settings, person, burn.get(d)?.total ?? 0) : null
      if (t) out.set(d, { kcal: sum.kcal, p: sum.p, target: t.kcal, pTarget: t.p, status: statusOf(sum.kcal, t.kcal) })
    }
    return out
  }, [logs, burn, settings, person])

  const vals = [...perDay.entries()].filter(([d]) => d <= today()).map(([, v]) => v)
  const avg = (f: (v: (typeof vals)[number]) => number) => (vals.length ? vals.reduce((t, v) => t + f(v), 0) / vals.length : 0)
  const step = (n: number) => { const d = new Date(y, mo - 1 + n, 1); setParams({ m: `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}` }, { replace: true }) }
  const t0 = today()

  return (
    <Screen title="Food calendar" back>
      <ErrorText>{err}</ErrorText>
      <div className="flex items-center justify-between">
        <button onClick={() => step(-1)} className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2" aria-label="Previous month"><BackIcon width={20} height={20} /></button>
        <h2 className="text-lg font-extrabold">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button onClick={() => step(1)} className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2" aria-label="Next month"><ChevronIcon width={20} height={20} /></button>
      </div>

      <Card className="p-2">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => <span key={w} className="py-1 text-[11px] font-bold text-faint">{w}</span>)}
          {Array.from({ length: first.getDay() }, (_, i) => <span key={`pad${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const d = addDays(from, i), v = perDay.get(d)
            return (
              <button key={d} onClick={() => nav(`/nutrition?d=${d}`)} aria-label={d}
                className={`flex aspect-[4/5] flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${d === t0 ? 'ring-2 ring-accent' : ''} ${v ? 'bg-surface-2' : ''}`}>
                <span className={`num text-sm font-bold ${d > t0 ? 'text-faint' : ''}`}>{i + 1}</span>
                {v ? (
                  <>
                    <span className="size-1.5 rounded-full" style={{ background: tracking ? 'var(--color-muted)' : COLOR[v.status] }} />
                    <span className="num text-[10px] font-semibold leading-none text-muted">{v.kcal >= 1000 ? `${(v.kcal / 1000).toFixed(1)}k` : v.kcal}</span>
                  </>
                ) : <span className="h-[18px]" />}
              </button>
            )
          })}
        </div>
        {!logs && <Spinner />}
      </Card>

      {!tracking && <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
        {([['on', 'Within 10% of target'], ['under', 'Under'], ['over', 'Over']] as const).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: COLOR[k] }} />{l}</span>
        ))}
      </div>}

      {logs && (
        vals.length ? (
          <Card className="grid grid-cols-2 gap-4">
            <Stat value={`${vals.length}`} label="Days logged" />
            {!tracking && <Stat value={`${vals.filter((v) => v.status === 'on').length}`} label="On target" />}
            <Stat value={fmtK(avg((v) => v.kcal))} label="Avg kcal / day" />
            {!tracking && <Stat value={`${Math.round(avg((v) => v.kcal / v.target) * 100)}%`} label="Avg of target" />}
            <Stat value={`${Math.round(avg((v) => v.p))}g`} label="Avg protein" />
            {!tracking && <Stat value={`${vals.filter((v) => v.p >= v.pTarget * 0.9).length}`} label="Protein goal hit" />}
          </Card>
        ) : <p className="text-center text-sm text-muted">Nothing logged this month yet. Tap any day to add food, including future days to plan ahead.</p>
      )}
      {!tracking && <p className="text-center text-xs text-faint">Targets use your current goals plus each day's workouts.</p>}
    </Screen>
  )
}
