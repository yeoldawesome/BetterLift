import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DotsIcon, DownIcon, TrashIcon, UpIcon } from '../components/icons'
import { BottomSheet, Button, Card, Empty, Screen, Spinner } from '../components/ui'
import { routineExercises, useActive } from '../lib/active'
import { errMsg, me, pb, type Routine, type RoutineExercise } from '../lib/pb'

const PREVIEW = 3
const sets = (n: number) => `${n} set${n === 1 ? '' : 's'}`
import { ask, tell } from '../components/Dialog'
import { WeeklyPlan } from '../components/WeeklyPlan'

export default function Routines() {
  const [list, setList] = useState<Routine[] | null>(null)
  const [items, setItems] = useState<Map<string, RoutineExercise[]>>(new Map())
  const [menu, setMenu] = useState<number | null>(null)
  const { active, start } = useActive()
  const nav = useNavigate()

  const load = () => {
    const f = pb.filter('user = {:u}', { u: me() })
    pb.collection('routines').getFullList<Routine>({ filter: f, sort: 'position,created' }).then(setList).catch((e) => tell(errMsg(e)))
    pb.collection('routine_exercises').getFullList<RoutineExercise>({ filter: f, sort: 'position', expand: 'exercise', fields: 'routine,target_sets,expand.exercise.name' })
      .then((rows) => {
        const m = new Map<string, RoutineExercise[]>()
        for (const r of rows) if (r.expand?.exercise) m.set(r.routine, [...(m.get(r.routine) ?? []), r])
        setItems(m)
      })
      .catch(() => {})
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    const r = await pb.collection('routines').create<Routine>({ user: me(), name: 'New routine', position: (list?.length ?? 0) })
    nav(`/routines/${r.id}`)
  }

  const move = async (i: number, d: -1 | 1) => {
    if (!list) return
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setList(next)
    await Promise.all(next.map((r, pos) => (r.position !== pos ? pb.collection('routines').update(r.id, { position: pos }) : null)))
    load()
  }

  const remove = async (r: Routine) => {
    if (!await ask({ title: `Delete “${r.name}”?`, confirmLabel: 'Delete', danger: true })) return
    await pb.collection('routines').delete(r.id)
    load()
  }

  const launch = async (r: Routine) => {
    if (active && !await ask({ title: 'You have a workout in progress', body: 'Starting this routine replaces it.', confirmLabel: 'Replace', danger: true })) return
    start(r.name, r.id, await routineExercises(r.id))
    nav('/workout')
  }

  return (
    <Screen title="Routines" action={<Button size="sm" onClick={create}>+ New</Button>}>
      {list && list.length > 0 && <WeeklyPlan routines={list} />}
      {!list ? <Spinner /> : !list.length ? (
        <Empty title="No routines" body="Build a routine to start workouts faster."><Button onClick={create}>Create routine</Button></Empty>
      ) : list.map((r) => {
        const ex = items.get(r.id) ?? []
        const total = ex.reduce((t, x) => t + (x.target_sets || 1), 0)
        const rest = ex.length - PREVIEW
        return (
          <Card key={r.id} className="space-y-3">
            <div className="flex items-start gap-2">
              <Link to={`/routines/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate text-xl font-extrabold">{r.name}</p>
                <p className="text-sm text-muted">{sets(total)}</p>
              </Link>
              <button onClick={() => setMenu(list.indexOf(r))} className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted active:bg-surface-2" aria-label={`${r.name} options`}><DotsIcon width={20} height={20} /></button>
            </div>
            {r.notes && <p className="line-clamp-2 whitespace-pre-line text-sm text-muted">{r.notes}</p>}
            {ex.length > 0 && (
              <Link to={`/routines/${r.id}`} className="block space-y-2.5">
                {ex.slice(0, PREVIEW).map((x, j) => (
                  <div key={j} className="min-w-0">
                    <p className="truncate font-semibold">{x.expand!.exercise!.name}</p>
                    <p className="text-sm text-muted">{sets(x.target_sets || 1)}</p>
                  </div>
                ))}
              </Link>
            )}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-muted">{rest > 0 ? `and ${rest} more…` : !ex.length ? 'No exercises yet' : ''}</span>
              <Button size="sm" onClick={() => launch(r)}>Start</Button>
            </div>
          </Card>
        )
      })}
      {menu !== null && list?.[menu] && (() => {
        const r = list[menu]
        const row = 'flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold active:bg-surface-2 disabled:opacity-30'
        const close = () => setMenu(null)
        return (
          <BottomSheet title={r.name} onClose={close}>
            <Link to={`/routines/${r.id}`} className={row}><span className="w-[18px]" />Edit routine</Link>
            <button disabled={menu === 0} onClick={() => { close(); move(menu, -1) }} className={row}><UpIcon width={18} height={18} />Move up</button>
            <button disabled={menu === list.length - 1} onClick={() => { close(); move(menu, 1) }} className={row}><DownIcon width={18} height={18} />Move down</button>
            <button onClick={() => { close(); remove(r) }} className={`${row} text-danger`}><TrashIcon width={18} height={18} />Delete</button>
          </BottomSheet>
        )
      })()}
    </Screen>
  )
}
