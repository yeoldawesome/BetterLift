import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircleIcon, CommentIcon, FlameIcon, MailIcon, MuscleIcon, ReplyIcon, UserCheckIcon, UserPlusIcon, XCircleIcon } from '../components/icons'
import { Avatar, Card, Empty, Screen, Spinner } from '../components/ui'
import { timeAgo } from '../lib/format'
import { notifLink, useNotifications } from '../lib/notifications'
import { me, pb, type Notification, type NotificationType } from '../lib/pb'
import { useRealtime } from '../lib/useRealtime'

const ICON: Record<NotificationType, typeof CommentIcon> = {
  comment: CommentIcon, reply: ReplyIcon, reaction: FlameIcon, friend_request: UserPlusIcon, friend_accept: UserCheckIcon, nudge: MuscleIcon,
  exercise_approved: CheckCircleIcon, exercise_rejected: XCircleIcon, feedback_reply: MailIcon,
}
const TypeIcon = ({ type, size }: { type: NotificationType; size: number }) => {
  const Icon = ICON[type]
  return <Icon width={size} height={size} className={type === 'exercise_rejected' ? 'text-danger' : 'text-accent'} aria-hidden />
}

/** Every notification (newest first). Tapping one marks it read and opens what it's about. */
export default function Notifications() {
  const nav = useNavigate()
  const { count, markRead, markAll } = useNotifications()
  const [list, setList] = useState<Notification[] | null>(null)

  const load = useCallback(() => {
    pb.collection('notifications').getList<Notification>(1, 100, { filter: pb.filter('user = {:u}', { u: me() }), sort: '-created', expand: 'actor' })
      .then((r) => setList(r.items)).catch(() => setList([]))
  }, [])
  useEffect(load, [load])
  useRealtime(['notifications'], load)

  const open = (n: Notification) => {
    if (!n.read) { markRead([n.id]); setList((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null) }
    nav(notifLink(n))
  }
  const readAll = () => { markAll(); setList((l) => l?.map((x) => ({ ...x, read: true })) ?? null) }

  return (
    <Screen title="Notifications" back action={count > 0 && <button onClick={readAll} className="text-sm font-bold text-accent">Mark all read</button>}>
      {!list ? <Spinner /> : !list.length ? (
        <Empty title="All caught up" body="Comments, reactions, friend requests and exercise reviews will show up here." />
      ) : (
        <Card className="p-0">
          {list.map((n) => (
            <button key={n.id} onClick={() => open(n)}
              className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 active:bg-surface-2 ${n.read ? '' : 'bg-accent/10'}`}>
              <div className="relative shrink-0">
                {n.expand?.actor ? <Avatar user={n.expand.actor} size={42} /> : <div className="grid size-[42px] place-items-center rounded-full bg-surface-2"><TypeIcon type={n.type} size={22} /></div>}
                {n.expand?.actor && <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-surface ring-2 ring-canvas"><TypeIcon type={n.type} size={13} /></span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.read ? 'text-muted' : 'font-semibold'}`}>{n.text}</p>
                <p className="text-xs text-faint">{timeAgo(n.created)}</p>
              </div>
              {!n.read && <span className="size-2.5 shrink-0 rounded-full bg-danger" aria-label="Unread" />}
            </button>
          ))}
        </Card>
      )}
    </Screen>
  )
}
