import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ask } from './Dialog'
import { BodyMap } from './BodyMap'
import { BedIcon, ChevronIcon, PlusIcon, RepeatIcon, TrendIcon } from './icons'
import { BottomSheet, Button, Card, Spinner } from './ui'
import { LineChart } from './LineChart'
import { routineExercises, useActive } from '../lib/active'
import { loadExercises } from '../lib/exercises'
import { liftingSession } from '../lib/energy'
import { fmtVol, fmtW, fromUnit, toUnit } from '../lib/format'
import { loadWeight, logWeighIn } from '../lib/nutrition'
import { MAP_MUSCLES } from '../lib/muscles'
import { errMsg, me, nutritionOn, pb, useUser, type Routine, type RoutineExercise, type User, type WSet, type Workout } from '../lib/pb'
import { nextUp, savePlan, userPlan, type NextUp } from '../lib/plan'
import { recovery, RECOVERY_WINDOW_H, recoverySummary } from '../lib/recovery'
import { overload } from '../lib/stats'

type Data = {
  routines: Routine[]; preview: Map<string, RoutineExercise[]>
  last: Workout[]; setCount: Map<string, number>
  /** Per workout (by id): each set's lift and strength, for the progressive-overload card. */
  liftSets: Map<string, { exercise: string; e1rm: number; reps: number; cardio: boolean }[]>
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
      pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: u, sort: 'position', expand: 'exercise', fields: 'routine,target_sets,expand.exercise.name,expand.exercise.muscle,expand.exercise.secondary,expand.exercise.primaries,expand.exercise.kind' }),
      pb.collection('workouts').getList<Workout>(1, 14, { filter: u, sort: '-started_at' }),
      pb.collection('workout_sets').getFullList<WSet>({ filter: pb.filter('user = {:u} && performed_at >= {:d} && completed = true', { u: me(), d: since }), expand: 'exercise', fields: 'workout,performed_at,expand.exercise.muscle,expand.exercise.secondary,expand.exercise.primaries,expand.exercise.kind', batch: 1000 }),
    ]).then(async ([routines, rex, last, sets]) => {
      const preview = new Map<string, RoutineExercise[]>()
      for (const r of rex) if (r.expand?.exercise) preview.set(r.routine, [...(preview.get(r.routine) ?? []), r])
      const byW = new Map<string, WSet[]>()
      for (const s of sets) byW.set(s.workout, [...(byW.get(s.workout) ?? []), s])
      const recent = [...byW.values()].map((ss) => ({ at: new Date(ss[0].performed_at), sets: ss }))
      // Set counts for the calorie estimate (denser sessions burn more).
      const setCount = new Map<string, number>()
      const liftSets: Data['liftSets'] = new Map()
      if (last.items.length) {
        const rows = await pb.collection('workout_sets').getFullList<WSet>({ filter: last.items.map((w) => `workout="${w.id}"`).join(' || ') + ' && completed = true', fields: 'workout,exercise,e1rm_kg,reps,seconds,distance_km,set_type', batch: 2000 }).catch(() => [])
        for (const r of rows) {
          setCount.set(r.workout, (setCount.get(r.workout) ?? 0) + 1)
          if (r.set_type === 'warmup' || r.set_type === 'cooldown') continue
          liftSets.set(r.workout, [...(liftSets.get(r.workout) ?? []), { exercise: r.exercise, e1rm: r.e1rm_kg || 0, reps: r.reps || 0, cardio: r.distance_km > 0 || (r.seconds > 0 && !r.reps) }])
        }
      }
      const d = { routines, preview, last: last.items, setCount, liftSets, recent }
      mem = { user: me(), data: d }
      if (live) setData(d)
    }).catch(() => live && setData((x) => x ?? { routines: [], preview: new Map(), last: [], setCount: new Map(), liftSets: new Map(), recent: [] }))
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
  const [skipping, setSkipping] = useState(false)
  // Skip whatever's highlighted (a workout or a rest day): the plan moves on to the next workout.
  const skip = async () => {
    if (up.status === 'none') return
    setSkipping(true)
    try { await savePlan(user.id, { ...plan, skip: { step: up.status === 'done' ? up.nextStep : up.step, at: new Date().toISOString() } }); await pb.collection('users').authRefresh() }
    catch { /* offline: nothing changes */ } finally { setSkipping(false) }
  }
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
          {/* Plan strip: where you are in the rotation. */}
          <PlanStrip user={user} routines={data.routines} current={up.status === 'done' ? up.nextStep : up.step} />
          <div className="flex gap-2">
            {routine && <Button className="flex-1" variant={up.status === 'train' ? 'primary' : 'ghost'} onClick={() => launch(routine)}>{up.status === 'train' ? `Start ${routine.name}` : `Start ${routine.name} anyway`}</Button>}
            <Button className={routine ? '!w-auto px-4' : 'flex-1'} variant="ghost" disabled={skipping} onClick={skip} data-skip-workout>
              {skipping ? 'Skipping…' : up.status === 'rest' ? 'Skip rest' : 'Skip'}
            </Button>
          </div>
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
  const [sheet, setSheet] = useState<'records' | 'weight' | 'overload' | null>(null)
  const ws = data.last
  if (!ws.length) return (
    <Section title="Last 14 Workouts"><Card><p className="text-sm text-muted">Finish a workout and your totals show up here.</p></Card></Section>
  )
  const chrono = [...ws].reverse()
  const vol = ws.reduce((t, w) => t + (w.volume_kg || 0), 0)
  const secs = ws.reduce((t, w) => t + (w.duration_s || 0), 0)
  const prs = ws.reduce((t, w) => t + (w.pr_count || 0), 0)
  const person = { kg: user.bodyweight_kg || 75, cm: user.height_cm || 175, age: 30, sex: user.sex }
  const kcal = ws.reduce((t, w) => t + liftingSession(w.duration_s || 0, data.setCount.get(w.id) ?? 0, person).kcal, 0)
  // Progressive overload: are your lifts getting stronger? (Volume swings with what you trained that day; est. 1RM doesn't.)
  const ov = overload(chrono.map((w) => ({ id: w.id, sets: data.liftSets?.get(w.id) ?? [] })))
  const dir = !ov.lifts ? 'none' : ov.change >= 0.01 ? 'up' : ov.change <= -0.01 ? 'down' : 'flat'
  const scores = ov.perWorkout.filter((x): x is number => x !== null)
  const lo = Math.min(1, ...scores), hi = Math.max(1, ...scores)
  const barH = (x: number | null) => (x === null ? 10 : 18 + ((x - lo) / Math.max(0.0001, hi - lo)) * 82)
  const pct = `${ov.change >= 0 ? '+' : '−'}${Math.abs(Math.round(ov.change * 1000) / 10)}%`
  const bws = chrono.map((w) => w.bodyweight_kg).filter((x) => x > 0)
  const bw = user.bodyweight_kg || bws[bws.length - 1] || 0
  const bwDelta = bws.length > 1 ? bws[bws.length - 1] - bws[0] : 0
  const bwLabel = Math.abs(bwDelta) < 0.5 ? 'Stable weight' : bwDelta > 0 ? `Up ${fmtW(bwDelta, unit)} ${unit}` : `Down ${fmtW(-bwDelta, unit)} ${unit}`
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60)
  const showKcal = nutritionOn(user)

  return (
    <Section title={`Last ${ws.length} Workout${ws.length === 1 ? '' : 's'}`}>
      <button onClick={() => setSheet('overload')} className="block w-full text-left" aria-label="Progressive overload details">
        <Card className="flex items-center gap-4" data-volume data-overload={dir}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-muted">Progressive overload</p>
            {dir === 'none' ? (
              <p className="mt-1 text-sm text-muted">Repeat a lift and your strength trend shows here.</p>
            ) : <>
              <p className={`flex items-center gap-2 text-2xl font-black ${dir === 'up' ? 'text-accent' : dir === 'down' ? 'text-danger' : ''}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${dir === 'up' ? 'bg-accent text-accent-ink' : dir === 'down' ? 'bg-danger text-white' : 'bg-surface-2 text-muted'}`}>
                  {dir === 'flat' ? <span className="h-0.5 w-3 rounded-full bg-current" /> : <TrendIcon width={15} height={15} className={dir === 'down' ? '-scale-y-100' : ''} />}
                </span>
                <span className="num">{pct}</span>
              </p>
              <p className="text-sm font-semibold text-muted">{dir === 'up' ? 'Getting stronger' : dir === 'down' ? 'Getting weaker' : 'Holding steady'} · {ov.lifts} lift{ov.lifts === 1 ? '' : 's'}</p>
            </>}
            <p className="num mt-0.5 text-xs text-faint">Volume {fmtVol(vol, unit)} {unit}</p>
          </div>
          {/* A bar per workout: how strong it was against where each lift started (green above, red below). */}
          <div className="flex h-16 shrink-0 items-end gap-[3px]" aria-hidden>
            {chrono.map((w, i) => {
              const x = ov.perWorkout[i]
              const tone = x === null ? 'bg-faint/40' : x > 1.005 ? 'bg-accent' : x < 0.995 ? 'bg-danger' : 'bg-muted'
              return (
                <span key={w.id} className="relative h-full w-[7px] rounded-full bg-surface-2">
                  <span className={`absolute inset-x-0 bottom-0 rounded-full ${tone}`} style={{ height: `${barH(x)}%` }} />
                </span>
              )
            })}
          </div>
        </Card>
      </button>
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
      {sheet === 'overload' && <OverloadSheet workouts={chrono} ov={ov} unit={unit} onClose={() => setSheet(null)} />}
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

/**
 * Progressive overload, in detail: each lift (improving, steady or slipping, start → now) and each of the workouts
 * (how strong it was against your usual, with off days marked so you can see they don't sink the trend).
 */
function OverloadSheet({ workouts, ov, unit, onClose }: { workouts: Workout[]; ov: ReturnType<typeof overload>; unit: 'kg' | 'lb'; onClose: () => void }) {
  const [names, setNames] = useState<Map<string, string>>(new Map())
  useEffect(() => { loadExercises().then((l) => setNames(new Map(l.map((e) => [e.id, e.name])))).catch(() => {}) }, [])
  const pctOf = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10)}%`
  const tone = (x: number) => (x >= 0.01 ? 'text-accent' : x <= -0.01 ? 'text-danger' : 'text-muted')
  const score = (v: number, reps: boolean) => (reps ? `${Math.round(v)} reps` : `${fmtW(v, unit)} ${unit}`)
  const dir = !ov.lifts ? 'none' : ov.change >= 0.01 ? 'up' : ov.change <= -0.01 ? 'down' : 'flat'
  const newest = [...workouts].map((w, i) => ({ w, x: ov.perWorkout[i] })).reverse()
  return (
    <BottomSheet title="Progressive overload" onClose={onClose}>
      <div className="space-y-4" data-overload-sheet>
        <div className="rounded-2xl bg-surface-2 p-3">
          {dir === 'none' ? <p className="text-sm text-muted">No lift was done twice in these workouts yet, so there's no trend to show.</p> : <>
            <p className={`num text-2xl font-black ${tone(ov.change)}`}>{pctOf(ov.change)} <span className="text-base font-bold">{dir === 'up' ? 'getting stronger' : dir === 'down' ? 'getting weaker' : 'holding steady'}</span></p>
            <p className="mt-1 text-xs text-muted">Across {ov.lifts} lift{ov.lifts === 1 ? '' : 's'} you did more than once in your last {workouts.length} workouts. Each lift's trend uses every session, so one off day barely moves it.</p>
          </>}
        </div>

        {ov.detail.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">By lift</h3>
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {ov.detail.map((l) => (
                <div key={l.exercise} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{names.get(l.exercise) ?? 'Exercise'}</span>
                    <span className="num block text-xs text-muted">{score(l.first, l.reps)} → {score(l.last, l.reps)}{l.reps ? '' : ' est. 1RM'} · {l.sessions} sessions{l.sessions === 2 ? ' (counts less)' : ''}</span>
                  </span>
                  <span className={`num shrink-0 text-sm font-black ${tone(l.change)}`}>{Math.abs(l.change) < 0.01 ? 'steady' : pctOf(l.change)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Each workout, against your usual</h3>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {newest.map(({ w, x }) => {
              const d = x === null ? null : x - 1
              const tag = d === null ? '' : d <= -0.05 ? 'Off day' : d >= 0.05 ? 'Strong day' : ''
              return (
                <Link key={w.id} to={`/w/${w.id}`} onClick={onClose} className="flex items-center gap-3 px-3 py-2.5 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{w.name || 'Workout'}</span>
                    <span className="block text-xs text-muted">{new Date(w.started_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{tag && <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${d! < 0 ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'}`}>{tag}</span>}</span>
                  </span>
                  <span className={`num shrink-0 text-sm font-bold ${d === null ? 'text-faint' : tone(d)}`}>{d === null ? 'no repeat lifts' : Math.abs(d) < 0.01 ? 'usual' : pctOf(d)}</span>
                  <ChevronIcon width={14} height={14} className="shrink-0 text-faint" />
                </Link>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">Each workout's lifts against your typical level for them across these workouts. Tap one to open it.</p>
        </section>
        <Link to="/stats" onClick={onClose} className="block text-center text-sm font-semibold text-accent">See every lift in Stats</Link>
      </div>
    </BottomSheet>
  )
}

