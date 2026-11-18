import { useClearOnVisit } from '../lib/notifications'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EMOJI } from '../components/WorkoutCard'
import { Avatar, Card, Empty, Screen, Spinner } from '../components/ui'
import { timeAgo } from '../lib/format'
import { me, pb, type Comment, type Reaction, type User, type Workout } from '../lib/pb'
import { useRealtime } from '../lib/useRealtime'

type Item = { id: string; at: string; user?: User; workout?: Workout; text: string; emoji?: string }

/** Reactions and comments other people left on your workouts. */
export default function Activity() {
  useClearOnVisit('social')
  const [items, setItems] = useState<Item[] | null>(null)

  const load = useCallback(async () => {
    const filter = pb.filter('workout.user = {:u} && user != {:u}', { u: me() })
    const [rs, cs] = await Promise.all([
      pb.collection('reactions').getList<Reaction & { expand?: { user?: User; workout?: Workout } }>(1, 60, { filter, sort: '-created', expand: 'user,workout' }),
      pb.collection('comments').getList<Comment & { expand?: { user?: User; workout?: Workout } }>(1, 60, { filter, sort: '-created', expand: 'user,workout' }),
    ])
    const emoji = new Map(EMOJI)
    setItems([
      ...rs.items.map((r) => ({ id: r.id, at: r.created, user: r.expand?.user, workout: r.expand?.workout, text: 'reacted to', emoji: emoji.get(r.emoji) })),
      ...cs.items.map((c) => ({ id: c.id, at: c.created, user: c.expand?.user, workout: c.expand?.workout, text: `commented: “${c.body}” on` })),
    ].sort((a, b) => b.at.localeCompare(a.at)))
  }, [])

  useEffect(() => { load().catch(() => setItems([])) }, [load])
  useRealtime(['reactions', 'comments'], () => { load().catch(() => {}) })

  return (
    <Screen title="Reactions" back>
      {!items ? <Spinner /> : !items.length ? <Empty title="No reactions yet" body="When friends react to or comment on your workouts, it shows up here." /> : (
        <Card className="p-0">
          {items.map((i) => (
            <Link key={i.id} to={`/w/${i.workout?.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 active:bg-surface-2">
              <div className="relative">
                <Avatar user={i.user} size={40} />
                {i.emoji && <span className="absolute -bottom-1 -right-1 text-base">{i.emoji}</span>}
              </div>
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-bold">@{i.user?.username}</span> <span className="text-muted">{i.text}</span> <span className="font-semibold">{i.workout?.name}</span>
                <span className="block text-xs text-faint">{timeAgo(i.at)}</span>
              </p>
            </Link>
          ))}
        </Card>
      )}
    </Screen>
  )
}
