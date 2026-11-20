import { useClearOnVisit, useNotifications } from '../lib/notifications'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Button, Card, ErrorText, Input, Screen, Segmented } from '../components/ui'
import { errMsg, me, pb, type Friendship, type Message, type User } from '../lib/pb'
import { ChatIcon } from '../components/icons'
import { useRealtime } from '../lib/useRealtime'
import { ask } from '../components/Dialog'

export default function Friends() {
  useClearOnVisit('friends')
  const uid = me()
  const [params, setParams] = useSearchParams()
  const tab = (['friends', 'messages', 'find'].includes(params.get('tab') ?? '') ? params.get('tab') : 'friends') as 'friends' | 'messages' | 'find'
  const setTab = (t: typeof tab) => setParams(t === 'friends' ? {} : { tab: t }, { replace: true })
  const { messages: unreadFrom, messageCount } = useNotifications()
  const [links, setLinks] = useState<Friendship[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [err, setErr] = useState('')

  const load = useCallback(() => pb.collection('friendships').getFullList<Friendship>({ expand: 'requester,addressee', sort: '-created' }).then(setLinks).catch((e) => setErr(errMsg(e))), [])
  useEffect(() => { load() }, [load])
  useRealtime(['friendships'], load)

  useEffect(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 3) return setResults([])
    const t = setTimeout(() => {
      // Server-side search (the users list itself is limited to you and your friends).
      pb.send<{ items: User[] }>('/api/betterlift/user-search', { query: { q: s } })
        .then((r) => setResults(r.items)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q, uid])

  const other = (f: Friendship) => (f.requester === uid ? f.expand?.addressee : f.expand?.requester)
  const linkWith = (u: User) => links.find((f) => f.requester === u.id || f.addressee === u.id)
  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setErr(errMsg(e)))
  const send = (u: User) => run(pb.collection('friendships').create({ requester: uid, addressee: u.id, status: 'pending' }))
  const accept = (f: Friendship) => run(pb.collection('friendships').update(f.id, { status: 'accepted' }))
  const remove = async (f: Friendship, msg?: string) => { if (!msg || await ask({ title: msg, confirmLabel: 'Remove', danger: true })) run(pb.collection('friendships').delete(f.id)) }

  const incoming = links.filter((f) => f.status === 'pending' && f.addressee === uid)
  const outgoing = links.filter((f) => f.status === 'pending' && f.requester === uid)
  const friends = links.filter((f) => f.status === 'accepted')

  const row = (u: User | undefined, actions: React.ReactNode) => (
    <div key={u?.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
      <Link to={`/u/${u?.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={u} size={40} />
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{u?.name || u?.username}</p><p className="truncate text-xs text-muted">@{u?.username}</p></div>
      </Link>
      <div className="flex gap-2">{actions}</div>
    </div>
  )

  return (
    <Screen title="Friends" back>
      <Segmented value={tab} onChange={setTab} options={[['friends', `Friends (${friends.length})`], ['messages', messageCount ? `Messages (${messageCount})` : 'Messages'], ['find', 'Find people']]} />
      <ErrorText>{err}</ErrorText>
      {tab === 'messages' ? <Conversations /> : tab === 'find' ? (
        <>
          <Input placeholder="Search by username" autoCapitalize="none" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {results.length > 0 && (
            <Card className="p-0">
              {results.map((u) => {
                const f = linkWith(u)
                return row(u, !f ? <Button size="sm" onClick={() => send(u)}>Add</Button>
                  : f.status === 'accepted' ? <span className="text-sm text-muted">Friends</span>
                  : f.addressee === uid ? <Button size="sm" onClick={() => accept(f)}>Accept</Button>
                  : <Button size="sm" variant="ghost" onClick={() => remove(f)}>Cancel</Button>)
              })}
            </Card>
          )}
          {q.trim().length >= 3 && !results.length && <p className="text-sm text-muted">No users found.</p>}
        </>
      ) : (
        <>
          {incoming.length > 0 && <>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Requests</h2>
            <Card className="p-0">{incoming.map((f) => row(other(f), <>
              <Button size="sm" onClick={() => accept(f)}>Accept</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(f)}>Decline</Button>
            </>))}</Card>
          </>}
          {outgoing.length > 0 && <>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Sent</h2>
            <Card className="p-0">{outgoing.map((f) => row(other(f), <Button size="sm" variant="ghost" onClick={() => remove(f)}>Cancel</Button>))}</Card>
          </>}
          {friends.length > 0 ? (
            <Card className="p-0">{friends.map((f) => {
              const u = other(f), n = u ? unreadFrom[u.id] ?? 0 : 0
              return row(u, <>
                <Link to={`/messages/${u?.id}`} aria-label={`Message @${u?.username}${n ? `, ${n} unread` : ''}`}
                  className="relative grid size-9 place-items-center rounded-2xl bg-accent text-accent-ink active:scale-95">
                  <ChatIcon width={18} height={18} />
                  {n > 0 && <span className="num absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">{n > 9 ? '9+' : n}</span>}
                </Link>
                <Button size="sm" variant="ghost" onClick={() => remove(f, `Remove @${u?.username}?`)}>Remove</Button>
              </>)
            })}</Card>
          ) : !incoming.length && <p className="text-sm text-muted">No friends yet. Use “Find people” to add some.</p>}
        </>
      )}
    </Screen>
  )
}

/** Everyone you've messaged, newest conversation first, with the last message and unread count. */
function Conversations() {
  const uid = me()
  const { messages: unreadFrom } = useNotifications()
  const [rows, setRows] = useState<{ user: User; last: Message }[] | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    pb.collection('messages').getList<Message>(1, 300, { filter: pb.filter('from = {:u} || to = {:u}', { u: uid }), sort: '-created', expand: 'from,to' })
      .then((r) => {
        const seen = new Map<string, { user: User; last: Message }>()
        for (const m of r.items) {
          const u = m.from === uid ? m.expand?.to : m.expand?.from
          if (u && !seen.has(u.id)) seen.set(u.id, { user: u, last: m })
        }
        setRows([...seen.values()])
      })
      .catch((e) => { setErr(errMsg(e)); setRows([]) })
  }, [uid])
  useEffect(load, [load])
  useRealtime(['messages'], load)

  if (!rows) return null
  if (!rows.length) return <><ErrorText>{err}</ErrorText><p className="text-sm text-muted">No messages yet. Tap the chat button next to a friend to start one.</p></>
  return (
    <Card className="p-0">
      {rows.map(({ user: u, last }) => {
        const n = unreadFrom[u.id] ?? 0
        const d = new Date(last.created)
        const when = d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        return (
          <Link key={u.id} to={`/messages/${u.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 active:bg-surface-2">
            <Avatar user={u} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate ${n ? 'font-extrabold' : 'font-bold'}`}>{u.name || u.username}</p>
                <span className={`shrink-0 text-xs ${n ? 'font-bold text-accent' : 'text-faint'}`}>{when}</span>
              </div>
              <div className="flex items-center gap-2">
                <p className={`min-w-0 flex-1 truncate text-sm ${n ? 'font-semibold text-ink' : 'text-muted'}`}>{last.from === uid ? 'You: ' : ''}{last.body}</p>
                {n > 0 && <span className="num grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{n > 9 ? '9+' : n}</span>}
              </div>
            </div>
          </Link>
        )
      })}
    </Card>
  )
}
