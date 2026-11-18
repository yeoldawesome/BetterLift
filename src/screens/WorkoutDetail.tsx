import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExerciseInfo } from '../components/ExerciseInfo'
import { CloseIcon, GlobeIcon, InfoIcon, LockIcon, TrashIcon, TrophyIcon } from '../components/icons'
import { Reactions } from '../components/WorkoutCard'
import { Avatar, Button, Card, ConfirmSheet, ErrorText, Input, Screen, Spinner, Stat } from '../components/ui'
import { deleteWorkout } from '../lib/history'
import { distLabel, fmtDate, fmtDist, fmtDur, fmtVol, fmtW, timeAgo } from '../lib/format'
import { errMsg, me, pb, useUnit, type Comment, type Exercise, type Reaction, type WSet, type Workout } from '../lib/pb'
import { intensityFromSets } from '../lib/muscles'
import { useRealtime } from '../lib/useRealtime'
import { useNotifications } from '../lib/notifications'
import { BodyMap } from '../components/BodyMap'

export default function WorkoutDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const unit = useUnit()
  const [w, setW] = useState<Workout | null>(null)
  const [sets, setSets] = useState<WSet[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [delComment, setDelComment] = useState<Comment | null>(null)
  const [infoEx, setInfoEx] = useState<Exercise | null>(null)
  const [err, setErr] = useState('')
  const filter = pb.filter('workout = {:w}', { w: id })
  const notes = useNotifications()
  const aboutThis = notes.unread.filter((n) => n.target === id).map((n) => n.id).join(',')
  useEffect(() => { if (aboutThis) notes.markRead(aboutThis.split(',')) }, [aboutThis])

  const loadSocial = useCallback(async () => {
    const [r, c] = await Promise.all([
      pb.collection('reactions').getFullList<Reaction>({ filter }),
      pb.collection('comments').getFullList<Comment>({ filter, sort: 'created', expand: 'user' }),
    ])
    setReactions(r); setComments(c)
  }, [filter])

  useEffect(() => {
    pb.collection('workouts').getOne<Workout>(id!, { expand: 'user' }).then(setW).catch((e) => setErr(errMsg(e)))
    pb.collection('workout_sets').getFullList<WSet>({ filter, sort: 'position,set_index', expand: 'exercise' }).then(setSets).catch(() => {})
    loadSocial().catch(() => {})
  }, [id])
  useRealtime(['reactions', 'comments'], () => { loadSocial().catch(() => {}) }, filter)

  const post = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try {
      await pb.collection('comments').create({ workout: id, user: me(), body: text.trim(), parent: replyTo?.id ?? '' })
      setText(''); setReplyTo(null); loadSocial()
    } catch (x) { setErr(errMsg(x)) }
  }

  const reply = (c: Comment) => {
    setReplyTo(c)
    document.getElementById('comment-input')?.focus()
  }

  if (!w) return <Screen title="Workout" back><ErrorText>{err}</ErrorText>{!err && <Spinner />}</Screen>

  const mine = w.user === me()
  const groups: { name: string; ex?: Exercise; sets: WSet[] }[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.sets[0].position === s.position) last.sets.push(s)
    else groups.push({ name: s.expand?.exercise?.name ?? '?', ex: s.expand?.exercise, sets: [s] })
  }
  const setText_ = (s: WSet) => {
    const k = s.expand?.exercise?.kind
    if (k === 'duration') return `${s.seconds}s`
    if (k === 'cardio') return `${fmtDist(s.distance_km, unit)} ${distLabel(unit)} · ${Math.round(s.seconds / 60)} min`
    if (k === 'bodyweight' && !s.weight_kg) return `${s.reps} reps`
    return `${fmtW(s.weight_kg, unit)} ${unit} × ${s.reps}`
  }

  return (
    <Screen title={w.name} back action={mine && (
      <div className="flex items-center gap-1">
        <button onClick={() => nav(`/w/${w.id}/edit`)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-bold">Edit</button>
        <button onClick={() => setConfirmDel(true)} className="p-2 text-faint" aria-label="Delete workout"><TrashIcon width={20} height={20} /></button>
      </div>
    )}>
      <div className="flex items-center gap-3">
        <Avatar user={w.expand?.user} size={36} />
        <div><p className="text-sm font-bold">@{w.expand?.user?.username}</p><p className="text-xs text-muted">{fmtDate(w.started_at)}</p></div>
      </div>
      <Card className="grid grid-cols-3 gap-2">
        <Stat value={fmtDur(w.duration_s)} label="Time" />
        <Stat value={fmtVol(w.volume_kg, unit)} label={`Volume ${unit}`} />
        <Stat value={w.pr_count} label="PRs" />
      </Card>
      {mine ? (
        <button onClick={() => {
          const visibility = w.visibility === 'private' ? 'public' : 'private'
          pb.collection('workouts').update<Workout>(w.id, { visibility }).then((u) => setW({ ...w, visibility: u.visibility })).catch((e) => setErr(errMsg(e)))
        }} className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          {w.visibility === 'private' ? <><LockIcon width={16} height={16} />Private — only you · <span className="text-accent">Make public</span></> : <><GlobeIcon width={16} height={16} />Public — friends can see · <span className="text-accent">Make private</span></>}
        </button>
      ) : null}
      {sets.length > 0 && (
        <Card className="flex items-center justify-center py-3">
          <BodyMap sex={w.expand?.user?.sex} intensity={intensityFromSets(sets.map((s) => ({ ex: s.expand?.exercise })))} className="h-44" labels />
        </Card>
      )}
      {w.notes && <p className="text-sm text-muted">{w.notes}</p>}
      {groups.map((g, i) => (
        <Card key={i} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-extrabold text-accent">{g.name}</p>
            {g.ex && (
              <button onClick={() => setInfoEx(g.ex!)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2" aria-label={`About ${g.name}`}>
                <InfoIcon width={18} height={18} />
              </button>
            )}
          </div>
          {g.sets.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="num"><span className="mr-3 text-faint">{s.set_index + 1}</span>{setText_(s)}</span>
              {s.is_pr && <span className="flex items-center gap-1 text-xs font-bold text-accent"><TrophyIcon width={14} height={14} />PR</span>}
            </div>
          ))}
        </Card>
      ))}
      <Reactions workoutId={w.id} reactions={reactions} onChange={loadSocial} />
      <h2 className="pt-2 text-lg font-extrabold">Comments</h2>
      {!comments.length && <p className="text-sm text-muted">No comments yet.</p>}
      <CommentTree comments={comments} parent="" depth={0} canModerate={mine} onReply={reply} onDelete={setDelComment} />
      <form onSubmit={post} className="space-y-2 pb-4">
        {replyTo && (
          <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-muted">Replying to <span className="font-bold text-ink">@{replyTo.expand?.user?.username}</span>: {replyTo.body}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 p-1 text-faint"><CloseIcon width={16} height={16} /></button>
          </div>
        )}
        <div className="flex gap-2">
          <Input id="comment-input" placeholder={replyTo ? 'Write a reply' : 'Add a comment'} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
          <Button size="sm" className="h-12">{replyTo ? 'Reply' : 'Post'}</Button>
        </div>
      </form>
      <ErrorText>{err}</ErrorText>
      {infoEx && <ExerciseInfo ex={infoEx} userId={w.user} ownerName={w.expand?.user?.username} initialTab="stats" onClose={() => setInfoEx(null)} />}
      {confirmDel && (
        <ConfirmSheet title="Delete this workout?" confirmLabel="Delete workout"
          body={<>“{w.name}” on {fmtDate(w.started_at)} will be permanently deleted, along with its sets, comments and reactions. It will be removed from your stats and history. This can't be undone.</>}
          onConfirm={async () => { await deleteWorkout(w.id); nav('/history', { replace: true }) }} onClose={() => setConfirmDel(false)} />
      )}
      {delComment && (
        <ConfirmSheet title="Delete comment?" confirmLabel="Delete comment"
          body={comments.some((c) => c.parent === delComment.id) ? 'This comment and all replies to it will be deleted.' : 'This comment will be deleted.'}
          onConfirm={async () => { await pb.collection('comments').delete(delComment.id); if (replyTo && !comments.some((c) => c.id === replyTo.id)) setReplyTo(null); await loadSocial() }}
          onClose={() => setDelComment(null)} />
      )}
    </Screen>
  )
}

