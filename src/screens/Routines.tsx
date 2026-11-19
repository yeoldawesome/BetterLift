import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DownIcon, TrashIcon, UpIcon } from '../components/icons'
import { Button, Card, Empty, Screen, Spinner } from '../components/ui'
import { routineExercises, useActive } from '../lib/active'
import { errMsg, me, pb, type Routine } from '../lib/pb'
import { ask, tell } from '../components/Dialog'

export default function Routines() {
  const [list, setList] = useState<Routine[] | null>(null)
  const { active, start } = useActive()
  const nav = useNavigate()

  const load = () => pb.collection('routines').getFullList<Routine>({ filter: pb.filter('user = {:u}', { u: me() }), sort: 'position,created' }).then(setList).catch((e) => tell(errMsg(e)))
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
      {!list ? <Spinner /> : !list.length ? (
        <Empty title="No routines" body="Build a routine to start workouts faster."><Button onClick={create}>Create routine</Button></Empty>
      ) : list.map((r, i) => (
        <Card key={r.id} className="space-y-3">
          <Link to={`/routines/${r.id}`} className="block">
            <p className="text-lg font-extrabold">{r.name}</p>
            {r.notes && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-muted">{r.notes}</p>}
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => launch(r)}>Start</Button>
            <Link to={`/routines/${r.id}`} className="h-9 rounded-2xl bg-surface-2 px-3 text-sm font-bold leading-9">Edit</Link>
            <span className="flex-1" />
            <button disabled={i === 0} onClick={() => move(i, -1)} className="p-2 text-muted disabled:opacity-30"><UpIcon width={18} height={18} /></button>
            <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="p-2 text-muted disabled:opacity-30"><DownIcon width={18} height={18} /></button>
            <button onClick={() => remove(r)} className="p-2 text-faint"><TrashIcon width={18} height={18} /></button>
          </div>
        </Card>
      ))}
    </Screen>
  )
}
