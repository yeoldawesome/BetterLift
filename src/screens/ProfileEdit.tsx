import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeightInput } from '../components/HeightInput'
import { Avatar, Button, ErrorText, Input, Screen, Segmented } from '../components/ui'
import { fromUnit, toUnit } from '../lib/format'
import { resizeImage } from '../lib/image'
import { errMsg, pb, useUser, type Unit, type User } from '../lib/pb'

export default function ProfileEdit({ onboarding }: { onboarding?: boolean }) {
  const user = useUser()!
  const nav = useNavigate()
  const [unit, setUnit] = useState<Unit>(user.unit || 'lb')
  const [username, setUsername] = useState(user.username)
  const [name, setName] = useState(user.name)
  const [bw, setBw] = useState(user.bodyweight_kg ? `${Math.round(toUnit(user.bodyweight_kg, unit) * 10) / 10}` : '')
  const [height, setHeight] = useState(user.height_cm || 0)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const switchUnit = (u: Unit) => {
    if (bw) setBw(`${Math.round(toUnit(fromUnit(parseFloat(bw), unit), u) * 10) / 10}`)
    setUnit(u)
  }

  const pick = async (f?: File) => {
    if (!f) return
    try { const r = await resizeImage(f); setAvatar(r); setPreview(URL.createObjectURL(r)) } catch (e) { setErr(errMsg(e)) }
  }

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      const kg = fromUnit(parseFloat(bw) || 0, unit)
      if (!kg || !height) throw new Error('Enter your height and bodyweight.')
      const data: Record<string, unknown> = { username, name, unit, bodyweight_kg: Math.round(kg * 100) / 100, height_cm: height }
      if (avatar) data.avatar = avatar
      await pb.collection('users').update<User>(user.id, data)
      nav(onboarding ? '/workout' : '/profile', { replace: true })
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Screen title={onboarding ? 'Set up profile' : 'Edit profile'} back={!onboarding}>
      {onboarding && <p className="text-muted">Add your height and bodyweight to track your body stats. You can change these anytime in Settings.</p>}
      <label className="flex items-center gap-4">
        {preview ? <img src={preview} className="size-20 rounded-full object-cover" /> : <Avatar user={user} size={80} />}
        <span className="text-sm font-bold text-accent">Change photo</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <Input label="Username" value={username} autoCapitalize="none" onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
      <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Units</span>
        <Segmented value={unit} onChange={switchUnit} options={[['lb', 'Pounds (lb)'], ['kg', 'Kilograms (kg)']]} />
      </div>
      <HeightInput key={unit} cm={height} unit={unit} onChange={setHeight} />
      <Input label={`Bodyweight (${unit})`} inputMode="decimal" value={bw} onChange={(e) => setBw(e.target.value)} placeholder="e.g. 180" />
      <ErrorText>{err}</ErrorText>
      <Button onClick={save} disabled={busy || username.length < 3}>{busy ? 'Saving…' : 'Save'}</Button>
    </Screen>
  )
}
