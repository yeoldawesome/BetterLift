import { anyOf, friendIds, me, pb, type CustomReaction, type Emoji, type Reaction } from './pb'

/** Built-in reactions, in picker order. */
export const EMOJI: [Exclude<Emoji, 'custom'>, string][] = [['fire', '🔥'], ['muscle', '💪'], ['clap', '👏'], ['rocket', '🚀'], ['trophy', '🏆']]
const EMOJI_CHAR = new Map<string, string>(EMOJI)

/** One key per distinct reaction: the emoji name, or "c:<id>" for a custom one. */
export const keyOf = (r: Pick<Reaction, 'emoji' | 'custom'>) => (r.emoji === 'custom' ? `c:${r.custom}` : r.emoji)
export const emojiChar = (k: string) => EMOJI_CHAR.get(k)

export const customUrl = (c: CustomReaction, thumb = true) => pb.files.getURL(c, c.image, thumb && !c.image.endsWith('.gif') ? { thumb: '96x96f' } : {})

/** Add or remove your reaction. `key` is an emoji name or "c:<customId>". */
export async function toggleReaction(workoutId: string, key: string, mine?: Reaction) {
  if (mine) return void await pb.collection('reactions').delete(mine.id)
  const body = key.startsWith('c:') ? { emoji: 'custom', custom: key.slice(2) } : { emoji: key }
  await pb.collection('reactions').create({ workout: workoutId, user: me(), ...body })
}

/** Reactions fetch options: always bring the custom image along. */
export const REACTION_EXPAND = 'custom'

let cache: Promise<{ mine: CustomReaction[]; friends: CustomReaction[] }> | null = null
/** Custom reactions you can use: your own, then your friends'. */
export function loadCustomReactions(force = false) {
  if (force || !cache) {
    cache = (async () => {
      const uid = me()
      const ids = await friendIds().catch(() => [] as string[])
      const all = await pb.collection('custom_reactions').getFullList<CustomReaction>({ filter: `owner = "${uid}"${ids.length ? ` || ${anyOf('owner', ids)}` : ''}`, sort: 'name' })
      return { mine: all.filter((c) => c.owner === uid), friends: all.filter((c) => c.owner !== uid) }
    })().catch((e) => { cache = null; throw e })
  }
  return cache
}

/**
 * Prepare an uploaded image: small GIF/PNG/WebP files go up untouched (keeps animation and transparency);
 * anything else is scaled to fit 160px and saved as PNG.
 */
export async function prepareReactionImage(file: File): Promise<File> {
  const ok = ['image/gif', 'image/png', 'image/webp']
  if (ok.includes(file.type) && file.size <= 1024 * 1024) return file
  if (file.type === 'image/gif') throw new Error('GIFs must be under 1 MB.')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { throw new Error('Please choose an image.') }
  const scale = Math.min(1, 160 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encode failed'))), 'image/png'))
  return new File([blob], 'reaction.png', { type: 'image/png' })
}
