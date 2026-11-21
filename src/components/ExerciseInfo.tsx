import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { altNames, defaultLogTip, label, type Usage } from '../lib/exercises'
import { distLabel, epley, fmtDate, fmtDist, fmtMin, fmtW, timeAgo, toDist } from '../lib/format'
import { fmtMinutes, fmtPace } from '../lib/stats'
import { estimateCardio, isCardio } from '../lib/energy'
import { rpeLabel, usePerson } from './nutrition/CardioEffort'
import { intensityForExercise } from '../lib/muscles'
import { me, nutritionOn, pb, restFor, useUnit, useUser, userRest, userRestAfter, type Exercise, type Unit, type WSet } from '../lib/pb'
import { saveLiftRest } from '../lib/exercises'
import { RestPicker, restLabel } from './RestPicker'
import { TimerIcon } from './icons'
import { trendLine } from '../lib/stats'
import { BodyMap } from './BodyMap'
import { EquipmentUsed, equipmentFor } from './Equipment'
import { TrophyIcon } from './icons'
// Charts load on demand so chart.js stays out of the app's first download.
const LineChart = lazy(() => import('./LineChart').then((m) => ({ default: m.LineChart })))
import { Segmented, Sheet, Spinner } from './ui'

type Tab = 'about' | 'stats' | 'history'
type Session = { workout: string; name: string; date: Date; sets: WSet[]; bestE1: number; bestW: number; bestR: number; maxW: number; vol: number; reps: number; maxReps: number; maxSec: number; dist: number }

function setText(s: WSet, ex: Exercise, unit: Unit) {
  if (ex.kind === 'duration') return isCardio(ex) ? fmtMin(s.seconds) : `${s.seconds}s`
  if (ex.kind === 'cardio') return `${fmtDist(s.distance_km, unit)} ${distLabel(unit)} · ${Math.round(s.seconds / 60)} min`
  if (ex.kind === 'bodyweight' && !s.weight_kg) return `${s.reps} reps`
  return `${fmtW(s.weight_kg, unit)} ${unit} × ${s.reps}`
}

