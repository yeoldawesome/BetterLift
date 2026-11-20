import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExerciseList, ExercisePicker } from '../components/ExerciseList'
import { PlusIcon } from '../components/icons'
import { Button, ErrorText, Input, Screen, Sheet, Spinner } from '../components/ui'
import { makeEx, routineDraft, routineExercises, saveRoutineDraft, useActive, type AEx, type ASet } from '../lib/active'
import { errMsg, pb, restFor as liftRest, useUnit, useUser, type Exercise, type Routine } from '../lib/pb'
import { ask } from '../components/Dialog'
import { ExerciseBlock, ReorderSheet } from './Workout'

/**
 * Edit a routine with the same exercise cards as a live workout: every set has its type (warm-up, failure…) and its
 * planned weight × reps, or time / distance for cardio and holds. Changes save automatically.
 */
export default function RoutineEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useUser()
  const unit = useUnit()
  const { active, start } = useActive()
  const [r, setR] = useState<Routine | null>(null)
  const [list, setListState] = useState<AEx[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [replacing, setReplacing] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const pendingRoutine = useRef(new Set<Promise<unknown>>())

  // Record ids on the server; saves are queued one after another and debounced while typing.
  const saved = useRef(new Set<string>())
  const latest = useRef<AEx[] | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!dirty.current || !latest.current) return queue.current
    dirty.current = false
    const snapshot = latest.current
    queue.current = queue.current.then(() => saveRoutineDraft(id!, snapshot, unit, saved.current)).then(() => setErr(''), (e) => { dirty.current = true; setErr(errMsg(e)) })
    return queue.current
  }, [id, unit])

  const setList = (fn: (xs: AEx[]) => AEx[]) => setListState((xs) => {
    const next = fn(xs ?? [])
    latest.current = next
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
    return next
  })

  useEffect(() => {
    pb.collection('routines').getOne<Routine>(id!).then(setR).catch((e) => setErr(errMsg(e)))
    routineDraft(id!, unit).then((xs) => {
      saved.current = new Set(xs.map((x) => x.key))
      latest.current = xs
      setListState(xs)
    }).catch((e) => setErr(errMsg(e)))
  }, [id])
  // Leaving the screen saves whatever is still pending.
  useEffect(() => () => { flush() }, [flush])

  const saveRoutine = (patch: Partial<Routine>) => {
    const p = pb.collection('routines').update(id!, patch).catch((e) => setErr(errMsg(e)))
    pendingRoutine.current.add(p); p.finally(() => pendingRoutine.current.delete(p))
  }

  const setEx = (key: string, fn: (x: AEx) => AEx) => setList((xs) => xs.map((x) => (x.key === key ? fn(x) : x)))
  const setSet = (key: string, i: number, patch: Partial<ASet>) => setEx(key, (x) => ({ ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const move = (key: string, d: -1 | 1) => setList((xs) => {
    const i = xs.findIndex((e) => e.key === key), j = i + d
    if (i < 0 || j < 0 || j >= xs.length) return xs
    const out = [...xs]; [out[i], out[j]] = [out[j], out[i]]
    return out
  })
  const moveTo = (from: number, to: number) => setList((xs) => {
    const out = [...xs]
    const [it] = out.splice(from, 1)
    out.splice(to, 0, it)
    return out
  })

  const add = async (exs: Exercise[]) => {
    setPicking(false)
    const made = await Promise.all(exs.map(async (e) => {
      const rest = liftRest(e, user)
      const x = await makeEx(e, 3, rest.rest, '', rest.after)
      const timed = e.kind === 'duration' || e.kind === 'cardio'
      return { ...x, sets: x.sets.map((s) => (timed ? s : { ...s, r: '10' })) }
    }))
    setList((xs) => [...xs, ...made])
  }
  const replace = async (key: string, ex: Exercise) => {
    setReplacing(null)
    const rest = liftRest(ex, user)
    const made = await makeEx(ex, 1, rest.rest, '', rest.after)
    // Keep the set count and types; values reset since the new lift is different.
    setList((xs) => xs.map((e) => (e.key === key ? { ...made, key: made.key, note: e.note, sets: e.sets.map((s) => ({ ...s, w: '', sec: '', dist: '' })) } : e)))
  }

  const saveAndClose = async () => {
    setSaving(true)
    ;(document.activeElement as HTMLElement | null)?.blur()
    await new Promise((res) => setTimeout(res, 0))
    await Promise.allSettled([...pendingRoutine.current])
    await flush()
    setSaving(false)
    if (!dirty.current) nav('/routines')
  }

  const launch = async () => {
    if (active && !await ask({ title: 'You have a workout in progress', body: 'Starting this routine replaces it.', confirmLabel: 'Replace', danger: true })) return
    await flush()
    start(r!.name, r!.id, await routineExercises(r!.id))
    nav('/workout')
  }

  if (!r || !list) return <Screen title="Routine" back><ErrorText>{err}</ErrorText>{!err && <Spinner />}</Screen>

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
      <div className="space-y-3" data-routine-cards>
        {list.map((x) => (
          <ExerciseBlock key={x.key} x={x} unit={unit} setEx={setEx} setSet={setSet} toggle={() => {}} planning
            onReorder={() => setReordering(true)} onReplace={() => setReplacing(x.key)}
            onRemove={() => setList((xs) => xs.filter((e) => e.key !== x.key))} onSuperset={() => {}} />
        ))}
      </div>
      <Button variant="ghost" onClick={() => setPicking(true)}><PlusIcon width={18} height={18} className="mr-1 inline" />Add exercises</Button>
      {list.length > 0 && <Button variant="ghost" onClick={launch}>Start this routine</Button>}
      <Button onClick={saveAndClose} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      {picking && <ExercisePicker onPick={add} onClose={() => setPicking(false)} />}
      {reordering && <ReorderSheet items={list} move={move} moveTo={moveTo} onClose={() => setReordering(false)} />}
      {replacing && <Sheet title="Replace exercise" onClose={() => setReplacing(null)}><ExerciseList onPick={(exs) => exs[0] && replace(replacing, exs[0])} /></Sheet>}
    </Screen>
  )
}
