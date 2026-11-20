import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExercisePicker } from '../components/ExerciseList'
import { DownIcon, TimerIcon, TrashIcon, UpIcon } from '../components/icons'
import { RestPicker, restLabel } from '../components/RestPicker'
import { Button, Card, ErrorText, Input, Screen, Spinner } from '../components/ui'
import { routineExercises, useActive } from '../lib/active'
import { errMsg, me, pb, restFor as liftRest, useUser, type Exercise, type Routine, type RoutineExercise } from '../lib/pb'
import { ask } from '../components/Dialog'

export default function RoutineEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useUser()
  const { active, start } = useActive()
  const [r, setR] = useState<Routine | null>(null)
  const [items, setItems] = useState<RoutineExercise[]>([])
  const [picking, setPicking] = useState(false)
  const [restFor, setRestFor] = useState<RoutineExercise | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  // Edits save on blur; the Save button waits for any in-flight writes before leaving.
  const pending = useRef(new Set<Promise<unknown>>())
  const failed = useRef(false)
  const track = <T,>(p: Promise<T>) => { pending.current.add(p); p.finally(() => pending.current.delete(p)); return p }
  const fail = (e: unknown) => { failed.current = true; setErr(errMsg(e)) }

  const loadItems = () => pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: pb.filter('routine = {:r}', { r: id }), sort: 'position,created', expand: 'exercise' }).then(setItems)
  useEffect(() => {
    pb.collection('routines').getOne<Routine>(id!).then(setR).catch((e) => setErr(errMsg(e)))
    loadItems()
  }, [id])

  const saveRoutine = (patch: Partial<Routine>) => track(pb.collection('routines').update(id!, patch).catch(fail))
  const saveItem = (it: RoutineExercise, patch: Partial<RoutineExercise>) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))
    track(pb.collection('routine_exercises').update(it.id, patch).catch(fail))
  }

  const add = async (exs: Exercise[]) => {
    setPicking(false)
    for (const [i, e] of exs.entries()) {
      await pb.collection('routine_exercises').create({ routine: id, user: me(), exercise: e.id, position: items.length + i, target_sets: 3, reps: 10, rest_s: liftRest(e, user).rest })
    }
    loadItems()
  }

  const move = async (i: number, d: -1 | 1) => {
    const next = [...items]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setItems(next)
    await Promise.all(next.map((x, pos) => (x.position !== pos ? pb.collection('routine_exercises').update(x.id, { position: pos }) : null)))
    loadItems()
  }

  const remove = async (it: RoutineExercise) => { await pb.collection('routine_exercises').delete(it.id); loadItems() }

  const saveAndClose = async () => {
    setSaving(true); failed.current = false
    ;(document.activeElement as HTMLElement | null)?.blur() // flush the field being edited
    await new Promise((res) => setTimeout(res, 0))
    await Promise.allSettled([...pending.current])
    setSaving(false)
    if (!failed.current) nav('/routines')
  }

  const launch = async () => {
    if (active && !await ask({ title: 'You have a workout in progress', body: 'Starting this routine replaces it.', confirmLabel: 'Replace', danger: true })) return
    start(r!.name, r!.id, await routineExercises(r!.id))
    nav('/workout')
  }

  if (!r) return <Screen title="Routine" back><ErrorText>{err}</ErrorText>{!err && <Spinner />}</Screen>

  const numField = (it: RoutineExercise, k: 'target_sets' | 'reps', lbl: string) => (
    <label className="block text-center">
      <span className="block text-[10px] font-bold uppercase text-faint">{lbl}</span>
      <input inputMode="numeric" defaultValue={it[k] || ''} onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, '') }}
        onBlur={(e) => { const v = parseInt(e.target.value) || 0; if (v !== it[k]) saveItem(it, { [k]: k === 'target_sets' ? Math.max(1, v) : v }) }}
        className="num h-10 w-full rounded-lg bg-surface-2 text-center font-bold outline-none focus:ring-2 focus:ring-accent" />
    </label>
  )

  return (
    <Screen title="Edit routine" back>
      <Input label="Name" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && saveRoutine({ name: e.target.value.trim() })} />
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Description</span>
        <textarea defaultValue={r.notes} maxLength={1000} rows={3} onBlur={(e) => e.target.value !== r.notes && saveRoutine({ notes: e.target.value.trim() })}
          placeholder="What's this routine for? e.g. Upper body, heavy day. Run it Mondays and Thursdays."
          className="block w-full resize-y rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base text-ink outline-none placeholder:text-faint focus:border-accent" />
      </label>
      <ErrorText>{err}</ErrorText>
      {items.map((it, i) => (
        <Card key={it.id} className="space-y-2 p-3">
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate font-extrabold text-accent">{it.expand?.exercise?.name}</p>
            <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 text-muted disabled:opacity-30"><UpIcon width={18} height={18} /></button>
            <button disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1.5 text-muted disabled:opacity-30"><DownIcon width={18} height={18} /></button>
            <button onClick={() => remove(it)} className="p-1.5 text-faint"><TrashIcon width={18} height={18} /></button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {numField(it, 'target_sets', 'Sets')}
            {numField(it, 'reps', 'Reps')}
            <div className="text-center">
              <span className="block text-[10px] font-bold uppercase text-faint">Rest</span>
              <button onClick={() => setRestFor(it)} className="num flex h-10 w-full items-center justify-center gap-1 rounded-lg bg-surface-2 font-bold">
                <TimerIcon width={14} height={14} className="text-muted" />{restLabel(it.rest_s)}
              </button>
            </div>
          </div>
        </Card>
      ))}
      <Button variant="ghost" onClick={() => setPicking(true)}>+ Add exercises</Button>
      {items.length > 0 && <Button variant="ghost" onClick={launch}>Start this routine</Button>}
      <Button onClick={saveAndClose} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      {picking && <ExercisePicker onPick={add} onClose={() => setPicking(false)} />}
      {restFor && <RestPicker value={restFor.rest_s} title={`Rest · ${restFor.expand?.exercise?.name ?? ''}`} onSave={(v) => saveItem(restFor, { rest_s: v })} onClose={() => setRestFor(null)} />}
    </Screen>
  )
}
