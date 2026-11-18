import { useState } from 'react'
import { fmtClock } from '../lib/format'
import { Button, Sheet, Toggle } from './ui'
import { TimerIcon } from './icons'

const PRESETS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
export const restLabel = (s: number) => (s > 0 ? fmtClock(s) : 'Off')

/** Rest timer chooser: preset grid plus ±15s fine-tune. `onUseDefault` adds a "use my default" option. */
export function RestPicker({ value, title = 'Rest timer', subtitle, onSave, onClose, onUseDefault, defaultValue }: {
  value: number; title?: string; subtitle?: string; onSave: (s: number) => void; onClose: () => void; onUseDefault?: () => void; defaultValue?: number
}) {
  const [v, setV] = useState(value)
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-5 pt-2">
        {subtitle && <p className="-mt-2 text-center text-sm text-muted">{subtitle}</p>}
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setV((x) => Math.max(0, x - 15))} className="size-14 rounded-full bg-surface-2 text-xl font-black">−15</button>
          <span className="num w-32 text-center text-5xl font-black">{restLabel(v)}</span>
          <button onClick={() => setV((x) => Math.min(900, x + 15))} className="size-14 rounded-full bg-surface-2 text-xl font-black">+15</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setV(p)} className={`num h-12 rounded-xl text-base font-bold ${v === p ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}>{restLabel(p)}</button>
          ))}
        </div>
        <Button onClick={() => { onSave(v); onClose() }}>Save</Button>
        {onUseDefault && (
          <Button variant="ghost" onClick={() => { onUseDefault(); onClose() }}>Use my default{defaultValue !== undefined ? ` (${restLabel(defaultValue)})` : ''}</Button>
        )}
      </div>
    </Sheet>
  )
}

/**
 * Both rest timers for one lift in the current workout: between sets and after the exercise.
 * Optionally saves them as that lift's own default for future workouts.
 */
export function LiftRestSheet({ name, rest, after, onSave, onClose }: {
  name: string; rest: number; after: number; onSave: (rest: number, after: number, saveDefault: boolean) => void; onClose: () => void
}) {
  const [r, setR] = useState(rest)
  const [a, setA] = useState(after)
  const [remember, setRemember] = useState(false)
  const [editing, setEditing] = useState<'rest' | 'after' | null>(null)
  const row = (label: string, body: string, value: number, which: 'rest' | 'after') => (
    <button onClick={() => setEditing(which)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
      <TimerIcon width={22} height={22} className="text-accent" />
      <span className="min-w-0 flex-1"><span className="block font-bold">{label}</span><span className="block text-sm text-muted">{body}</span></span>
      <span className="num text-lg font-black">{restLabel(value)}</span>
    </button>
  )
  return (
    <Sheet title={`Rest · ${name}`} onClose={onClose}>
      <div className="space-y-3 pb-8">
        {row('Between sets', 'Starts when you check off a set', r, 'rest')}
        {row('After this exercise', 'Starts when you finish its last set, before your next exercise', a, 'after')}
        <Toggle on={remember} onChange={setRemember} title={`Save as my default for ${name}`} body="Use these rest times every time you do this lift." />
        <Button onClick={() => { onSave(r, a, remember); onClose() }}>Done</Button>
      </div>
      {editing && (
        <RestPicker value={editing === 'rest' ? r : a} title={editing === 'rest' ? 'Between sets' : 'After this exercise'} subtitle={name}
          onSave={(v) => (editing === 'rest' ? setR(v) : setA(v))} onClose={() => setEditing(null)} />
      )}
    </Sheet>
  )
}
