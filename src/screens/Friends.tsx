import { useClearOnVisit } from '../lib/notifications'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Button, Card, ErrorText, Input, Screen, Segmented } from '../components/ui'
import { errMsg, me, pb, type Friendship, type User } from '../lib/pb'
import { useRealtime } from '../lib/useRealtime'

export default function Friends() {
  useClearOnVisit('friends')
  const uid = me()
  const [tab, setTab] = useState<'friends' | 'find'>('friends')
  const [links, setLinks] = useState<Friendship[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [err, setErr] = useState('')

  const load = useCallback(() => pb.collection('friendships').getFullList<Friendship>({ expand: 'requester,addressee', sort: '-created' }).then(setLinks).catch((e) => setErr(errMsg(e))), [])
  useEffect(() => { load() }, [load])
  useRealtime(['friendships'], load)

  useEffect(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return setResults([])
    const t = setTimeout(() => {
      pb.collection('users').getList<User>(1, 20, { filter: pb.filter('(username ~ {:q} || name ~ {:q}) && id != {:me}', { q: s, me: uid }) })
        .then((r) => setResults(r.items)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q, uid])

  const other = (f: Friendship) => (f.requester === uid ? f.expand?.addressee : f.expand?.requester)
  const linkWith = (u: User) => links.find((f) => f.requester === u.id || f.addressee === u.id)
  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setErr(errMsg(e)))
  const send = (u: User) => run(pb.collection('friendships').create({ requester: uid, addressee: u.id, status: 'pending' }))
  const accept = (f: Friendship) => run(pb.collection('friendships').update(f.id, { status: 'accepted' }))
  const remove = (f: Friendship, msg?: string) => (!msg || confirm(msg)) && run(pb.collection('friendships').delete(f.id))

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
      <Segmented value={tab} onChange={setTab} options={[['friends', `Friends (${friends.length})`], ['find', 'Find people']]} />
      <ErrorText>{err}</ErrorText>
      {tab === 'find' ? (
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
          {q.trim().length >= 2 && !results.length && <p className="text-sm text-muted">No users found.</p>}
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
            <Card className="p-0">{friends.map((f) => row(other(f), <Button size="sm" variant="ghost" onClick={() => remove(f, `Remove @${other(f)?.username}?`)}>Remove</Button>))}</Card>
          ) : !incoming.length && <p className="text-sm text-muted">No friends yet. Use “Find people” to add some.</p>}
        </>
      )}
    </Screen>
  )
}
