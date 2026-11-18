import { useEffect, useState, type ReactNode } from 'react'
import { customUrl, EMOJI, emojiChar, loadCustomReactions, prepareReactionImage } from '../lib/reactions'
import { errMsg, me, pb, type CustomReaction, type Reaction } from '../lib/pb'
import { PlusIcon, TrashIcon } from './icons'
import { BottomSheet, Button, ErrorText, Input } from './ui'
import { ask } from './Dialog'

/** Draws one reaction: a built-in emoji, or a custom image. */
export function Glyph({ k, custom, size = 22 }: { k: string; custom?: CustomReaction; size?: number }) {
  const e = emojiChar(k)
  if (e) return <span style={{ fontSize: size, lineHeight: 1 }}>{e}</span>
  if (!custom) return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>❔</span>
  return <img src={customUrl(custom)} alt={custom.name} title={custom.name} width={size} height={size} className="object-contain" style={{ width: size, height: size }} loading="lazy" />
}

/** Lookup from reaction key ("c:<id>") to its custom record, from reactions fetched with expand=custom. */
export const customsOf = (rs: Reaction[]) => {
  const m = new Map<string, CustomReaction>()
  for (const r of rs) if (r.expand?.custom) m.set(`c:${r.custom}`, r.expand.custom)
  return m
}

/** Picker panel: built-in emoji, your custom reactions, your friends', and a button to make a new one. */
export function ReactionPicker({ mine, onPick, onClose, className = '' }: { mine: Set<string>; onPick: (key: string, custom?: CustomReaction) => void; onClose: () => void; className?: string }) {
  const [lists, setLists] = useState<{ mine: CustomReaction[]; friends: CustomReaction[] } | null>(null)
  const [making, setMaking] = useState(false)
  useEffect(() => { loadCustomReactions().then(setLists).catch(() => setLists({ mine: [], friends: [] })) }, [])
  const cell = (key: string, glyph: ReactNode, title: string, custom?: CustomReaction) => (
    <button key={key} title={title} onClick={() => onPick(key, custom)} className={`grid size-10 place-items-center rounded-full ${mine.has(key) ? 'bg-accent/25 ring-2 ring-accent' : 'active:bg-surface-2'}`}>{glyph}</button>
  )
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={`z-50 w-[min(18.5rem,calc(100vw-4.5rem))] space-y-1.5 rounded-3xl border border-line bg-surface p-2 shadow-2xl ${className}`}>
        <div className="flex justify-between">{EMOJI.map(([k, e]) => cell(k, <span className="text-xl">{e}</span>, k))}</div>
        {lists && (lists.mine.length > 0 || lists.friends.length > 0) && (
          <div className="max-h-44 overflow-y-auto border-t border-line pt-1.5">
            {[['Yours', lists.mine], ['Friends', lists.friends]].map(([label, list]) => (list as CustomReaction[]).length > 0 && (
              <div key={label as string}>
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{label as string}</p>
                <div className="grid grid-cols-6 gap-0.5">
                  {(list as CustomReaction[]).map((c) => cell(`c:${c.id}`, <Glyph k={`c:${c.id}`} custom={c} size={28} />, c.name, c))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setMaking(true)} className="flex w-full items-center justify-center gap-1 rounded-2xl bg-surface-2 py-2 text-xs font-bold text-accent">
          <PlusIcon width={14} height={14} /> Custom reaction
        </button>
      </div>
      {making && <CustomReactionSheet onClose={() => { setMaking(false); loadCustomReactions().then(setLists).catch(() => {}) }} />}
    </>
  )
}

/** The custom-reaction manager in a bottom sheet (opened from the reaction picker). */
export function CustomReactionSheet({ onClose }: { onClose: () => void }) {
  return <BottomSheet title="Custom reactions" onClose={onClose}><CustomReactionManager /></BottomSheet>
}

/** Make a reaction from your own image, and manage (delete) the ones you've made. */
export function CustomReactionManager() {
  const [mine, setMine] = useState<CustomReaction[]>([])
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = () => loadCustomReactions(true).then((l) => setMine(l.mine)).catch(() => {})
  useEffect(() => { reload() }, [])
  useEffect(() => { if (!file) return setPreview(''); const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u) }, [file])

  const pick = async (f?: File) => {
    setErr('')
    if (!f) return
    try {
      const ready = await prepareReactionImage(f)
      setFile(ready)
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 24))
    } catch (e) { setErr(errMsg(e)) }
  }
  const save = async () => {
    setErr('')
    if (!file || !name.trim()) return setErr('Pick an image and give it a name.')
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('owner', me()); fd.append('name', name.trim()); fd.append('image', file)
      await pb.collection('custom_reactions').create(fd)
      setName(''); setFile(null); await reload()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const remove = async (c: CustomReaction) => {
    if (!await ask({ title: `Delete “${c.name}”?`, body: 'It will also disappear from every post it was used on.', confirmLabel: 'Delete', danger: true })) return
    try { await pb.collection('custom_reactions').delete(c.id); await reload() } catch (e) { setErr(errMsg(e)) }
  }

  return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-2">
            {preview ? <img src={preview} alt="" className="size-16 object-contain" /> : <PlusIcon width={28} height={28} className="text-muted" />}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <div className="min-w-0 flex-1 space-y-2">
            <Input placeholder="Name it (e.g. Light weight)" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            <Button className="w-full" onClick={save} disabled={busy || !file || !name.trim()}>{busy ? 'Uploading…' : 'Add reaction'}</Button>
          </div>
        </div>
        <p className="text-xs text-muted">PNG, JPG, WebP or GIF. Transparent PNGs and GIFs look best. You and your friends can use it on any post.</p>
        <ErrorText>{err}</ErrorText>
        {mine.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Yours</p>
            {mine.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <Glyph k={`c:${c.id}`} custom={c} size={32} />
                <span className="min-w-0 flex-1 truncate font-bold">{c.name}</span>
                <button onClick={() => remove(c)} className="grid size-9 place-items-center rounded-full text-danger" aria-label={`Delete ${c.name}`}><TrashIcon width={18} height={18} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
  )
}
