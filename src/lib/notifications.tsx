import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { me, pb, useUser, type Notification, type NotificationType } from './pb'
import { refreshPush, setBadge } from './push'
import { useRealtime } from './useRealtime'

/** Which Profile tile a notification belongs to (its red dot clears when you open that tile). */
export type NotifCategory = 'social' | 'friends' | 'exercises' | 'feedback' | 'nudge'
export const CATEGORY: Record<NotificationType, NotifCategory> = {
  comment: 'social', reply: 'social', reaction: 'social',
  friend_request: 'friends', friend_accept: 'friends',
  exercise_approved: 'exercises', exercise_rejected: 'exercises',
  feedback_reply: 'feedback', nudge: 'nudge',
}

/** Where tapping a notification takes you. */
export function notifLink(n: Notification) {
  switch (n.type) {
    case 'comment': case 'reply': case 'reaction': return `/w/${n.target}`
    case 'friend_request': return '/friends'
    case 'friend_accept': return `/u/${n.target}`
    case 'nudge': return '/workout'
    case 'exercise_approved': case 'exercise_rejected': return `/exercises?open=${n.target}`
    case 'feedback_reply': return '/feedback'
  }
}

interface Ctx {
  unread: Notification[]
  count: number
  has: (c: NotifCategory) => boolean
  clear: (c: NotifCategory) => void
  markRead: (ids: string[]) => void
  markAll: () => void
}
const C = createContext<Ctx>({ unread: [], count: 0, has: () => false, clear: () => {}, markRead: () => {}, markAll: () => {} })
export const useNotifications = () => useContext(C)

/** Unread notifications for the signed-in user, kept live via realtime. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const [unread, setUnread] = useState<Notification[]>([])

  const load = useCallback(() => {
    if (!pb.authStore.isValid) return setUnread([])
    pb.collection('notifications').getFullList<Notification>({ filter: pb.filter('user = {:u} && read = false', { u: me() }), sort: '-created', expand: 'actor' })
      .then(setUnread).catch(() => {})
  }, [])
  useEffect(load, [user?.id, load])
  useEffect(() => { if (user?.id) refreshPush() }, [user?.id])
  // Home-screen icon badge = unread count (also set by pushes while the app is closed).
  useEffect(() => { setBadge(user ? unread.length : 0) }, [user, unread.length])
  useRealtime(user ? ['notifications'] : [], load)

  const markRead = useCallback((ids: string[]) => {
    if (!ids.length) return
    setUnread((xs) => xs.filter((n) => !ids.includes(n.id)))
    const b = pb.createBatch()
    ids.forEach((id) => b.collection('notifications').update(id, { read: true }))
    b.send().catch(() => load())
  }, [load])

  const value = useMemo<Ctx>(() => ({
    unread,
    count: unread.length,
    has: (c) => unread.some((n) => CATEGORY[n.type] === c),
    clear: (c) => markRead(unread.filter((n) => CATEGORY[n.type] === c).map((n) => n.id)),
    markRead,
    markAll: () => markRead(unread.map((n) => n.id)),
  }), [unread, markRead])

  return <C.Provider value={value}>{children}</C.Provider>
}

/** Call from a screen to clear its tile's red dot when it's opened. */
export function useClearOnVisit(c: NotifCategory) {
  const { has, clear } = useNotifications()
  const pending = has(c)
  useEffect(() => { if (pending) clear(c) }, [pending, c, clear])
}

export const isUnread = (n: Notification) => !n.read && n.user === me()
