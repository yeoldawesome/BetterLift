import { useEffect, useState } from 'react'
import { enablePush, pushState, type PushState } from '../lib/push'
import { errMsg, pb, type User } from '../lib/pb'
import { BellIcon } from './icons'
import { BottomSheet, Button } from './ui'

/**
 * One-time popup after account setup: turn on notifications (messages, comments, reactions, friend requests,
 * exercise approvals, plus the red number on the app icon). On iPhone in Safari it explains the Home Screen step
 * instead. Shown once per account (push_asked); Settings → Notifications works any time after.
 */
export function PushWelcome({ user }: { user: User }) {
  const [state, setState] = useState<PushState | null>(null)
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (!user.push_asked) pushState().then(setState).catch(() => setState('off')) }, [user.push_asked])

  if (user.push_asked || closed || (state !== 'off' && state !== 'needs-install')) return null
  const done = () => { setClosed(true); pb.collection('users').update(user.id, { push_asked: true }).catch(() => {}) }
  // Must run straight from the tap: iOS only shows the permission prompt in response to one.
  const turnOn = async () => {
    setBusy(true); setErr('')
    try {
      const s = await enablePush()
      if (s === 'on') return done()
      setErr(s === 'denied' ? 'Notifications are blocked. You can turn them on later in your phone’s Settings → Notifications → Better Lift.' : 'Notifications weren’t turned on. You can do it any time in Settings.')
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  return (
    <BottomSheet title="Stay in the loop" onClose={done}>
      <div className="space-y-4 pb-2">
        <div className="flex gap-3">
          <BellIcon width={28} height={28} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-sm text-muted">
            {state === 'needs-install'
              ? 'To get notifications on iPhone, add Better Lift to your Home Screen first: tap Share → Add to Home Screen, then open it from there. You can turn them on in Settings → Notifications.'
              : 'Get a notification when a friend messages you, comments or reacts to your workout, sends a friend request, or when your exercise submission is approved, plus a badge on the app icon. You can choose which ones in Settings.'}
          </p>
        </div>
        {err && <p className="text-sm font-semibold text-danger">{err}</p>}
        {state === 'off' && <Button disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : 'Turn on notifications'}</Button>}
        <Button variant="ghost" onClick={done}>{state === 'off' ? 'Not now' : 'Got it'}</Button>
      </div>
    </BottomSheet>
  )
}
