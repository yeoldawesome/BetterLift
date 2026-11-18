import { useState, type CSSProperties } from 'react'
import { BodyMap } from '../components/BodyMap'
import { CheckIcon, TrophyIcon } from '../components/icons'
import { Button, ErrorText, Screen, Segmented } from '../components/ui'
import { errMsg, pb, useUser } from '../lib/pb'
import { ACCENTS, BASES, applyTheme, resolve, themeVars, type Theme } from '../lib/theme'

const SAMPLE = { chest: 1, triceps: 0.6, shoulders: 0.55, core: 0.25 }

export default function Themes() {
  const user = useUser()!
  const [t, setT] = useState(resolve(user.theme))
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const current = resolve(user.theme)
  const dirty = t.base !== current.base || t.accent !== current.accent

  const pick = (patch: Theme) => { setT((x) => ({ ...x, ...patch })); setSaved(false) }
  const save = async () => {
    setErr('')
    try {
      applyTheme(t)
      await pb.collection('users').update(user.id, { theme: t })
      setSaved(true)
    } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <Screen title="Themes" back>
      <p className="text-sm text-muted">Pick a background and an accent color. The whole app — buttons, charts and your body graph — follows it.</p>

      {/* Live preview: the theme's variables are scoped to this box only. */}
      <div style={themeVars(t) as CSSProperties} className="overflow-hidden rounded-3xl border-2 border-line">
        <div className="space-y-3 bg-canvas p-4 text-ink">
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted">{user.username[0]?.toUpperCase()}</div>
                <div><p className="text-sm font-bold">@{user.username}</p><p className="text-xs text-muted">just now</p></div>
              </div>
              <p className="text-lg font-extrabold">Push Day</p>
              <div className="flex gap-4">
                <div><p className="num font-black">58m</p><p className="text-[10px] font-semibold uppercase text-muted">Time</p></div>
                <div><p className="num font-black">12,480</p><p className="text-[10px] font-semibold uppercase text-muted">Volume</p></div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent"><TrophyIcon width={12} height={12} />2 PRs</span>
            </div>
            <BodyMap sex={user.sex} intensity={SAMPLE} className="h-28" />
          </div>
          <div className="flex gap-2">
            <span className="flex-1 rounded-xl bg-accent py-2.5 text-center text-sm font-bold text-accent-ink">Start workout</span>
            <span className="flex-1 rounded-xl bg-surface-2 py-2.5 text-center text-sm font-bold">Routines</span>
          </div>
        </div>
      </div>

      <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted">Background</h2>
      <div className="grid grid-cols-5 gap-2">
        {Object.entries(BASES).map(([k, b]) => (
          <button key={k} onClick={() => pick({ base: k })} className="flex flex-col items-center gap-1">
            <span className={`relative grid size-12 place-items-center rounded-2xl border-2 ${t.base === k ? 'border-accent' : 'border-line'}`} style={{ background: b.canvas }}>
              <span className="h-4 w-7 rounded-md" style={{ background: b.surface2 }} />
              {t.base === k && <CheckIcon width={14} height={14} className="absolute -right-1 -top-1 rounded-full bg-accent text-accent-ink" />}
            </span>
            <span className="text-[11px] font-semibold text-muted">{b.name}</span>
          </button>
        ))}
      </div>

      <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted">Accent</h2>
      <div className="grid grid-cols-5 gap-2">
        {ACCENTS.map(([c, name]) => (
          <button key={c} onClick={() => pick({ accent: c })} className="flex flex-col items-center gap-1" aria-label={name}>
            <span className={`grid size-12 place-items-center rounded-full border-2 ${t.accent.toLowerCase() === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }}>
              {t.accent.toLowerCase() === c && <CheckIcon width={18} height={18} style={{ color: '#0b0f02' }} />}
            </span>
            <span className="text-[11px] font-semibold text-muted">{name}</span>
          </button>
        ))}
        {/* Native color picker — works on iPhone (iOS 14+) and desktop. */}
        <label className="flex cursor-pointer flex-col items-center gap-1">
          <span className={`relative size-12 overflow-hidden rounded-full border-2 ${ACCENTS.some(([c]) => c === t.accent.toLowerCase()) ? 'border-transparent' : 'border-ink'}`}
            style={{ background: 'conic-gradient(#f43f5e, #facc15, #a3e635, #38bdf8, #a78bfa, #f43f5e)' }}>
            <input type="color" value={t.accent} onChange={(e) => pick({ accent: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </span>
          <span className="text-[11px] font-semibold text-muted">Custom</span>
        </label>
      </div>

      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Body graph</span>
        <Segmented value={user.sex === 'female' ? 'female' : 'male'} onChange={(sex) => pb.collection('users').update(user.id, { sex }).catch((e) => setErr(errMsg(e)))}
          options={[['male', 'Male'], ['female', 'Female']]} />
      </div>

      <ErrorText>{err}</ErrorText>
      <Button onClick={save} disabled={!dirty && saved}>{saved && !dirty ? 'Theme saved ✓' : dirty ? 'Apply theme' : 'Theme applied'}</Button>
      {(t.base !== 'midnight' || t.accent !== '#a3e635') && (
        <Button variant="ghost" onClick={() => pick({ base: 'midnight', accent: '#a3e635' })}>Reset to default</Button>
      )}
    </Screen>
  )
}
