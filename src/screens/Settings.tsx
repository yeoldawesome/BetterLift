import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeightInput } from '../components/HeightInput'
import { GlobeIcon, LockIcon, TimerIcon, TrashIcon } from '../components/icons'
import { RestPicker, restLabel } from '../components/RestPicker'
import { PasswordField } from '../components/PasswordField'
import { checkPassword } from '../lib/password'
import { BottomSheet, Button, Card, ConfirmSheet, ErrorText, Input, Screen, Segmented, Toggle } from '../components/ui'
import { deleteAllHistory } from '../lib/history'
import { bmi, fmtW, fromUnit, num } from '../lib/format'
import { errMsg, nutritionNew, pb, useUser, userRest, userRestAfter, type User } from '../lib/pb'
import { MAX_TABS } from '../lib/tabs'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'

/** Turning nutrition on with a custom bottom bar: add the Nutrition tab if there's room (the default bar already has it). */
function withNutritionTab(u: User, on: boolean): Partial<User> {
  const bar = Array.isArray(u.tab_bar) ? u.tab_bar : []
  return on && bar.length && !bar.includes('nutrition') && bar.length < MAX_TABS ? { tab_bar: [...bar, 'nutrition'] } : {}
}

export default function Settings() {
  const user = useUser()!
  const [restOpen, setRestOpen] = useState(false)
  const [afterOpen, setAfterOpen] = useState(false)
  const [err, setErr] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  const [progress, setProgress] = useState('')
  const [done, setDone] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [pwDone, setPwDone] = useState('')
  const save = (patch: Partial<User>) => pb.collection('users').update(user.id, patch).catch((e) => setErr(errMsg(e)))
  const vis = user.post_visibility || 'public'
  const unit = user.unit || 'lb'
  const [bw, setBw] = useState(user.bodyweight_kg ? fmtW(user.bodyweight_kg, unit) : '')
  const b = bmi(user.bodyweight_kg, user.height_cm)

  return (
    <Screen title="Settings" back>
      <ErrorText>{err}</ErrorText>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Units</h2>
      <Segmented value={unit} onChange={(u) => { save({ unit: u }); setBw(user.bodyweight_kg ? fmtW(user.bodyweight_kg, u) : '') }} options={[['lb', 'Pounds (lb)'], ['kg', 'Kilograms (kg)']]} />

      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Body</h2>
      <HeightInput key={unit} cm={user.height_cm} unit={unit} onChange={(cm) => cm >= 120 && cm !== user.height_cm && save({ height_cm: cm })} />
      <Input label={`Bodyweight (${unit})`} inputMode="decimal" value={bw} onChange={(e) => setBw(e.target.value)}
        onBlur={() => num(bw) > 0 && bw !== fmtW(user.bodyweight_kg, unit) && save({ bodyweight_kg: Math.round(fromUnit(num(bw), unit) * 100) / 100 })} />
      {b > 0 && <p className="text-xs text-muted">BMI {b.toFixed(1)}</p>}
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Body graph</span>
        <Segmented value={user.sex === 'female' ? 'female' : 'male'} onChange={(sex) => save({ sex })} options={[['male', 'Male'], ['female', 'Female']]} />
      </div>
      <Link to="/themes" className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 font-bold">Themes & colors <span className="text-accent">›</span></Link>
      <Link to="/settings/tab-bar" className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 font-bold">Bottom bar <span className="text-accent">›</span></Link>

      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Notifications</h2>
      <PushToggle />

      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Nutrition</h2>
      {/* New accounts start with nutrition off; it's highlighted (with dots on Profile) until they tap it once. */}
      <div className={nutritionNew(user) ? 'relative rounded-xl ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''}>
        {nutritionNew(user) && <span className="absolute -top-2 right-3 z-10 rounded-full bg-danger px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">New</span>}
        <Toggle on={user.nutrition_on} onChange={(on) => save({ nutrition_on: on, nutrition_seen: true, ...withNutritionTab(user, on) })} title="Nutrition tracking"
          body={user.nutrition_on
            ? 'On: food logging, calorie & macro targets, and calorie burn estimates for your workouts.'
            : 'Track food, calories and macros, with targets that use your workouts. Off: no Nutrition tab or calorie estimates.'} />
      </div>

      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Workouts</h2>
      <button onClick={() => setRestOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
        <TimerIcon width={22} height={22} className="text-accent" />
        <span className="flex-1"><span className="block font-bold">Default rest between sets</span><span className="block text-sm text-muted">Used for exercises you add. Change any exercise's rest by tapping its timer.</span></span>
        <span className="num text-lg font-black">{restLabel(userRest(user))}</span>
      </button>
      <button onClick={() => setAfterOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
        <TimerIcon width={22} height={22} className="text-accent" />
        <span className="flex-1"><span className="block font-bold">Default rest after an exercise</span><span className="block text-sm text-muted">Starts when you finish an exercise's last set, before the next one. Set per lift in its info sheet.</span></span>
        <span className="num text-lg font-black">{restLabel(userRestAfter(user))}</span>
      </button>
      <Toggle on={user.update_routine} onChange={(update_routine) => save({ update_routine })} title="Update routine when finishing" body="Pre-selects “Update routine” on the finish screen." />
      <Toggle on={user.save_as_routine} onChange={(save_as_routine) => save({ save_as_routine })} title="Save empty workouts as routines" body="Pre-selects “Save as a routine” for workouts not started from one." />

      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Privacy</h2>
      <p className="text-xs text-muted">What friends can see on your profile. Your posts follow each workout's own privacy.</p>
      <Toggle on={!user.hide_stats} onChange={(on) => save({ hide_stats: !on })} title="Lifting stats"
        body={user.hide_stats ? 'Off: friends see your posts, but not your sets, stats or lift history.' : 'On: friends can see your lifting stats, strongest sets and lift history.'} />
      <Toggle on={!!user.share_physique} onChange={(share_physique) => save({ share_physique })} title="Physique"
        body={user.share_physique ? 'On: friends can see your weight and body composition readings.' : 'Off: your weight and body measurements stay private.'} />
      <Toggle on={!!user.share_insights && !user.hide_stats} onChange={(share_insights) => save({ share_insights })} title="Insights"
        body={user.hide_stats ? 'Needs Lifting stats on (insights are built from your lifts).' : user.share_insights ? 'On: friends can see your progress insights and PR predictions.' : 'Off: your insights and PR predictions stay private.'} />

      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Default post privacy</h2>
      <Card className="grid grid-cols-2 gap-2 p-2">
        {([['public', 'Public', GlobeIcon], ['private', 'Private', LockIcon]] as const).map(([v, t, Icon]) => (
          <button key={v} onClick={() => save({ post_visibility: v })} className={`flex items-center justify-center gap-2 rounded-xl p-3 font-bold ${vis === v ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
            <Icon width={18} height={18} />{t}
          </button>
        ))}
      </Card>
      <p className="text-xs text-muted">Your last choice on the finish screen is remembered here too.</p>
      <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Account security</h2>
      <button onClick={() => setPwOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
        <LockIcon width={22} height={22} className="text-accent" />
        <span className="flex-1"><span className="block font-bold">Change password</span><span className="block text-sm text-muted">Signs you out on your other devices. You can log in with your email or @{user.username}.</span></span>
      </button>
      {pwDone && <p className="text-sm font-semibold text-accent">{pwDone}</p>}

      <h2 className="pt-6 text-sm font-bold uppercase tracking-wider text-danger">Danger zone</h2>
      <button onClick={() => { setDone(''); setClearOpen(true) }} className="flex w-full items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-left">
        <TrashIcon width={22} height={22} className="text-danger" />
        <span className="flex-1"><span className="block font-bold text-danger">Delete all workout history</span><span className="block text-sm text-muted">Removes every workout and lift you've logged, plus their comments and reactions. Your routines, exercises and friends stay.</span></span>
      </button>
      {done && <p className="text-sm font-semibold text-accent">{done}</p>}

      <BackendCheck />
      {clearOpen && (
        <ConfirmSheet title="Delete all workout history?" confirmLabel={progress ? `Deleting… ${progress}` : 'Delete everything'} typeToConfirm="DELETE"
          body={<>Every workout and set you've ever logged (including Liftoff imports) will be <span className="font-bold text-ink">permanently deleted</span>. Your stats, PRs and history will reset to zero. This can't be undone.</>}
          onConfirm={async () => {
            const n = await deleteAllHistory((d, t) => setProgress(`${d}/${t}`))
            setProgress(''); setDone(`Deleted ${n} workout${n === 1 ? '' : 's'}.`)
          }}
          onClose={() => { setClearOpen(false); setProgress('') }} />
      )}
      {pwOpen && <ChangePassword user={user} onClose={() => setPwOpen(false)} onDone={() => { setPwOpen(false); setPwDone('Password changed. Your other devices have been signed out.') }} />}
      {afterOpen && <RestPicker value={userRestAfter(user)} title="Rest after an exercise" onSave={(default_rest_after_s) => save({ default_rest_after_s })} onClose={() => setAfterOpen(false)}
        onUseDefault={() => save({ default_rest_after_s: 0 })} defaultValue={userRest(user)} />}
      {restOpen && <RestPicker value={userRest(user)} title="Default rest timer" onSave={(default_rest_s) => save({ default_rest_s: default_rest_s || 0 })} onClose={() => setRestOpen(false)} />}
    </Screen>
  )
}

/** Change password: needs the current one. Changing it invalidates every session, so sign this device back in right after. */
function ChangePassword({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = checkPassword(pw, { username: user.username, email: user.email })
  const save = async () => {
    setErr('')
    if (!s.ok) return setErr(s.problem)
    if (pw !== confirm) return setErr("New passwords don't match.")
    if (pw === current) return setErr('Pick a password different from your current one.')
    setBusy(true)
    try {
      await pb.collection('users').update(user.id, { oldPassword: current, password: pw, passwordConfirm: confirm })
      await pb.collection('users').authWithPassword(user.username, pw)
      onDone()
    } catch (e) {
      const m = errMsg(e)
      setErr(/old ?password/i.test(m) ? 'Your current password is wrong.' : m)
      setBusy(false)
    }
  }
  return (
    <BottomSheet title="Change password" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
        <PasswordField value={current} onChange={setCurrent} placeholder="Current password" label="Current password" />
        <PasswordField value={pw} onChange={setPw} placeholder="New password (10+ characters)" label="New password" autoComplete="new-password" meter ctx={{ username: user.username, email: user.email }} />
        <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm new password" label="Confirm new password" autoComplete="new-password" />
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy || !current || !s.ok || !confirm}>{busy ? 'Saving…' : 'Change password'}</Button>
      </form>
    </BottomSheet>
  )
}

/** Small diagnostic: pings the server's health endpoint and shows whether it answered (and how fast). */
function BackendCheck() {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const test = async () => {
    setBusy(true)
    const t0 = performance.now()
    try {
      await pb.health.check({ requestKey: null })
      setState({ ok: true, text: `Connected · ${Math.round(performance.now() - t0)} ms` })
    } catch (e) {
      setState({ ok: false, text: `Not connected${(e as { status?: number }).status ? ` (${(e as { status: number }).status})` : ''}` })
    }
    setBusy(false)
  }
  return (
    <div className="flex items-center justify-center gap-3 pt-6 text-xs text-muted">
      <Button variant="ghost" size="sm" onClick={test} disabled={busy}>{busy ? 'Testing…' : 'Test backend'}</Button>
      {state && <span className={`flex items-center gap-1.5 font-semibold ${state.ok ? 'text-accent' : 'text-danger'}`}>
        <span className={`size-2 rounded-full ${state.ok ? 'bg-accent' : 'bg-danger'}`} />{state.text}
      </span>}
    </div>
  )
}

const PUSH_HELP:Partial<Record<PushState, string>> = {
  'needs-install': 'On iPhone, add Better Lift to your Home Screen first: tap Share → Add to Home Screen, then open it from there.',
  unsupported: "This browser can't get push notifications.",
  denied: 'Notifications are blocked. Turn them on in your phone’s Settings → Notifications → Better Lift, then come back.',
}

/** Push notifications on this device: comments, reactions, friend requests, reminders… plus the red number on the app icon. */
function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])
  if (!state) return null
  const toggle = async (on: boolean) => {
    setBusy(true); setErr('')
    try { setState(on ? await enablePush() : (await disablePush(), 'off')) } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  const help = PUSH_HELP[state]
  return (
    <>
      {help
        ? <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted"><span className="block font-bold text-ink">Push notifications</span>{help}</p>
        : <Toggle on={state === 'on'} onChange={(on) => !busy && toggle(on)} title="Push notifications"
            body={state === 'on' ? 'On for this device: comments, reactions, friend requests and reminders, with a badge on the app icon.' : 'Get comments, reactions, friend requests and reminders on this device, even when the app is closed.'} />}
      <ErrorText>{err}</ErrorText>
    </>
  )
}