/** Logged bodyweight over the last 14 days: weigh-ins, plus the bodyweight saved with each workout. */
function WeightSheet({ workouts, unit, onClose }: { workouts: Workout[]; unit: 'kg' | 'lb'; onClose: () => void }) {
  const [pts, setPts] = useState<{ t: number; kg: number }[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [reload, setReload] = useState(0)
  const save = async () => {
    const v = parseFloat(val.replace(',', '.'))
    if (!(v > 0)) return
    setBusy(true); setErr('')
    try { await logWeighIn(fromUnit(v, unit)); setAdding(false); setVal(''); setReload((n) => n + 1) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
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
  }, [workouts, reload])
  const vals = pts?.map((p) => Math.round(toUnit(p.kg, unit) * 10) / 10) ?? []
  const delta = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0
  return (
    <BottomSheet title="Bodyweight · last 14 days" onClose={onClose}>
      <div>
      {!pts ? <Spinner /> : !pts.length ? <p className="py-6 text-center text-sm text-muted">No weight logged in the last 14 days. Tap + to log today's weight.</p> : (
        <div className="space-y-3" data-weight-chart>
          <div className="flex items-end justify-between">
            <p className="num text-3xl font-black">{vals[vals.length - 1]} <span className="text-base font-bold">{unit}</span></p>
            {vals.length > 1 && <p className={`num text-sm font-bold ${Math.abs(delta) < 0.1 ? 'text-muted' : 'text-accent'}`}>{delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10} {unit} · {vals.length} readings</p>}
          </div>
          <LineChart className="h-56" labels={pts.map((p) => new Date(p.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} values={vals} yTitle={unit} />
        </div>
      )}
      {adding ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); save() }} data-weigh-in>
          <div className="flex gap-2">
            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" placeholder={`Today's weight (${unit})`}
              className="num h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-base outline-none placeholder:text-faint focus:border-accent" />
            <Button className="!w-auto px-5" disabled={busy || !(parseFloat(val.replace(',', '.')) > 0)}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
          {err && <p className="text-sm font-semibold text-danger">{err}</p>}
          <button type="button" onClick={() => { setAdding(false); setErr('') }} className="w-full text-center text-sm font-semibold text-muted">Cancel</button>
        </form>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3">
          <Link to="/profile" onClick={onClose} className="text-sm font-semibold text-accent">See all on Profile</Link>
          <button onClick={() => setAdding(true)} aria-label="Log today's weight" data-add-weight
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink shadow-lg active:scale-95">
            <PlusIcon width={24} height={24} />
          </button>
        </div>
      )}
      </div>
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
