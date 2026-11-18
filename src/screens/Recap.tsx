import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LockIcon, TrophyIcon } from '../components/icons'
import { Button, Card, ErrorText, Spinner, Stat } from '../components/ui'
import { prevFor } from '../lib/active'
import { distLabel, epley, fmtDist, fmtDur, fmtVol, fmtW } from '../lib/format'
import { me, pb, useUnit, type Exercise, type Unit, type WSet, type Workout } from '../lib/pb'

type Item = { ex: Exercise; sets: WSet[]; prev: WSet[]; priorBest: number }

const vol = (s: WSet[]) => s.reduce((t, x) => t + x.weight_kg * x.reps, 0)
const best1rm = (s: WSet[]) => Math.max(0, ...s.map((x) => epley(x.weight_kg, x.reps)))

function Delta({ v, fmt }: { v: number; fmt: (n: number) => string }) {
  if (Math.abs(v) < 0.05) return <span className="text-muted">same as last time</span>
  return <span className={v > 0 ? 'text-accent' : 'text-danger'}>{v > 0 ? '▲' : '▼'} {fmt(Math.abs(v))} vs last time</span>
}

function setLine(s: WSet, ex: Exercise, unit: Unit) {
  if (ex.kind === 'duration') return `${s.seconds}s`
  if (ex.kind === 'cardio') return `${fmtDist(s.distance_km, unit)}${distLabel(unit)}/${Math.round(s.seconds / 60)}m`
  if (ex.kind === 'bodyweight' && !s.weight_kg) return `${s.reps}`
  return `${fmtW(s.weight_kg, unit)}×${s.reps}`
}

export default function Recap() {
  const { id } = useParams()
  const unit = useUnit()
  const [w, setW] = useState<Workout | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      const wk = await pb.collection('workouts').getOne<Workout>(id!)
      const sets = await pb.collection('workout_sets').getFullList<WSet>({ filter: pb.filter('workout = {:w}', { w: id }), sort: 'position,set_index', expand: 'exercise' })
      const groups: Item[] = []
      for (const s of sets) {
        const last = groups[groups.length - 1]
        if (last && last.sets[0].position === s.position) last.sets.push(s)
        else if (s.expand?.exercise) groups.push({ ex: s.expand.exercise, sets: [s], prev: [], priorBest: 0 })
      }
      await Promise.all(groups.map(async (g) => {
        g.prev = await prevFor(g.ex.id, wk.started_at).catch(() => [])
        try {
          const b = await pb.collection('workout_sets').getFirstListItem<WSet>(
            pb.filter('user = {:u} && exercise = {:e} && performed_at < {:d}', { u: me(), e: g.ex.id, d: wk.started_at }), { sort: '-e1rm_kg', fields: 'e1rm_kg' })
          g.priorBest = b.e1rm_kg
        } catch { /* first time */ }
      }))
      setW(wk)
      setItems(groups)
    })().catch((e) => setErr(String(e?.message ?? e)))
  }, [id])

  if (err) return <div className="p-6"><ErrorText>{err}</ErrorText></div>
  if (!w || !items) return <Spinner />

  const totalSets = items.reduce((t, i) => t + i.sets.length, 0)

  return (
    <section className="mx-auto max-w-lg space-y-3 px-safe pb-10 pt-6">
      <p className="text-sm font-bold uppercase tracking-wider text-accent">Workout complete</p>
      <h1 className="flex items-center gap-2 text-[32px] font-extrabold leading-tight tracking-tight">
        {w.name}{w.visibility === 'private' && <LockIcon width={22} height={22} className="text-muted" />}
      </h1>
      <Card className="grid grid-cols-4 gap-2">
        <Stat value={fmtDur(w.duration_s)} label="Time" />
        <Stat value={fmtVol(w.volume_kg, unit)} label={unit} />
        <Stat value={totalSets} label="Sets" />
        <Stat value={w.pr_count} label="PRs" />
      </Card>

      {items.map((it) => {
        const k = it.ex.kind
        const pr = it.sets.some((s) => s.is_pr)
        const first = !it.prev.length
        return (
          <Card key={it.ex.id + it.sets[0].position} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-extrabold text-accent">{it.ex.name}</p>
              {pr && <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent"><TrophyIcon width={14} height={14} />PR</span>}
            </div>
            <p className="num text-sm text-muted">{it.sets.map((s) => setLine(s, it.ex, unit)).join('  ·  ')}</p>
            <div className="space-y-0.5 text-sm font-semibold">
              {first ? <p className="text-accent">First time logging this — baseline set!</p> : k === 'weight' ? <>
                <p><span className="text-muted">Best est. 1RM </span><span className="num">{fmtW(best1rm(it.sets), unit)} {unit}</span> · <Delta v={best1rm(it.sets) - best1rm(it.prev)} fmt={(n) => `${fmtW(n, unit)} ${unit}`} /></p>
                <p><span className="text-muted">Volume </span><span className="num">{fmtVol(vol(it.sets), unit)} {unit}</span> · <Delta v={vol(it.sets) - vol(it.prev)} fmt={(n) => `${fmtVol(n, unit)} ${unit}`} /></p>
              </> : k === 'duration' ? (
                <p><span className="text-muted">Best hold </span>{Math.max(...it.sets.map((s) => s.seconds))}s · <Delta v={Math.max(...it.sets.map((s) => s.seconds)) - Math.max(0, ...it.prev.map((s) => s.seconds))} fmt={(n) => `${n}s`} /></p>
              ) : k === 'cardio' ? (
                <p><span className="text-muted">Distance </span>{fmtDist(it.sets.reduce((t, s) => t + s.distance_km, 0), unit)} {distLabel(unit)} · <Delta v={it.sets.reduce((t, s) => t + s.distance_km, 0) - it.prev.reduce((t, s) => t + s.distance_km, 0)} fmt={(n) => `${fmtDist(n, unit)} ${distLabel(unit)}`} /></p>
              ) : (
                <p><span className="text-muted">Total reps </span>{it.sets.reduce((t, s) => t + s.reps, 0)} · <Delta v={it.sets.reduce((t, s) => t + s.reps, 0) - it.prev.reduce((t, s) => t + s.reps, 0)} fmt={(n) => `${n}`} /></p>
              )}
              {pr && it.priorBest > 0 && <p className="text-accent">New best est. 1RM — up {fmtW(best1rm(it.sets) - it.priorBest, unit)} {unit} on your previous record</p>}
            </div>
          </Card>
        )
      })}

      <div className="space-y-2 pt-2">
        <Link to={`/w/${w.id}`}><Button variant="ghost">View post</Button></Link>
        <Link to="/feed" replace><Button className="mt-2">Done</Button></Link>
      </div>
    </section>
  )
}
