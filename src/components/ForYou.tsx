import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ask } from './Dialog'
import { BodyMap } from './BodyMap'
import { BedIcon, ChevronIcon, RepeatIcon, TrendIcon } from './icons'
import { BottomSheet, Button, Card, Spinner } from './ui'
import { LineChart } from './LineChart'
import { routineExercises, useActive } from '../lib/active'
import { liftingSession } from '../lib/energy'
import { fmtVol, fmtW, toUnit } from '../lib/format'
import { loadWeight } from '../lib/nutrition'
import { MAP_MUSCLES } from '../lib/muscles'
import { me, nutritionOn, pb, useUser, type Routine, type RoutineExercise, type User, type WSet, type Workout } from '../lib/pb'
import { nextUp, userPlan, type NextUp } from '../lib/plan'
import { recovery, RECOVERY_WINDOW_H, recoverySummary } from '../lib/recovery'

type Data = {
  routines: Routine[]; preview: Map<string, RoutineExercise[]>
  last: Workout[]; setCount: Map<string, number>
  recent: { at: Date; sets: WSet[] }[]
}
let mem: { user: string; data: Data } | null = null

/** Feed → For You: what to train next (from your weekly plan), your last 14 workouts, and muscle recovery. */
export default function ForYou() {
  const user = useUser()!
  const [data, setData] = useState<Data | null>(() => (mem?.user === me() ? mem.data : null))
  useEffect(() => {
    let live = true
    const u = pb.filter('user = {:u}', { u: me() })
    const since = new Date(Date.now() - RECOVERY_WINDOW_H * 3600000)
    Promise.all([
      pb.collection('routines').getFullList<Routine>({ filter: u, sort: 'position,created' }),
      pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: u, sort: 'position', expand: 'exercise', fields: 'routine,target_sets,expand.exercise.name,expand.exercise.muscle,expand.exercise.secondary,expand.exercise.kind' }),
      pb.collection('workouts').getList<Workout>(1, 14, { filter: u, sort: '-started_at' }),
      pb.collection('workout_sets').getFullList<WSet>({ filter: pb.filter('user = {:u} && performed_at >= {:d} && completed = true', { u: me(), d: since }), expand: 'exercise', fields: 'workout,performed_at,expand.exercise.muscle,expand.exercise.secondary,expand.exercise.kind', batch: 1000 }),
    ]).then(async ([routines, rex, last, sets]) => {
      const preview = new Map<string, RoutineExercise[]>()
      for (const r of rex) if (r.expand?.exercise) preview.set(r.routine, [...(preview.get(r.routine) ?? []), r])
      const byW = new Map<string, WSet[]>()
      for (const s of sets) byW.set(s.workout, [...(byW.get(s.workout) ?? []), s])
      const recent = [...byW.values()].map((ss) => ({ at: new Date(ss[0].performed_at), sets: ss }))
      // Set counts for the calorie estimate (denser sessions burn more).
      const setCount = new Map<string, number>()
      if (last.items.length) {
        const rows = await pb.collection('workout_sets').getFullList<WSet>({ filter: last.items.map((w) => `workout="${w.id}"`).join(' || ') + ' && completed = true', fields: 'workout', batch: 2000 }).catch(() => [])
        for (const r of rows) setCount.set(r.workout, (setCount.get(r.workout) ?? 0) + 1)
      }
      const d = { routines, preview, last: last.items, setCount, recent }
      mem = { user: me(), data: d }
      if (live) setData(d)
    }).catch(() => live && setData((x) => x ?? { routines: [], preview: new Map(), last: [], setCount: new Map(), recent: [] }))
    return () => { live = false }
  }, [])

  if (!data) return <Spinner />
  return (
    <div className="space-y-6" data-for-you>
      <NextWorkout user={user} data={data} />
      <LastWorkouts user={user} data={data} />
      <Recovery user={user} data={data} />
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2"><h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>{action}</div>
      {children}
    </section>
  )
}