/** Lift info sheet with tabs: how-to + body graph, your stats & strongest set, and session history. */
export function ExerciseInfo({ ex, usage, userId, ownerName, initialTab = 'about', onClose, onEdit }: { ex: Exercise; usage?: Usage; userId?: string; ownerName?: string; initialTab?: Tab; onClose: () => void; onEdit?: () => void }) {
  const viewer = useUser()
  const unit = useUnit()
  const uid = userId ?? me()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [sets, setSets] = useState<WSet[] | null>(null)
  const nav = useNavigate()
  // Tapping a chart point: open that workout with the set highlighted.
  const openSet = (s: WSet) => { onClose(); nav(`/w/${s.workout}?set=${s.id}`) }

  useEffect(() => {
    pb.collection('workout_sets').getFullList<WSet>({
      filter: pb.filter('user = {:u} && exercise = {:e} && completed = true', { u: uid, e: ex.id }),
      sort: 'performed_at,set_index', expand: 'workout', fields: 'id,workout,performed_at,set_index,weight_kg,reps,seconds,distance_km,e1rm_kg,is_pr,avg_hr,rpe,kcal,expand.workout.name',
    }).then(setSets).catch(() => setSets([]))
  }, [ex.id, uid])

  const sessions = useMemo<Session[]>(() => {
    const m = new Map<string, Session>()
    for (const s of sets ?? []) {
      const x = m.get(s.workout) ?? { workout: s.workout, name: s.expand?.workout?.name ?? 'Workout', date: new Date(s.performed_at), sets: [], bestE1: 0, bestW: 0, bestR: 0, maxW: 0, vol: 0, reps: 0, maxReps: 0, maxSec: 0, dist: 0 }
      x.sets.push(s)
      const e1 = epley(s.weight_kg, s.reps)
      if (e1 > x.bestE1 || (e1 === x.bestE1 && s.weight_kg > x.bestW)) { x.bestE1 = e1; x.bestW = s.weight_kg; x.bestR = s.reps }
      x.maxW = Math.max(x.maxW, s.weight_kg)
      x.vol += s.weight_kg * s.reps
      x.reps += s.reps
      x.maxReps = Math.max(x.maxReps, s.reps)
      x.maxSec = Math.max(x.maxSec, s.seconds)
      x.dist += s.distance_km
      m.set(s.workout, x)
    }
    return [...m.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [sets])

  const strongest = useMemo(() => (sets ?? []).reduce<WSet | null>((b, s) => (!b || epley(s.weight_kg, s.reps) > epley(b.weight_kg, b.reps) ? s : b), null), [sets])
  const isSelf = uid === me()
  const tag = 'rounded-full px-2.5 py-1 text-xs font-bold'

  return (
    <Sheet title={ex.name} subtitle={altNames(ex.name).length ? `Also called ${altNames(ex.name).join(', ')}` : undefined} onClose={onClose}>
      <div className="space-y-4 pb-8">
        <Segmented value={tab} onChange={setTab} options={[['about', 'Lift info'], ['stats', 'Stats'], ['history', 'History']]} />

        {!isSelf && tab !== 'about' && <p className="rounded-xl bg-surface-2 px-3 py-2 text-center text-xs font-semibold text-muted">Showing {ownerName ? `@${ownerName}'s` : 'their'} lifts</p>}
        {tab === 'about' && <About ex={ex} sex={viewer?.sex} usage={isSelf ? usage : undefined} tag={tag} />}
        {tab === 'about' && isSelf && <LiftRest ex={ex} />}
        {tab === 'about' && onEdit && <button onClick={onEdit} className="h-11 w-full rounded-2xl bg-surface-2 text-sm font-bold">{ex.owner === me() ? 'Edit exercise' : ex.override ? 'Edit my version' : 'Edit for me'}</button>}

        {tab === 'stats' && (!sets ? <Spinner /> : !sessions.length ? (
          <p className="py-10 text-center text-sm text-muted">{isSelf ? 'Log this exercise to see your stats.' : 'No lifts to show — they may keep their lift stats private.'}</p>
        ) : <StatsTab ex={ex} unit={unit} sessions={sessions} strongest={strongest} own={uid === me()} onOpenSet={openSet} />)}

        {tab === 'history' && (!sets ? <Spinner /> : !sessions.length ? (
          <p className="py-10 text-center text-sm text-muted">No sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {[...sessions].reverse().slice(0, 30).map((s) => (
              <Link key={s.workout} to={`/w/${s.workout}`} onClick={onClose} className="block rounded-2xl border border-line bg-surface p-3 active:bg-surface-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-bold">{s.name}</p>
                  <p className="shrink-0 text-xs text-muted">{fmtDate(s.date.toISOString())}</p>
                </div>
                <p className="num mt-1 text-sm text-muted">
                  {s.sets.map((x, i) => <span key={x.id}>{i > 0 && '  ·  '}<span className={x.is_pr ? 'font-bold text-accent' : ''}>{setText(x, ex, unit)}</span></span>)}
                </p>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function About({ ex, sex, usage, tag }: { ex: Exercise; sex?: string; usage?: Usage; tag: string }) {
  const steps = (ex.instructions || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const u = usage?.get(ex.id)
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <span className={`${tag} bg-accent text-accent-ink`}>{label(ex.muscle)}</span>
        {(ex.co_primary ?? []).filter((m) => m !== ex.muscle).map((m) => <span key={m} className={`${tag} bg-accent text-accent-ink`}>{label(m)}</span>)}
        {(ex.secondary ?? []).filter((m) => m !== ex.muscle).map((m) => <span key={m} className={`${tag} bg-accent/20 text-accent`}>{label(m)}</span>)}
        <span className={`${tag} bg-surface-2 text-muted`}>{label(ex.equipment)}</span>
        {ex.owner && <span className={`${tag} bg-surface-2 text-muted`}>Custom</span>}
      </div>
      <div className="flex justify-center rounded-3xl border border-line bg-surface py-4">
        <BodyMap sex={sex} intensity={intensityForExercise(ex)} className="h-56" labels />
      </div>
      <div className="-mt-2 flex justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-accent" />Primary</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-accent/45" />Secondary</span>
      </div>
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">How to perform</h3>
        {steps.length ? (
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-black text-accent">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">No instructions yet. Edit this exercise to add some.</p>}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">How to log it</h3>
        <p className="rounded-2xl bg-surface-2 p-3 text-sm">{ex.log_tip || defaultLogTip(ex.kind, ex.equipment)}</p>
      </section>
      {equipmentFor(ex).length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Equipment used</h3>
          <EquipmentUsed ex={ex} />
        </section>
      )}
      {u && <p className="text-center text-xs text-muted">You've done this in {u.count} workout{u.count === 1 ? '' : 's'} · last {timeAgo(new Date(u.last).toISOString())}</p>}
    </>
  )
}

function StatsTab({ ex, unit, sessions, strongest, own, onOpenSet }: { ex: Exercise; unit: Unit; sessions: Session[]; strongest: WSet | null; own: boolean; onOpenSet: (s: WSet) => void }) {
  const k = ex.kind
  const viewer = useUser()
  const person = usePerson()
  const weighted = k === 'weight' || k === 'assisted' || (k === 'bodyweight' && sessions.some((s) => s.maxW > 0))
  const timed = k === 'duration' && isCardio(ex) // sports/conditioning: minutes per session, not longest hold
  const secs = (s: Session) => s.sets.reduce((t, x) => t + x.seconds, 0)
  const dist = distLabel(unit)
  // Cardio with no distance logged (bike with only time…) charts time instead.
  const cardioByTime = k === 'cardio' && !sessions.some((s) => s.dist > 0)
  const series = timed || cardioByTime ? sessions.map((s) => Math.round(secs(s) / 6) / 10) : k === 'duration' ? sessions.map((s) => s.maxSec) : k === 'cardio' ? sessions.map((s) => Math.round(toDist(s.dist, unit) * 100) / 100)
    : weighted ? sessions.map((s) => Number(fmtW(s.bestW, unit))) : sessions.map((s) => s.maxReps)
  // The set each chart point stands for (same rule as the value plotted).
  const score = (x: WSet) => timed || cardioByTime || k === 'duration' ? x.seconds : k === 'cardio' ? x.distance_km * 1e5 + x.seconds
    : weighted ? epley(x.weight_kg, x.reps) * 1e3 + x.weight_kg : x.reps
  const topSet = (s: Session) => s.sets.reduce((b, x) => (score(x) > score(b) ? x : b))
  const seriesLabel = timed || cardioByTime ? 'Time per session' : k === 'duration' ? 'Best hold' : k === 'cardio' ? `Distance per session (${dist})`
    : k === 'bodyweight' && weighted ? `Added weight, best set (+${unit})` : weighted ? `Best set each session (${unit})` : 'Best set (reps)'
  // Axis title + value format (time always in minutes/hours, never seconds).
  const yAxis: { yTitle: string; yFormat: (v: number) => string } = timed || cardioByTime ? { yTitle: 'Time', yFormat: (v) => fmtMinutes(v) }
    : k === 'duration' ? { yTitle: 'Hold', yFormat: (v) => (v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${Math.round(v)}s`) }
    : k === 'cardio' ? { yTitle: `Distance (${dist})`, yFormat: (v) => `${v} ${dist}` }
    : k === 'bodyweight' && weighted ? { yTitle: `Added (${unit})`, yFormat: (v) => `+${v} ${unit}` }
    : weighted ? { yTitle: `Weight (${unit})`, yFormat: (v) => `${v} ${unit}` } : { yTitle: 'Reps', yFormat: (v) => `${Math.round(v)} reps` }
  const paces = sessions.filter((s) => s.dist > 0 && secs(s) > 0).map((s) => secs(s) / 60 / toDist(s.dist, unit))
  const allSets = sessions.flatMap((s) => s.sets)
  const tiles: [string, string][] = weighted
    ? [[`${fmtW(Math.max(...sessions.map((s) => s.bestE1)), unit)} ${unit}`, 'Best est. 1RM'], [`${fmtW(Math.max(...sessions.map((s) => s.maxW)), unit)} ${unit}`, 'Heaviest weight'],
      [`${Math.max(...sessions.map((s) => s.maxReps))}`, 'Most reps (set)'], [`${sessions.length}`, 'Sessions'], [`${allSets.length}`, 'Total sets'],
      [`${Math.round(Number(fmtW(sessions.reduce((t, s) => t + s.vol, 0), unit))).toLocaleString()}`, `Total volume ${unit}`]]
    : timed
      ? [[fmtMin(Math.max(...sessions.map((s) => s.sets.reduce((t, x) => t + x.seconds, 0)))), 'Longest session'], [fmtMin(allSets.reduce((t, x) => t + x.seconds, 0)), 'Total time'], [`${sessions.length}`, 'Sessions']]
    : k === 'duration'
      ? [[`${Math.max(...sessions.map((s) => s.maxSec))}s`, 'Longest hold'], [`${sessions.length}`, 'Sessions'], [`${allSets.length}`, 'Total sets']]
      : k === 'cardio'
        ? [[`${fmtDist(sessions.reduce((t, s) => t + s.dist, 0), unit)} ${dist}`, 'Total distance'], [fmtMinutes(allSets.reduce((t, x) => t + x.seconds, 0) / 60), 'Total time'],
          ...(paces.length ? [[`${fmtPace(Math.min(...paces))} /${dist}`, 'Best pace'] as [string, string]] : []), [`${sessions.length}`, 'Sessions']]
        : [[`${Math.max(...sessions.map((s) => s.maxReps))}`, 'Most reps (set)'], [`${sessions.reduce((t, s) => t + s.reps, 0)}`, 'Total reps'], [`${sessions.length}`, 'Sessions']]
  // Cardio: effort is this exercise's "how hard" stat (like est. 1RM for a lift), plus heart rate and, with nutrition on, calories.
  const cardio = isCardio(ex)
  const rpeSets = allSets.filter((x) => (x.rpe ?? 0) > 0), hrSets = allSets.filter((x) => (x.avg_hr ?? 0) > 0)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const burned = cardio && own && person && nutritionOn(viewer)
    ? allSets.reduce((t, x) => t + estimateCardio({ name: ex.name, kind: ex.kind, seconds: x.seconds, distanceKm: x.distance_km, avgHr: x.avg_hr, rpe: x.rpe, kcal: x.kcal }, person).kcal, 0) : null
  const effortTiles: [string, string][] = !cardio ? [] : [
    ...(rpeSets.length ? [[`${Math.round(avg(rpeSets.map((x) => x.rpe!)) * 10) / 10}`, 'Avg effort (RPE)'] as [string, string], [`${Math.max(...rpeSets.map((x) => x.rpe!))}`, 'Hardest (RPE)'] as [string, string]] : []),
    ...(hrSets.length ? [[`${Math.round(avg(hrSets.map((x) => x.avg_hr!)))} bpm`, 'Avg heart rate'] as [string, string]] : []),
    ...(burned ? [[`${burned.toLocaleString()}`, 'Est. kcal burned'] as [string, string]] : []),
  ]
  const effortSessions = cardio ? sessions.filter((x) => x.sets.some((y) => (y.rpe ?? 0) > 0)) : []
  const effortSeries = effortSessions.map((x) => { const r = x.sets.filter((y) => (y.rpe ?? 0) > 0).map((y) => y.rpe!); return Math.round(avg(r) * 10) / 10 })

  return (
    <>
      {weighted && strongest && strongest.weight_kg > 0 && (
        <div className="rounded-3xl border border-accent/40 bg-accent/10 p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent"><TrophyIcon width={14} height={14} />Strongest set</p>
          <p className="num mt-1 text-3xl font-black">{fmtW(strongest.weight_kg, unit)} {unit} × {strongest.reps}</p>
          <p className="text-sm text-muted">Est. 1RM {fmtW(epley(strongest.weight_kg, strongest.reps), unit)} {unit} · {fmtDate(strongest.performed_at)}</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {[...tiles, ...effortTiles].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-surface-2 p-3 text-center">
            <p className="num truncate text-lg font-black">{v}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
          </div>
        ))}
      </div>
      {series.length > 1 && (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-1 text-xs font-bold text-muted">{seriesLabel}</p>
          <Suspense fallback={<div className="h-48" />}>
          <LineChart className="h-48" yTitle={yAxis.yTitle} yFormat={yAxis.yFormat} labels={sessions.map((s) => s.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} values={series} trend={trendLine(series)}
            onPoint={(i) => onOpenSet(topSet(sessions[i]))}
            extras={weighted ? sessions.map((s) => `${fmtW(s.bestW, unit)} ${unit} × ${s.bestR} reps · est. 1RM ${fmtW(s.bestE1, unit)}`) : undefined} />
          </Suspense>
        </div>
      )}
      {cardio && (effortSeries.length > 1 ? (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-1 text-xs font-bold text-muted">Effort per session (RPE 1–10)</p>
          <Suspense fallback={<div className="h-40" />}>
          <LineChart className="h-40" labels={effortSessions.map((x) => x.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} values={effortSeries} trend={trendLine(effortSeries)}
            onPoint={(i) => onOpenSet(effortSessions[i].sets.find((y) => (y.rpe ?? 0) > 0) ?? effortSessions[i].sets[0])}
            extras={effortSeries.map((v) => rpeLabel(Math.round(v)))} />
          </Suspense>
        </div>
      ) : own && !rpeSets.length ? (
        <p className="rounded-2xl bg-surface-2 p-3 text-center text-sm text-muted">Tap “Add effort” under a set to rate how hard it felt (RPE 1–10). It shows up here over time.</p>
      ) : null)}
    </>
  )
}

/** This lift's own rest timers (between sets / after the exercise), saved just for the current user. */
function LiftRest({ ex }: { ex: Exercise }) {
  const user = useUser()
  const [vals, setVals] = useState({ rest_s: ex.rest_s ?? 0, rest_after_s: ex.rest_after_s ?? 0 })
  const [editing, setEditing] = useState<'rest_s' | 'rest_after_s' | null>(null)
  const [err, setErr] = useState('')
  const eff = restFor(vals, user)
  const save = (k: 'rest_s' | 'rest_after_s', v: number) => {
    setVals((x) => ({ ...x, [k]: v }))
    saveLiftRest(ex, { [k]: v }).catch((e) => setErr(String(e?.message ?? e)))
  }
  const row = (k: 'rest_s' | 'rest_after_s', label: string, value: number) => (
    <button onClick={() => setEditing(k)} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-3 text-left">
      <TimerIcon width={20} height={20} className="text-accent" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-muted">{vals[k] === 0 ? 'Using your default' : 'Custom for this lift'}</span></span>
      <span className="num text-lg font-black">{restLabel(value)}</span>
    </button>
  )
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Rest timer</h3>
      <div className="space-y-2">
        {row('rest_s', 'Between sets', eff.rest)}
        {row('rest_after_s', 'After this exercise', eff.after)}
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      {editing && (
        <RestPicker value={editing === 'rest_s' ? eff.rest : eff.after} title={editing === 'rest_s' ? 'Between sets' : 'After this exercise'} subtitle={ex.name}
          onSave={(v) => save(editing, v || -1)} onClose={() => setEditing(null)}
          onUseDefault={() => save(editing, 0)} defaultValue={editing === 'rest_s' ? userRest(user) : userRestAfter(user)} />
      )}
    </section>
  )
}