/** Renders replies under their parent, at any depth. Indentation stops growing after 4 levels so deep threads stay readable on phones. */
function CommentTree({ comments, parent, depth, canModerate, onReply, onDelete }: {
  comments: Comment[]; parent: string; depth: number; canModerate: boolean; onReply: (c: Comment) => void; onDelete: (c: Comment) => void
}) {
  const kids = comments.filter((c) => (c.parent || '') === parent)
  if (!kids.length) return null
  return (
    <div className={depth > 0 && depth <= 4 ? 'ml-4 border-l-2 border-line pl-3' : ''}>
      {kids.map((c) => (
        <div key={c.id} className="pt-3">
          <div className="flex gap-3">
            <Avatar user={c.expand?.user} size={depth ? 26 : 32} />
            <div className="min-w-0 flex-1">
              <p className="text-sm"><span className="font-bold">@{c.expand?.user?.username}</span> <span className="text-xs text-faint">{timeAgo(c.created)}</span></p>
              <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
              <button onClick={() => onReply(c)} className="mt-0.5 text-xs font-bold text-muted">Reply</button>
            </div>
            {(c.user === me() || canModerate) && <button onClick={() => onDelete(c)} className="self-start p-1 text-faint"><TrashIcon width={16} height={16} /></button>}
          </div>
          <CommentTree comments={comments} parent={c.id} depth={depth + 1} canModerate={canModerate} onReply={onReply} onDelete={onDelete} />
        </div>
      ))}
    </div>
  )
}