function NextWorkout({ user, data }: { user: User; data: Data }) {
  const nav = useNavigate()
  const { active, start } = useActive()
  const plan = userPlan(user)
  const up: NextUp = nextUp(plan, data.routines, data.last)
  const launch = async (r: Routine) => {
    if (active && !await ask({ title: 'You have a workout in progress', body: 'Starting this routine replaces it.', confirmLabel: 'Replace', danger: true })) return
    start(r.name, r.id, await routineExercises(r.id))
    nav('/workout')
  }
  const routine = up.status === 'train' ? up.routine : up.status === 'none' ? null : up.next
  const ex = routine ? data.preview.get(routine.id) ?? [] : []
  const sets = ex.reduce((t, x) => t + (x.target_sets || 1), 0)
  const label = up.status === 'rest' ? 'Rest day today' : up.status === 'done' ? (up.restFirst ? 'Done for today · rest next' : 'Done for today · up next') : up.status === 'train' && up.afterRest ? 'Rested up · today' : 'Up next'

  return (
    <Section title="Next Workout" action={<Link to="/routines" className="text-sm font-semibold text-accent">{up.status === 'none' ? 'Set up' : 'Plan'}</Link>}>
      {up.status === 'none' ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><RepeatIcon width={22} height={22} /></span>
            <p className="text-sm text-muted">Set a weekly plan in Routines (like Push → Pull → Legs → Rest) and your next workout shows up here.</p>
          </div>
          <Link to="/routines"><Button variant="ghost">Set up weekly plan</Button></Link>
        </Card>
      ) : (
        <Card className="space-y-3" data-next-workout={routine?.name}>
          <div className="flex items-center gap-3">
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${up.status === 'rest' ? 'bg-surface-2 text-muted' : 'bg-accent text-accent-ink'}`}>
              {up.status === 'rest' ? <BedIcon width={24} height={24} /> : <span className="text-lg font-black">{(routine?.name ?? '?').slice(0, 1).toUpperCase()}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-bold uppercase tracking-wider ${up.status === 'rest' ? 'text-muted' : 'text-accent'}`}>{label}</p>
              <p className="truncate text-xl font-extrabold">{up.status === 'rest' ? `Then ${routine?.name ?? ''}` : routine?.name}</p>
              <p className="text-sm text-muted">{ex.length} exercise{ex.length === 1 ? '' : 's'} · {sets} sets</p>
            </div>
          </div>
          {ex.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ex.slice(0, 5).map((x, i) => <span key={i} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{x.expand!.exercise!.name}</span>)}
              {ex.length > 5 && <span className="rounded-full px-1 py-1 text-xs font-semibold text-faint">+{ex.length - 5} more</span>}
            </div>
          )}
          {/* Plan strip: where you are in the rotation. */}
          <PlanStrip user={user} routines={data.routines} current={up.status === 'done' ? up.nextStep : up.step} />
          {routine && <Button variant={up.status === 'train' ? 'primary' : 'ghost'} onClick={() => launch(routine)}>{up.status === 'train' ? `Start ${routine.name}` : `Start ${routine.name} anyway`}</Button>}
        </Card>
      )}
    </Section>
  )
}

function PlanStrip({ user, routines, current }: { user: User; routines: Routine[]; current: number }) {
  const byId = new Map(routines.map((r) => [r.id, r]))
  const cycle = userPlan(user).cycle.filter((s) => s === 'rest' || byId.has(s))
  return (
    <div className="flex gap-1">
      {cycle.map((s, i) => (
        <div key={i} className={`h-7 min-w-0 flex-1 truncate rounded-lg px-1 text-center text-[11px] font-bold leading-7 ${i === current ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-faint'}`}>
          {s === 'rest' ? 'Rest' : byId.get(s)!.name}
        </div>
      ))}
    </div>
  )
}

