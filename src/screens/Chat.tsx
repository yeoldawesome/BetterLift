import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Spinner } from '../components/ui'
import { BackIcon, SendIcon } from '../components/icons'
import { errMsg, me, pb, type Friendship, type Message, type User } from '../lib/pb'
import { useSwipeDismiss } from '../lib/swipe'

const PAGE = 50
type Msg = Message & { pending?: boolean; failed?: boolean }

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
function dayLabel(d: Date) {
  const today = new Date()
  const yest = new Date(today.getTime() - 86400000)
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yest)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}

/** Private chat with one friend. Full screen (covers the tab bar) so the composer sits at the bottom like a messages app. */
export default function Chat() {
  const { id } = useParams()
  const uid = me()
  const nav = useNavigate()
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav('/friends', { replace: true }))

  const [other, setOther] = useState<User | null>(null)
  const [friends, setFriends] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')

  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true) // keep pinned to the newest message unless the user scrolled up
  const keepFrom = useRef<number | null>(null) // scrollHeight before loading older messages, to keep the view still
  useSwipeDismiss(root, goBack)

  const convo = pb.filter('(from = {:a} && to = {:b}) || (from = {:b} && to = {:a})', { a: uid, b: id })

  useEffect(() => {
    setMsgs(null); setOther(null); setFriends(null); setErr('')
    pb.collection('users').getOne<User>(id!).then(setOther).catch((e) => setErr(errMsg(e)))
    pb.collection('friendships').getList<Friendship>(1, 1, { filter: pb.filter('status = "accepted" && ((requester = {:a} && addressee = {:b}) || (requester = {:b} && addressee = {:a}))', { a: uid, b: id }) })
      .then((r) => setFriends(r.totalItems > 0)).catch(() => setFriends(false))
    pb.collection('messages').getList<Message>(1, PAGE, { filter: convo, sort: '-created' })
      .then((r) => { setMsgs(r.items.reverse()); setMore(r.totalPages > 1) }).catch((e) => { setErr(errMsg(e)); setMsgs([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadOlder = async () => {
    if (!msgs || loadingMore) return
    setLoadingMore(true)
    try {
      const oldest = msgs.find((m) => !m.pending)?.created
      const r = await pb.collection('messages').getList<Message>(1, PAGE, { filter: `(${convo}) && created < ${pb.filter('{:c}', { c: oldest })}`, sort: '-created' })
      keepFrom.current = list.current?.scrollHeight ?? null
      setMsgs((ms) => [...r.items.reverse(), ...(ms ?? [])])
      setMore(r.totalPages > 1)
    } catch (e) { setErr(errMsg(e)) } finally { setLoadingMore(false) }
  }

  // Live updates: new messages either way, and "read" flips on mine.
  useEffect(() => {
    let un: (() => void) | undefined
    let gone = false
    pb.collection('messages').subscribe<Message>('*', ({ action, record: m }) => {
      const mine = m.from === uid && m.to === id, theirs = m.from === id && m.to === uid
      if (!mine && !theirs) return
      setMsgs((ms) => {
        if (!ms) return ms
        const i = ms.findIndex((x) => x.id === m.id)
        if (i >= 0) return ms.map((x) => (x.id === m.id ? m : x))
        if (action !== 'create') return ms
        // My own message from this device arrives here before the send finishes: let the send replace its placeholder.
        if (mine && ms.some((x) => x.pending && x.body === m.body)) return ms
        return [...ms, m]
      })
    }).then((f) => { if (gone) f(); else un = f }).catch(() => {})
    return () => { gone = true; un?.() }
  }, [id, uid])

  // Mark their messages read while the chat is open and visible.
  const markRead = useCallback(() => {
    if (!msgs || document.visibilityState !== 'visible') return
    const ids = msgs.filter((m) => m.from === id && !m.read && !m.pending).map((m) => m.id)
    if (!ids.length) return
    setMsgs((ms) => ms?.map((m) => (ids.includes(m.id) ? { ...m, read: true } : m)) ?? ms)
    const b = pb.createBatch()
    ids.forEach((mid) => b.collection('messages').update(mid, { read: true }))
    b.send().catch(() => {})
  }, [msgs, id])
  useEffect(markRead, [markRead])
  useEffect(() => { document.addEventListener('visibilitychange', markRead); return () => document.removeEventListener('visibilitychange', markRead) }, [markRead])

  // Scroll: stay at the bottom for new messages; keep position when older ones load above.
  useLayoutEffect(() => {
    const l = list.current
    if (!l) return
    if (keepFrom.current != null) { l.scrollTop += l.scrollHeight - keepFrom.current; keepFrom.current = null }
    else if (stick.current) l.scrollTop = l.scrollHeight
  }, [msgs])

  // On phones the keyboard shrinks the visible area: size the screen to it so the composer stays above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport, el = root.current
    if (!vv || !el) return
    const fit = () => {
      el.style.height = `${vv.height}px`
      el.style.top = `${vv.offsetTop}px`
      if (stick.current && list.current) list.current.scrollTop = list.current.scrollHeight
    }
    fit()
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])

  // Composer grows with the text, up to about 5 lines.
  useLayoutEffect(() => {
    const t = input.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 132)}px`
  }, [text])

  const send = async (body = text.trim(), retry?: Msg) => {
    if (!body || !friends) return
    if (!retry) setText('')
    stick.current = true
    const tmp: Msg = retry ? { ...retry, failed: false } : { id: `tmp${Date.now()}`, from: uid, to: id!, body, read: false, created: new Date().toISOString(), collectionId: '', collectionName: 'messages', pending: true } as Msg
    setMsgs((ms) => (retry ? ms?.map((m) => (m.id === tmp.id ? tmp : m)) : [...(ms ?? []), tmp]) ?? ms)
    try {
      const m = await pb.collection('messages').create<Message>({ from: uid, to: id, body })
      setMsgs((ms) => ms?.filter((x) => x.id !== m.id).map((x) => (x.id === tmp.id ? m : x)) ?? ms)
    } catch (e) {
      setMsgs((ms) => ms?.map((x) => (x.id === tmp.id ? { ...x, failed: true } : x)) ?? ms)
      setErr(errMsg(e))
    }
    input.current?.focus()
  }

  const name = other ? other.name || other.username : ''
  // "Seen" goes under my latest message once they've read it.
  const lastMine = msgs ? [...msgs].reverse().find((m) => m.from === uid && !m.pending) : undefined

  return (
    <div ref={root} className="fixed inset-x-0 top-0 z-[60] flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-canvas/90 px-2 pb-2 pt-safe backdrop-blur-xl">
        <button onClick={goBack} className="grid size-10 place-items-center rounded-full text-accent" aria-label="Back"><BackIcon width={22} height={22} /></button>
        {other && (
          <Link to={`/u/${other.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 py-1">
            <Avatar user={other} size={36} />
            <div className="min-w-0"><p className="truncate font-bold leading-tight">{name}</p><p className="truncate text-xs text-muted">@{other.username}</p></div>
          </Link>
        )}
      </header>

      <div ref={list} onScroll={(e) => { const l = e.currentTarget; stick.current = l.scrollHeight - l.scrollTop - l.clientHeight < 80 }}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="mx-auto max-w-lg">
          {!msgs ? <Spinner /> : (
            <>
              {more && (
                <div className="mb-3 flex justify-center">
                  <button onClick={loadOlder} disabled={loadingMore} className="h-8 rounded-full bg-surface-2 px-4 text-xs font-bold text-muted disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load earlier messages'}</button>
                </div>
              )}
              {!msgs.length && other && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Avatar user={other} size={72} />
                  <p className="font-bold">{name}</p>
                  <p className="max-w-60 text-sm text-muted">{friends === false ? `You can only message friends. Add @${other.username} to start chatting.` : `Say hi to @${other.username}. Only the two of you can see these messages.`}</p>
                </div>
              )}
              {msgs.map((m, i) => {
                const d = new Date(m.created), prev = msgs[i - 1], next = msgs[i + 1]
                const mine = m.from === uid
                const newDay = !prev || !sameDay(new Date(prev.created), d)
                // Bubbles from the same person within a few minutes stack together; the time shows under the last one.
                const joinPrev = !newDay && prev?.from === m.from && d.getTime() - new Date(prev.created).getTime() < 5 * 60000
                const joinNext = !!next && next.from === m.from && sameDay(new Date(next.created), d) && new Date(next.created).getTime() - d.getTime() < 5 * 60000
                return (
                  <div key={m.id}>
                    {newDay && <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wider text-faint">{dayLabel(d)}</p>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${joinPrev ? 'mt-0.5' : 'mt-2.5'}`}>
                      <div className={`max-w-[78%] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug ${mine ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink'} ${m.pending ? 'opacity-60' : ''} ${m.failed ? 'opacity-100 ring-2 ring-danger' : ''}
                        rounded-2xl ${mine ? `${joinPrev ? 'rounded-tr-md' : ''} ${joinNext ? 'rounded-br-md' : ''}` : `${joinPrev ? 'rounded-tl-md' : ''} ${joinNext ? 'rounded-bl-md' : ''}`}`}>
                        {m.body}
                      </div>
                    </div>
                    {m.failed ? (
                      <button onClick={() => send(m.body, m)} className="ml-auto mt-1 block text-right text-[11px] font-bold text-danger">Not sent · Tap to retry</button>
                    ) : !joinNext && (
                      <p className={`mt-1 px-1 text-[11px] text-faint ${mine ? 'text-right' : ''}`}>
                        {m.pending ? 'Sending…' : time(d)}{m.id === lastMine?.id && m.read ? ' · Seen' : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-canvas/90 px-3 pb-safe pt-2 backdrop-blur-xl">
        <div className="mx-auto max-w-lg pb-2">
          {err && <p className="mb-1.5 text-xs font-semibold text-danger">{err}</p>}
          {friends === false ? (
            <p className="py-2 text-center text-sm text-muted">You can only message friends.</p>
          ) : (
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send() }}>
              <textarea ref={input} value={text} rows={1} maxLength={2000} placeholder="Message" enterKeyHint="send"
                onChange={(e) => { setText(e.target.value); setErr('') }}
                // Desktop: Enter sends, Shift+Enter for a new line. Phones keep Enter as a new line.
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); send() } }}
                className="max-h-[132px] min-h-10 flex-1 resize-none rounded-[20px] border border-line bg-surface-2 px-4 py-2 text-base leading-snug text-ink outline-none placeholder:text-faint focus:border-accent" />
              <button type="submit" disabled={!text.trim() || !friends} aria-label="Send"
                // Keep the keyboard open: don't let the button steal focus from the text box.
                onPointerDown={(e) => e.preventDefault()}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition active:scale-95 disabled:opacity-30">
                <SendIcon width={20} height={20} strokeWidth={2.4} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
