import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LockIcon, TrashIcon } from '../components/icons'
import { Button, Card, ConfirmSheet, Empty, Screen, Spinner } from '../components/ui'
import { fmtDate, fmtDur, fmtVol } from '../lib/format'
import { deleteWorkout } from '../lib/history'
import { me, pb, useUnit, type Workout } from '../lib/pb'

export default function History() {
  const unit = useUnit()
  const [list, setList] = useState<Workout[] | null>(null)
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [toDelete, setToDelete] = useState<Workout | null>(null)

  useEffect(() => {
    pb.collection('workouts').getList<Workout>(page, 30, { filter: pb.filter('user = {:u}', { u: me() }), sort: '-started_at' })
      .then((r) => { setList((l) => (page === 1 ? r.items : [...(l ?? []), ...r.items])); setMore(r.page < r.totalPages) })
      .catch(() => setList([]))
  }, [page])

  return (
    <Screen title="History" back>
      {!list ? <Spinner /> : !list.length ? <Empty title="No workouts yet" body="Finished workouts show up here." /> : (
        <>
          {list.map((w) => (
            <Card key={w.id} className="flex items-center gap-2 py-3 pr-2">
              <Link to={`/w/${w.id}`} className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-bold">{w.name}{w.visibility === 'private' && <LockIcon width={14} height={14} className="shrink-0 text-muted" />}</p>
                <p className="text-xs text-muted">{fmtDate(w.started_at)} · {fmtDur(w.duration_s)} · {fmtVol(w.volume_kg, unit)} {unit}{w.pr_count > 0 ? ` · ${w.pr_count} PR` : ''}</p>
              </Link>
              <Link to={`/w/${w.id}/edit`} className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-bold" aria-label={`Edit ${w.name}`}>Edit</Link>
              <button onClick={() => setToDelete(w)} aria-label={`Delete ${w.name}`} className="shrink-0 p-2 text-faint"><TrashIcon width={18} height={18} /></button>
            </Card>
          ))}
          {more && <Button variant="ghost" onClick={() => setPage((p) => p + 1)}>Load more</Button>}
        </>
      )}
      {toDelete && (
        <ConfirmSheet title="Delete this workout?" confirmLabel="Delete workout"
          body={<>“{toDelete.name}” on {fmtDate(toDelete.started_at)} will be permanently deleted, along with its sets, comments and reactions. It will be removed from your stats. This can't be undone.</>}
          onConfirm={async () => { await deleteWorkout(toDelete.id); setList((l) => l?.filter((x) => x.id !== toDelete.id) ?? null) }}
          onClose={() => setToDelete(null)} />
      )}
    </Screen>
  )
}