function LastWorkouts({ user, data }: { user: User; data: Data }) {
  const unit = user.unit || 'kg'
  const [sheet, setSheet] = useState<'records' | 'weight' | null>(null)
  const ws = data.last
  if (!ws.length) return (
    <Section title="Last 14 Workouts"><Card><p className="text-sm text-muted">Finish a workout and your totals show up here.</p></Card></Section>
  )
  const chrono = [...ws].reverse()
  const vol = ws.reduce((t, w) => t + (w.volume_kg || 0), 0)
  const max = Math.max(1, ...chrono.map((w) => w.volume_kg || 0))
  const secs = ws.reduce((t, w) => t + (w.duration_s || 0), 0)
  const prs = ws.reduce((t, w) => t + (w.pr_count || 0), 0)
  const person = { kg: user.bodyweight_kg || 75, cm: user.height_cm || 175, age: 30, sex: user.sex }
  const kcal = ws.reduce((t, w) => t + liftingSession(w.duration_s || 0, data.setCount.get(w.id) ?? 0, person).kcal, 0)
  // Progressive overload: the newer half's average volume against the older half's.
  const half = Math.floor(chrono.length / 2)
  const avg = (a: Workout[]) => a.reduce((t, w) => t + (w.volume_kg || 0), 0) / Math.max(1, a.length)
  const trend = half ? avg(chrono.slice(half)) / Math.max(1, avg(chrono.slice(0, half))) - 1 : 0
  const bws = chrono.map((w) => w.bodyweight_kg).filter((x) => x > 0)
  const bw = user.bodyweight_kg || bws[bws.length - 1] || 0
  const bwDelta = bws.length > 1 ? bws[bws.length - 1] - bws[0] : 0
  const bwLabel = Math.abs(bwDelta) < 0.5 ? 'Stable weight' : bwDelta > 0 ? `Up ${fmtW(bwDelta, unit)} ${unit}` : `Down ${fmtW(-bwDelta, unit)} ${unit}`
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60)
  const showKcal = nutritionOn(user)

  return (
    <Section title={`Last ${ws.length} Workout${ws.length === 1 ? '' : 's'}`}>
      <Link to="/stats" className="block">
        <Card className="flex items-center gap-4" data-volume>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-muted">Volume</p>
            <p className="num truncate text-2xl font-black">{fmtVol(vol, unit)} <span className="text-base font-bold">{unit}</span></p>
            <p className={`flex items-center gap-1 text-sm font-semibold ${trend >= 0.02 ? 'text-accent' : 'text-muted'}`}>
              {trend >= 0.02 ? 'Progressive overload' : trend <= -0.02 ? 'Volume down' : 'Holding steady'}
              <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-ink"><TrendIcon width={12} height={12} /></span>
            </p>
          </div>
          <div className="flex h-16 shrink-0 items-end gap-[3px]" aria-hidden>
            {chrono.map((w) => (
              <span key={w.id} className="relative h-full w-[7px] rounded-full bg-surface-2">
                <span className="absolute inset-x-0 bottom-0 rounded-full bg-accent" style={{ height: `${Math.max(12, ((w.volume_kg || 0) / max) * 100)}%` }} />
              </span>
            ))}
          </div>
        </Card>
      </Link>
      <div className={`grid gap-3 ${showKcal ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Card className="!p-3"><p className="text-sm font-semibold text-muted">Duration</p><p className="num whitespace-nowrap text-[22px] font-black">{h >= 10 ? `${Math.round(secs / 3600)}h` : h ? `${h}h ${m}m` : `${m}m`}</p></Card>
        <button onClick={() => setSheet('records')} className="text-left" data-records>
          <Card className="h-full !p-3"><p className="flex items-center justify-between text-sm font-semibold text-muted">Records<ChevronIcon width={14} height={14} className="text-faint" /></p><p className="num text-[22px] font-black">{prs}</p></Card>
        </button>
        {showKcal && <Card className="!p-3"><p className="text-sm font-semibold text-muted">Burned</p><p className="num whitespace-nowrap text-[22px] font-black">{kcal.toLocaleString()}<span className="ml-0.5 text-xs font-bold">cal</span></p></Card>}
      </div>
      <button onClick={() => setSheet('weight')} className="block w-full text-left" data-bodyweight>
        <Card className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-muted">Bodyweight</p>
            <p className="num text-2xl font-black">{bw ? fmtW(bw, unit) : '—'} <span className="text-base font-bold">{unit}</span></p>
            <p className="flex items-center gap-1 text-sm font-semibold text-muted">{bwLabel}<ChevronIcon width={14} height={14} /></p>
          </div>
          <Sparkline values={bws.length > 1 ? bws : [bw, bw]} />
        </Card>
      </button>
      {sheet === 'records' && <RecordsSheet workouts={ws} unit={unit} onClose={() => setSheet(null)} />}
      {sheet === 'weight' && <WeightSheet workouts={ws} unit={unit} onClose={() => setSheet(null)} />}
    </Section>
  )
}

type PR = { id: string; workout: string; performed_at: string; weight_kg: number; reps: number; seconds: number; e1rm_kg: number; expand?: { exercise?: { name: string; kind: string } } }

/** Every PR set from these workouts, newest first. Tap one to open its workout. */
function RecordsSheet({ workouts, unit, onClose }: { workouts: Workout[]; unit: 'kg' | 'lb'; onClose: () => void }) {
  const nav = useNavigate()
  const [rows, setRows] = useState<PR[] | null>(null)
  useEffect(() => {
    const ids = workouts.filter((w) => w.pr_count > 0).map((w) => w.id)
    if (!ids.length) { setRows([]); return }
    pb.collection('workout_sets').getFullList<PR>({
      filter: pb.filter('user = {:u} && is_pr = true', { u: me() }) + ' && (' + ids.map((id) => pb.filter('workout = {:w}', { w: id })).join(' || ') + ')',
      sort: '-performed_at,position,set_index', expand: 'exercise', fields: 'id,workout,performed_at,weight_kg,reps,seconds,e1rm_kg,expand.exercise.name,expand.exercise.kind',
    }).then(setRows).catch(() => setRows([]))
  }, [workouts])
  const title = (w: Workout | undefined) => w?.name || 'Workout'
  const byId = new Map(workouts.map((w) => [w.id, w]))
  return (
    <BottomSheet title={`Records · last ${workouts.length} workouts`} onClose={onClose}>
      {!rows ? <Spinner /> : !rows.length ? <p className="py-6 text-center text-sm text-muted">No new records in these workouts yet. Beat a best set and it shows up here.</p> : (
        <div className="space-y-2" data-records-list>
          {rows.map((r) => (
            <button key={r.id} onClick={() => { onClose(); nav(`/w/${r.workout}`) }} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-3 text-left active:opacity-80">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">🏆</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{r.expand?.exercise?.name ?? 'Exercise'}</span>
                <span className="block truncate text-xs text-muted">{new Date(r.performed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {title(byId.get(r.workout))}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block font-black">{r.weight_kg ? `${fmtW(r.weight_kg, unit)} ${unit} × ${r.reps}` : `${r.reps} reps`}</span>
                {r.e1rm_kg > 0 && <span className="num block text-xs text-muted">e1RM {fmtW(r.e1rm_kg, unit)} {unit}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

/** Logged bodyweight over the last 14 days: weigh-ins, plus the bodyweight saved with each workout. */
function WeightSheet({ workouts, unit, onClose }: { workouts: Workout[]; unit: 'kg' | 'lb'; onClose: () => void }) {
  const [pts, setPts] = useState<{ t: number; kg: number }[] | null>(null)
  useEffect(() => {
    const since = Date.now() - 14 * 864e5
    loadWeight(true).catch(() => null).then((w) => {
      const weighIns = (w?.weighIns ?? []).filter((p) => p.t >= since)
      const fromWorkouts = workouts.map((x) => ({ t: new Date(x.started_at).getTime(), kg: x.bodyweight_kg })).filter((p) => p.kg > 0 && p.t >= since)
      // One point per day: a weigh-in wins over a workout's bodyweight on the same day.
      const day = (t: number) => new Date(t).toDateString()
      const byDay = new Map<string, { t: number; kg: number }>()
      for (const p of fromWorkouts) byDay.set(day(p.t), p)
      for (const p of weighIns) byDay.set(day(p.t), p)
      setPts([...byDay.values()].sort((a, b) => a.t - b.t))
    })
  }, [workouts])
  const vals = pts?.map((p) => Math.round(toUnit(p.kg, unit) * 10) / 10) ?? []
  const delta = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0
  return (
    <BottomSheet title="Bodyweight · last 14 days" onClose={onClose}>
      {!pts ? <Spinner /> : !pts.length ? <p className="py-6 text-center text-sm text-muted">No weight logged in the last 14 days. Log a weigh-in on Physique or when you finish a workout.</p> : (
        <div className="space-y-3" data-weight-chart>
          <div className="flex items-end justify-between">
            <p className="num text-3xl font-black">{vals[vals.length - 1]} <span className="text-base font-bold">{unit}</span></p>
            {vals.length > 1 && <p className={`num text-sm font-bold ${Math.abs(delta) < 0.1 ? 'text-muted' : 'text-accent'}`}>{delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10} {unit} · {vals.length} readings</p>}
          </div>
          <LineChart className="h-56" labels={pts.map((p) => new Date(p.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} values={vals} yTitle={unit} />
          <Link to="/profile" onClick={onClose} className="block text-center text-sm font-semibold text-accent">See all on Profile</Link>
        </div>
      )}
    </BottomSheet>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const W = 130, H = 44
  // At least ±1 kg of range, so day-to-day noise draws as a flat line rather than a zig-zag.
  const mid = (Math.min(...values) + Math.max(...values)) / 2
  const span = Math.max(2, Math.max(...values) - Math.min(...values)), lo = mid - span / 2
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * W, H - 4 - ((v - lo) / span) * (H - 8)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 text-accent" aria-hidden>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="currentColor" opacity={0.12} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Recovery({ user, data }: { user: User; data: Data }) {
  const r = recovery(data.recent.map((s) => ({ at: s.at, sets: s.sets.map((x) => ({ ex: x.expand?.exercise })) })))
  const sum = recoverySummary(r)
  const all = sum.ready.length === MAP_MUSCLES.length
  return (
    <Section title="Recovery">
      <Card className="space-y-4" data-recovery>
        <div className="flex items-stretch gap-3">
          {/* Legend: accent = recovered (ready to train), red = still recovering (darker red = more worn out). */}
          <div className="flex w-8 shrink-0 flex-col items-center gap-1.5 py-1" aria-hidden>
            <span className="text-[9px] font-bold uppercase text-accent">Ready</span>
            <span className="w-3 flex-1 rounded-full" style={{ background: 'linear-gradient(var(--color-accent) 0 22%, color-mix(in oklab, var(--color-danger) 35%, var(--color-surface-2)) 30%, var(--color-danger))' }} />
            <span className="text-[9px] font-bold uppercase text-danger">Sore</span>
          </div>
          <BodyMap sex={user.sex} intensity={r} recovery className="h-64 flex-1 justify-center" labels />
        </div>
        <div className="rounded-2xl bg-surface-2 p-4">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${sum.sore.length ? 'bg-surface text-muted' : 'bg-accent text-accent-ink'}`}>
            {sum.sore.length ? 'Recovering' : 'Ready to train'}
          </span>
          <p className="mt-2 text-[15px] leading-snug">
            {all ? 'Every muscle group is fully recovered. Let’s work out!'
              : sum.ready.length ? <>Your {sum.readyText} {sum.ready.length === 1 ? 'is' : 'are'} fully recovered.{sum.sore.length ? <> Give your {sum.soreText} a bit more time.</> : ' Let’s work out!'}</>
              : <>Your {sum.soreText} {sum.sore.length === 1 ? 'is' : 'are'} still recovering.</>}
          </p>
        </div>
      </Card>
    </Section>
  )
}
