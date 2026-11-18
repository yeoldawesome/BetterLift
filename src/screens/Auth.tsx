import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Input, Segmented } from '../components/ui'
import { errMsg, pb } from '../lib/pb'

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'signup') {
        await pb.collection('users').create({ email, username: username.toLowerCase(), password, passwordConfirm: password, unit: 'lb', emailVisibility: false })
      }
      await pb.collection('users').authWithPassword(email, password)
    } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-safe py-10 pt-safe">
      <img src="/icon.svg" alt="" className="mb-6 size-16 rounded-2xl" />
      <h1 className="text-4xl font-black tracking-tight">Better Lift</h1>
      <p className="mb-8 mt-1 text-muted">Log lifts. Build routines. Lift with friends.</p>
      <Segmented value={mode} onChange={setMode} options={[['login', 'Log in'], ['signup', 'Sign up']]} />
      <form onSubmit={submit} className="mt-5 space-y-3">
        <Input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode === 'signup' && (
          <Input placeholder="Username (a-z, 0-9, _)" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} minLength={3} maxLength={24} required />
        )}
        <Input type="password" placeholder="Password (8+ characters)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy}>{busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}</Button>
      </form>
    </div>
  )
}
