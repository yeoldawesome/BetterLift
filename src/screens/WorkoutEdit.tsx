import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExercisePicker } from '../components/ExerciseList'
import { GlobeIcon, LockIcon, PlusIcon, TrashIcon } from '../components/icons'
import { Button, Card, ErrorText, Input, Screen, Spinner } from '../components/ui'
import { clearBestCache } from '../lib/best'
import { distLabel, epley, fmtDist, fmtW, fromDist, fromUnit, num } from '../lib/format'
import { errMsg, me, newId, pb, useUnit, type Exercise, type Visibility, type WSet, type Workout } from '../lib/pb'
import { invalidateStats } from '../lib/statsData'

type ESet = { w: string; r: string; sec: string; dist: string }
type Block = { key: string; ex: Exercise; sets: ESet[] }

const pad = (n: number) => `${n}`.padStart(2, '0')
const toLocalInput = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
const blankSet = (): ESet => ({ w: '', r: '', sec: '', dist: '' })

/** Edit a finished workout: details, sets, exercises. Saves atomically and re-flags PRs for this workout. */
export default function WorkoutEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const unit = useUnit()
  const [w, setW] = useState<Workout | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState('')
  const [minutes, setMinutes] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [picking, setPicking] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const wk = await pb.collection('workouts').getOne<Workout>(id!)
      if (wk.user !== me()) throw new Error("You can only edit your own workouts.")
      const sets = await pb.collection('workout_sets').getFullList<WSet>({ filter: pb.filter('workout = {:w}', { w: id }), sort: 'position,set_index', expand: 'exercise' })
      const bs: Block[] = []
      for (const s of sets) {
        const last = bs[bs.length - 1]
        const row: ESet = { w: s.weight_kg ? fmtW(s.weight_kg, unit) : '', r: s.reps ? `${s.reps}` : '', sec: s.seconds ? `${s.seconds}` : '', dist: s.distance_km ? fmtDist(s.distance_km, unit) : '' }
        if (last && last.key === `p${s.position}`) last.sets.push(row)
        else if (s.expand?.exercise) bs.push({ key: `p${s.position}`, ex: s.expand.exercise, sets: [row] })
      }
      setW(wk); setName(wk.name); setNotes(wk.notes); setWhen(toLocalInput(wk.started_at))
      setMinutes(wk.duration_s ? `${Math.round(wk.duration_s / 60)}` : ''); setVisibility(wk.visibility === 'private' ? 'private' : 'public'); setBlocks(bs)
    })().catch((e) => setErr(errMsg(e)))
  }, [id])

  const setBlock = (key: string, fn: (b: Block) => Block) => setBlocks((bs) => bs.map((b) => (b.key === key ? fn(b) : b)))
  const setSet = (key: string, i: number, patch: Partial<ESet>) => setBlock(key, (b) => ({ ...b, sets: b.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      const startedAt = new Date(when)
      if (isNaN(startedAt.getTime())) throw new Error('Pick a valid date and time.')
      const rows = blocks.flatMap((b, pos) => b.sets.map((s, idx) => {
        const kg = fromUnit(num(s.w), unit), reps = Math.round(num(s.r))
        return { ex: b.ex, pos, idx, kg, reps, sec: Math.round(num(s.sec)), dist: fromDist(num(s.dist), unit), e1: b.ex.kind === 'weight' ? epley(kg, reps) : 0 }
      })).filter((r) => r.kg || r.reps || r.sec || r.dist)
      if (!rows.length) throw new Error('A workout needs at least one set. Delete it from History instead.')

      // PRs: compare against everything logged before this workout (excluding this workout's old sets).
      const iso = startedAt.toISOString()
      const prior = new Map<string, number>()
      await Promise.all([...new Set(rows.map((r) => r.ex.id))].map(async (exId) => {
        try {
          const b = await pb.collection('workout_sets').getFirstListItem<WSet>(
            pb.filter('user = {:u} && exercise = {:e} && workout != {:w} && performed_at < {:d}', { u: me(), e: exId, w: id, d: iso }), { sort: '-e1rm_kg', fields: 'e1rm_kg' })
          prior.set(exId, b.e1rm_kg)
        } catch { prior.set(exId, 0) }
      }))
      const prs = new Set<number>()
      for (const exId of new Set(rows.map((r) => r.ex.id))) {
        let bi = -1
        rows.forEach((r, i) => { if (r.ex.id === exId && r.e1 > 0 && (bi < 0 || r.e1 > rows[bi].e1)) bi = i })
        if (bi >= 0 && rows[bi].e1 > (prior.get(exId) ?? 0) + 0.01) prs.add(bi)
      }

      const old = await pb.collection('workout_sets').getFullList<WSet>({ filter: pb.filter('workout = {:w}', { w: id }), fields: 'id' })
      const durS = Math.max(0, Math.round(num(minutes) * 60))
      const b = pb.createBatch()
      b.collection('workouts').update(id!, {
        name: name.trim() || 'Workout', notes, started_at: iso, ended_at: new Date(startedAt.getTime() + durS * 1000).toISOString(), duration_s: durS, visibility,
        volume_kg: rows.reduce((t, r) => t + (r.ex.kind === 'weight' ? r.kg * r.reps : 0), 0), pr_count: prs.size,
      })
      old.forEach((s) => b.collection('workout_sets').delete(s.id))
      rows.forEach((r, i) => b.collection('workout_sets').create({
        workout: id, user: me(), exercise: r.ex.id, performed_at: iso, position: r.pos, set_index: r.idx,
        weight_kg: r.kg, reps: r.reps, seconds: r.sec, distance_km: r.dist, completed: true, e1rm_kg: r.e1, is_pr: prs.has(i),
      }))
      await b.send()
      invalidateStats(); clearBestCache()
      nav(`/w/${id}`, { replace: true })
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  if (!w) return <Screen title="Edit workout" back><ErrorText>{err}</ErrorText>{!err && <Spinner />}</Screen>

  return (
    <Screen title="Edit workout" back>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Input label="Date & time" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <Input label="Minutes" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
      </div>
      <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        {([['public', 'Public', GlobeIcon], ['private', 'Private', LockIcon]] as const).map(([v, t, Icon]) => (
          <button key={v} onClick={() => setVisibility(v)} className={`flex h-11 items-center justify-center gap-2 rounded-xl font-bold ${visibility === v ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>
            <Icon width={16} height={16} />{t}
          </button>
        ))}
      </div>

      {blocks.map((b) => {
        const k = b.ex.kind
        const cols: [keyof ESet, string][] = k === 'duration' ? [['sec', 'Sec']] : k === 'cardio' ? [['dist', distLabel(unit)], ['sec', 'Sec']] : [['w', unit], ['r', 'Reps']]
        return (
          <Card key={b.key} className="p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="truncate font-extrabold text-accent">{b.ex.name}</p>
              <button onClick={() => confirm(`Remove ${b.ex.name} from this workout?`) && setBlocks((bs) => bs.filter((x) => x.key !== b.key))} className="p-1.5 text-faint" aria-label="Remove exercise"><TrashIcon width={18} height={18} /></button>
            </div>
            <div className="grid gap-x-2 gap-y-1.5 text-center text-sm" style={{ gridTemplateColumns: `1.5rem ${cols.map(() => 'minmax(0,1fr)').join(' ')} 2.25rem` }}>
              <span className="text-[11px] font-bold uppercase text-faint">Set</span>
              {cols.map(([, l]) => <span key={l} className="text-[11px] font-bold uppercase text-faint">{l}</span>)}
              <span />
              {b.sets.map((s, i) => [
                <span key={`n${i}`} className="num self-center font-bold text-muted">{i + 1}</span>,
                ...cols.map(([f]) => (
                  <input key={`${f}${i}`} inputMode={f === 'r' || f === 'sec' ? 'numeric' : 'decimal'} value={s[f]} placeholder="0"
                    onChange={(e) => setSet(b.key, i, { [f]: f === 'r' || f === 'sec' ? e.target.value.replace(/\D/g, '') : e.target.value })}
                    className="num h-10 w-full min-w-0 rounded-lg bg-surface-2 text-center font-bold outline-none placeholder:text-faint focus:ring-2 focus:ring-accent" />
                )),
                <button key={`d${i}`} onClick={() => setBlock(b.key, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))} className="grid h-10 place-items-center text-faint" aria-label="Delete set"><TrashIcon width={16} height={16} /></button>,
              ])}
            </div>
            <button onClick={() => setBlock(b.key, (x) => ({ ...x, sets: [...x.sets, { ...blankSet(), w: x.sets[x.sets.length - 1]?.w ?? '' }] }))} className="mt-2 h-9 w-full rounded-lg bg-surface-2 text-sm font-bold">+ Add set</button>
          </Card>
        )
      })}

      <Button variant="ghost" onClick={() => setPicking(true)}><PlusIcon width={18} height={18} className="mr-1 inline" />Add exercises</Button>
      <ErrorText>{err}</ErrorText>
      <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      {picking && <ExercisePicker onClose={() => setPicking(false)} onPick={(exs) => { setPicking(false); setBlocks((bs) => [...bs, ...exs.map((ex) => ({ key: newId(), ex, sets: [blankSet(), blankSet(), blankSet()] }))]) }} />}
    </Screen>
  )
}
