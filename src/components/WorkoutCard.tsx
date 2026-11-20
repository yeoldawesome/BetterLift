import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmtDur, fmtVol, timeAgo } from '../lib/format'
import { me, useUnit, type CustomReaction, type Reaction, type User, type Workout } from '../lib/pb'
import { EMOJI, keyOf, toggleReaction } from '../lib/reactions'
import { customsOf, Glyph, ReactionPicker } from './CustomReactions'
import type { Intensity } from '../lib/muscles'
import { BodyMap } from './BodyMap'
import { CommentIcon, LockIcon, PlusIcon, StarIcon } from './icons'
import { Avatar, Card } from './ui'

export { EMOJI, toggleReaction } from '../lib/reactions'

/** Distinct reactions on a post (built-in first in their usual order, then custom), with counts and whether you used each. */
function tally(reactions: Reaction[]) {
  const uid = me(), out = new Map<string, { k: string; n: number; mine?: Reaction }>()
  for (const r of reactions) {
    const k = keyOf(r), t = out.get(k) ?? { k, n: 0 }
    t.n++; if (r.user === uid) t.mine = r
    out.set(k, t)
  }
  return out
}

/** Reaction chips under a workout: every reaction it has received (plus the built-ins), and a button for more. */
export function Reactions({ workoutId, reactions, onChange }: { workoutId: string; reactions: Reaction[]; onChange: () => void }) {
  const [picking, setPicking] = useState(false)
  const counts = tally(reactions), customs = customsOf(reactions)
  const keys = [...EMOJI.map(([k]) => k as string), ...[...counts.keys()].filter((k) => k.startsWith('c:'))]
  const toggle = (k: string) => toggleReaction(workoutId, k, counts.get(k)?.mine).then(onChange).catch(() => {})
  return (
    <div className="relative flex flex-wrap gap-1.5">
      {keys.map((k) => {
        const t = counts.get(k)
        return (
          <button key={k} onClick={(ev) => { ev.preventDefault(); toggle(k) }} title={customs.get(k)?.name}
            className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm ${t?.mine ? 'border-accent bg-accent/15' : 'border-line bg-surface-2'}`}>
            <Glyph k={k} custom={customs.get(k)} size={18} />{t && <span className="num font-bold">{t.n}</span>}
          </button>
        )
      })}
      <button onClick={() => setPicking(true)} className="grid h-8 place-items-center rounded-full border border-dashed border-line px-2.5 text-muted" aria-label="More reactions"><PlusIcon width={16} height={16} /></button>
      {picking && (
        <ReactionPicker className="absolute left-0 top-10" mine={new Set([...counts.values()].filter((t) => t.mine).map((t) => t.k))}
          onPick={(k) => { setPicking(false); toggle(k) }} onClose={() => setPicking(false)} />
      )}
    </div>
  )
}

/** Pointer handlers that fire `onHold` after the finger stays down (and still) for ~400ms. */
function useLongPress(onHold: () => void, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const cancel = () => { clearTimeout(timer.current); start.current = null }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { start.current = null; navigator.vibrate?.(10); onHold() }, ms)
    },
    // A finger that drifts is scrolling the feed, not holding.
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

/** Full-screen close-up of a post's reactions: each one big, with its name and count. Tap anywhere to close. */
function ReactionsView({ counts, customs, onClose }: {
  counts: { k: string; n: number; mine?: Reaction }[]; customs: Map<string, CustomReaction>; onClose: () => void
}) {
  const nameOf = (k: string) => customs.get(k)?.name ?? EMOJI.find(([e]) => e === k)?.[1] ?? 'Reaction'
  return (
    <div className="fixed inset-0 z-50 grid select-none place-items-center bg-black/70 p-4 backdrop-blur-sm [-webkit-touch-callout:none]" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-2xl">
        <div className="grid grid-cols-2 gap-3">
          {counts.map((t) => (
            <div key={t.k} className={`flex flex-col items-center gap-1 rounded-2xl p-3 ${t.mine ? 'bg-accent/15 ring-2 ring-accent' : 'bg-surface-2'}`}>
              <Glyph k={t.k} custom={customs.get(t.k)} size={t.k.startsWith('c:') ? 112 : 80} />
              <p className="w-full truncate text-center text-sm font-bold">{nameOf(t.k)}</p>
              <p className="num text-xs font-semibold text-muted">{t.n}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function WorkoutCard({ w, intensity, reactions, comments, onChange }: {
  w: Workout; intensity: Intensity; reactions: Reaction[]; comments: number; onChange: () => void
}) {
  const unit = useUnit()
  const nav = useNavigate()
  const [picking, setPicking] = useState(false)
  const u = w.expand?.user as User | undefined
  // Distinct reactions received, most-used first, for the stacked cluster in the corner.
  const counts = tally(reactions), customs = customsOf(reactions)
  const used = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5)
  const react = (k: string) => {
    setPicking(false)
    toggleReaction(w.id, k, counts.get(k)?.mine).then(onChange).catch(() => {})
  }
  // Tap the cluster to react; press and hold it to see every reaction up close.
  const [viewing, setViewing] = useState(false)
  const held = useRef(false)
  const hold = useLongPress(() => { held.current = true; setPicking(false); setViewing(true) })
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
          <div><p className="text-xs font-semibold text-muted">Record</p><p className="num flex items-center justify-center gap-1 text-lg font-black"><StarIcon width={18} height={18} className="text-yellow-500" fill="currentColor" fillOpacity={0.25} aria-hidden />{w.pr_count}</p></div>
        </div>
      </Link>
      {/* Body map panel: reactions gather bottom-left, react + comment buttons float on the right. */}
      <div className="relative rounded-2xl border border-line bg-surface-2/60">
        <Link to={`/w/${w.id}`} className="flex justify-center py-4"><BodyMap sex={u?.sex} intensity={intensity} accent={w.accent} className="h-56" /></Link>
        {used.length > 0 && (
          <button {...hold} onClick={() => { if (held.current) { held.current = false; return } setPicking((v) => !v) }}
            className="absolute bottom-3 left-3 flex select-none items-center [-webkit-touch-callout:none]" aria-label={`${reactions.length} reactions (press and hold to view)`}>
            {used.map((x, i) => (
              <span key={x.k} className={`pointer-events-none grid size-12 place-items-center overflow-hidden rounded-full border-2 border-surface bg-surface-2 ${i ? '-ml-4' : ''}`} style={{ zIndex: used.length - i }}><Glyph k={x.k} custom={customs.get(x.k)} size={x.k.startsWith('c:') ? 36 : 26} /></span>
            ))}
            <span className="num ml-2 text-base font-bold text-muted">{reactions.length}</span>
          </button>
        )}
        {viewing && <ReactionsView counts={[...counts.values()].sort((a, b) => b.n - a.n)} customs={customs} onClose={() => setViewing(false)} />}
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-3">
          <Link to={`/w/${w.id}`} className="relative grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-lg" aria-label={`${comments} comments`}>
            <CommentIcon width={24} height={24} />
            {comments > 0 && <span className="num absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{comments > 99 ? '99+' : comments}</span>}
          </Link>
          <button onClick={() => setPicking((v) => !v)} className="relative size-12 rounded-full border-2 border-line bg-surface-2 shadow-lg active:scale-95" aria-label="React">
            <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-canvas bg-accent text-accent-ink"><PlusIcon width={12} height={12} /></span>
          </button>
        </div>
        {picking && (
          <ReactionPicker className="absolute bottom-[8.25rem] right-3" mine={new Set([...counts.values()].filter((t) => t.mine).map((t) => t.k))}
            onPick={(k) => react(k)} onClose={() => setPicking(false)} />
        )}
      </div>
    </Card>
  )
}
