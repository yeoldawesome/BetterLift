import { useState, type FormEvent } from 'react'
import { PasswordField } from '../components/PasswordField'
import { Button, ErrorText, Input, Segmented } from '../components/ui'
import { checkPassword } from '../lib/password'
import { errMsg, pb } from '../lib/pb'

type Mode = 'login' | 'signup' | 'forgot'

/** Friendlier messages for the usual auth failures (never says whether an account exists). */
function authErr(e: unknown) {
  const st = (e as { status?: number }).status
  if (st === 429) return 'Too many attempts. Wait a minute and try again.'
  if (st === 400 && /authenticate/i.test(errMsg(e))) return 'Wrong email/username or password.'
  return errMsg(e)
}

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login')
  const [identity, setIdentity] = useState('') // email or username (log in / forgot)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState('')
  const [busy, setBusy] = useState(false)

  const strength = checkPassword(password, { username, email })
  const mismatch = mode === 'signup' && confirm.length > 0 && confirm !== password
  const go = (m: Mode) => { setMode(m); setErr(''); setSent('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'signup') {
        if (!strength.ok) throw new Error(strength.problem)
        if (password !== confirm) throw new Error("Passwords don't match.")
        await pb.collection('users').create({ email: email.trim(), username: username.toLowerCase(), password, passwordConfirm: confirm, unit: 'lb', emailVisibility: false })
        await pb.collection('users').authWithPassword(email.trim(), password)
      } else if (mode === 'login') {
        // Usernames are stored lowercase; emails are matched case-insensitively by the server.
        const id = identity.trim()
        await pb.collection('users').authWithPassword(id.includes('@') ? id : id.toLowerCase(), password)
      } else {
        await pb.send('/api/betterlift/request-password-reset', { method: 'POST', body: { identity: identity.trim() } })
        setSent("If that account exists, we've emailed it a link to reset your password. The link works for 30 minutes. Check your spam folder too.")
      }
    } catch (x) { setErr(authErr(x)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-safe py-10 pt-safe">
      <img src="/icon.svg" alt="" className="mb-6 size-16 rounded-2xl" />
      <h1 className="text-4xl font-black tracking-tight">Better Lift</h1>
      <p className="mb-8 mt-1 text-muted">Log lifts. Build routines. Lift with friends.</p>
      {mode === 'forgot' ? (
        <div>
          <h2 className="text-xl font-extrabold">Reset your password</h2>
          <p className="mt-1 text-sm text-muted">Enter your email or username and we'll email you a link to choose a new password.</p>
        </div>
      ) : (
        <Segmented value={mode} onChange={go} options={[['login', 'Log in'], ['signup', 'Sign up']]} />
      )}
      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === 'signup' ? (
          <>
            <Input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Username (a-z, 0-9, _)" autoComplete="username" autoCapitalize="none" value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} minLength={3} maxLength={24} required />
            <PasswordField value={password} onChange={setPassword} placeholder="Password (10+ characters)" autoComplete="new-password" meter ctx={{ username, email }} />
            <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm password" autoComplete="new-password" />
            {mismatch && <p className="text-xs font-semibold text-danger">Passwords don't match.</p>}
          </>
        ) : (
          <>
            <Input placeholder="Email or username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={identity} onChange={(e) => setIdentity(e.target.value)} required aria-label="Email or username" />
            {mode === 'login' && <PasswordField value={password} onChange={setPassword} />}
          </>
        )}
        <ErrorText>{err}</ErrorText>
        {sent && <p className="rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accent">{sent}</p>}
        <Button disabled={busy || (mode === 'signup' && (!strength.ok || mismatch || !confirm))}>
          {busy ? '…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'}
        </Button>
      </form>
      <div className="mt-4 text-center text-sm">
        {mode === 'login' && <button onClick={() => go('forgot')} className="font-semibold text-accent">Forgot password?</button>}
        {mode === 'forgot' && <button onClick={() => go('login')} className="font-semibold text-accent">Back to log in</button>}
      </div>
    </div>
  )
}
