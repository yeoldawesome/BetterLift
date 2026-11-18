import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmtDur, fmtVol, timeAgo } from '../lib/format'
import { me, pb, useUnit, type Emoji, type Reaction, type User, type Workout } from '../lib/pb'
import type { Intensity } from '../lib/muscles'
import { BodyMap } from './BodyMap'
import { CommentIcon, LockIcon } from './icons'
import { Avatar, Card } from './ui'

export const EMOJI: [Emoji, string][] = [['fire', '🔥'], ['muscle', '💪'], ['clap', '👏'], ['rocket', '🚀'], ['trophy', '🏆']]

export async function toggleReaction(workoutId: string, emoji: Emoji, mine?: Reaction) {
  if (mine) await pb.collection('reactions').delete(mine.id)
  else await pb.collection('reactions').create({ workout: workoutId, user: me(), emoji })
}

export function Reactions({ workoutId, reactions, onChange }: { workoutId: string; reactions: Reaction[]; onChange: () => void }) {
  const uid = me()
  return (
    <div className="flex flex-wrap gap-1.5">
      {EMOJI.map(([k, e]) => {
        const all = reactions.filter((r) => r.emoji === k)
        const mine = all.find((r) => r.user === uid)
        return (
          <button key={k} onClick={(ev) => { ev.preventDefault(); toggleReaction(workoutId, k, mine).then(onChange).catch(() => {}) }}
            className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm ${mine ? 'border-accent bg-accent/15' : 'border-line bg-surface-2'}`}>
            <span>{e}</span>{all.length > 0 && <span className="num font-bold">{all.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function WorkoutCard({ w, summary, intensity, reactions, comments, onChange }: {
  w: Workout; summary: string[]; intensity: Intensity; reactions: Reaction[]; comments: number; onChange: () => void
}) {
  const unit = useUnit()
  const nav = useNavigate()
  const [picking, setPicking] = useState(false)
  const u = w.expand?.user as User | undefined
  const uid = me()
  // Distinct emoji received, most-used first, for the stacked cluster in the corner.
  const used = EMOJI.map(([k, e]) => ({ k, e, n: reactions.filter((r) => r.emoji === k).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  const react = (k: Emoji) => {
    setPicking(false)
    toggleReaction(w.id, k, reactions.find((r) => r.emoji === k && r.user === uid)).then(onChange).catch(() => {})
  }
  return (
    <Card className="space-y-3 p-3">
      <Link to={`/w/${w.id}`} className="block space-y-3 px-1">
        <div className="flex items-center gap-3" onClick={(e) => { if (u && u.id !== me()) { e.preventDefault(); nav(`/u/${u.id}`) } }}>
          <Avatar user={u} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold">{u?.name || u?.username}</p>
            <p className="truncate text-xs text-muted">@{u?.username} · {timeAgo(w.started_at)}</p>
          </div>
        </div>
        <h3 className="flex items-center gap-2 text-xl font-extrabold leading-tight">{w.name}{w.visibility === 'private' && <LockIcon width={16} height={16} className="shrink-0 text-muted" />}</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-xs font-semibold text-muted">Duration</p><p className="num text-lg font-black">{fmtDur(w.duration_s)}</p></div>
          <div><p className="text-xs font-semibold text-muted">Volume {unit}</p><p className="num text-lg font-black">{fmtVol(w.volume_kg, unit)}</p></div>
          <div><p className="text-xs font-semibold text-muted">Record</p><p className="num text-lg font-black">⭐ {w.pr_count}</p></div>
        </div>
      </Link>
      {/* Body map panel: reactions gather bottom-left, react + comment buttons float on the right. */}
      <div className="relative rounded-2xl border border-line bg-surface-2/60">
        <Link to={`/w/${w.id}`} className="flex justify-center py-4"><BodyMap sex={u?.sex} intensity={intensity} className="h-56" /></Link>
        {used.length > 0 && (
          <button onClick={() => setPicking((v) => !v)} className="absolute bottom-3 left-3 flex items-center" aria-label={`${reactions.length} reactions`}>
            {used.map((x, i) => (
              <span key={x.k} className={`grid size-9 place-items-center rounded-full border-2 border-surface bg-surface-2 text-lg ${i ? '-ml-3' : ''}`} style={{ zIndex: used.length - i }}>{x.e}</span>
            ))}
            <span className="num ml-1.5 text-sm font-bold text-muted">{reactions.length}</span>
          </button>
        )}
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-3">
          <Link to={`/w/${w.id}`} className="relative grid size-12 place-items-center rounded-full bg-sky-200 text-sky-900 shadow-lg" aria-label={`${comments} comments`}>
            <CommentIcon width={24} height={24} />
            {comments > 0 && <span className="num absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{comments > 99 ? '99+' : comments}</span>}
          </Link>
          <button onClick={() => setPicking((v) => !v)} className="grid size-12 place-items-center rounded-full bg-sky-200 text-2xl shadow-lg" aria-label="React">🙂</button>
        </div>
        {picking && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPicking(false)} />
            <div className="absolute bottom-3 right-[4.5rem] z-50 flex gap-1 rounded-full border border-line bg-surface p-1.5 shadow-2xl">
              {EMOJI.map(([k, e]) => {
                const mine = reactions.some((r) => r.emoji === k && r.user === uid)
                return <button key={k} onClick={() => react(k)} className={`grid size-10 place-items-center rounded-full text-xl ${mine ? 'bg-accent/25 ring-2 ring-accent' : 'active:bg-surface-2'}`}>{e}</button>
              })}
            </div>
          </>
        )}
      </div>
      {summary.length > 0 && (
        <Link to={`/w/${w.id}`} className="block px-1">
          <ul className="space-y-0.5 text-sm text-muted">
            {summary.slice(0, 4).map((s) => <li key={s} className="truncate">{s}</li>)}
            {summary.length > 4 && <li className="text-faint">+{summary.length - 4} more</li>}
          </ul>
        </Link>
      )}
    </Card>
  )
}
