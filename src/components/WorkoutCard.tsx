import { Link, useNavigate } from 'react-router-dom'
import { fmtDur, fmtVol, timeAgo } from '../lib/format'
import { me, pb, useUnit, type Emoji, type Reaction, type User, type Workout } from '../lib/pb'
import type { Intensity } from '../lib/muscles'
import { BodyMap } from './BodyMap'
import { CommentIcon, LockIcon, TrophyIcon } from './icons'
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
  const u = w.expand?.user as User | undefined
  return (
    <Card className="space-y-3">
      <Link to={`/w/${w.id}`} className="block space-y-3">
        {/* Body graph sits in the top-right; everything else flows down the left. */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-3" onClick={(e) => { if (u && u.id !== me()) { e.preventDefault(); nav(`/u/${u.id}`) } }}>
              <Avatar user={u} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{u?.name || u?.username}</p>
                <p className="truncate text-xs text-muted">@{u?.username} · {timeAgo(w.started_at)}</p>
              </div>
            </div>
            <h3 className="flex items-center gap-2 text-xl font-extrabold leading-tight">{w.name}{w.visibility === 'private' && <LockIcon width={16} height={16} className="shrink-0 text-muted" />}</h3>
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
              <div><p className="num text-lg font-black">{fmtDur(w.duration_s)}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Time</p></div>
              <div><p className="num text-lg font-black">{fmtVol(w.volume_kg, unit)}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Volume {unit}</p></div>
              {w.pr_count > 0 && <span className="mb-1 flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-xs font-bold text-accent"><TrophyIcon width={14} height={14} />{w.pr_count} PR{w.pr_count > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <BodyMap sex={u?.sex} intensity={intensity} className="-mr-1 h-32" />
        </div>
        {summary.length > 0 && (
          <ul className="space-y-0.5 text-sm text-muted">
            {summary.slice(0, 4).map((s) => <li key={s} className="truncate">{s}</li>)}
            {summary.length > 4 && <li className="text-faint">+{summary.length - 4} more</li>}
          </ul>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2">
        <Reactions workoutId={w.id} reactions={reactions} onChange={onChange} />
        <Link to={`/w/${w.id}`} className="flex items-center gap-1 text-sm text-muted"><CommentIcon width={18} height={18} />{comments || ''}</Link>
      </div>
    </Card>
  )
}
