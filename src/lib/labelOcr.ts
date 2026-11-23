import { kcalFrom, type Macros } from './nutrition'

/** What a Nutrition Facts panel says, per serving. Missing values are undefined. */
export type LabelRead = { kcal?: number; p?: number; c?: number; f?: number; serving?: string; text: string
  /** A value that couldn't be read and was worked out from the calories instead. */
  inferred?: 'p' | 'c' | 'f' }

// OCR slips on digits: O→0, l/I/|→1, S→5, B→8.
const fixDigits = (s: string) => s.replace(/\b[oO](?=\s?m?g\b)/g, '0').replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0').replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1').replace(/(?<=\d)S|S(?=\d)/g, '5').replace(/(?<=\d)B(?=\d)/g, '8')

// Label words as OCR tends to see them ("Calorles", "Prote1n", "Total Carb.", "Carbohydrates").
const CAL = /ca[l1i|]or[il1|]es|energy/i
const WORDS = {
  f: /total\s*fat|^\W*fat\b/im,
  c: /total\s*carb\w*\.?|^\W*carb\w*\.?/im,
  p: /pr[o0]te[il1|]n|pr[o0]tem/i,
}

/**
 * Possible readings of the amount after a label word. The "g" is often read as a digit ("8g" → "83", "37g" → "370",
 * "23g" → "239") and decimal points get lost ("0.5g" → "05g"), so each misreading's fix is a candidate; the
 * calories decide which one is right. Only the first number counts (per serving, not the "per container" column).
 */
function candidates(text: string, word: RegExp): number[] {
  const m = text.match(new RegExp(`(?:${word.source})[^\\d<\\n%]{0,12}(<\\s*)?(\\d{1,4}(?:[.,]\\d{1,2})?)(?![\\d.,]*\\s*%)\\s*(mg|g)?`, word.flags.replace('g', '')))
  if (!m) return []
  if (m[3]?.toLowerCase() === 'mg') return [0]
  if (m[1]) return [0.5] // "<1g"
  const raw = m[2].replace(',', '.')
  const out = new Set<number>([parseFloat(raw)])
  const intPart = !raw.includes('.')
  // A digit that was really the "g" (only when no unit was read right after it).
  if (!m[3] && raw.length > 1 && intPart) out.add(parseFloat(raw.slice(0, -1)))
  // Labels never print two decimals for grams: "0.59" is "0.5g" with the g read as a 9.
  if (/\.\d\d$/.test(raw)) return [parseFloat(raw.slice(0, -1))]
  // A lost decimal point: "05g" → 0.5, "059" → 0.5.
  if (/^0\d/.test(raw)) { out.add(parseFloat(`0.${raw.slice(1)}`)); out.add(parseFloat(`0.${raw.slice(1, 2)}`)) }
  return [...out].filter((v) => Number.isFinite(v) && v >= 0 && v < 400)
}

/** Reads calories, macros and serving size from OCR text of a US / Canadian-style Nutrition Facts label. */
export function parseLabel(raw: string): LabelRead {
  const text = fixDigits(raw).replace(/[ \t]+/g, ' ')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Calories: the first number after "Calories" (same line or the next one). Skip "Calories from Fat" and the footnote.
  let kcal: number | undefined
  for (let i = 0; i < lines.length && kcal === undefined; i++) {
    if (!CAL.test(lines[i]) || /from fat|per gram|2[,.]?000|diet|advice/i.test(lines[i])) continue
    const kj = lines[i].match(/(\d{1,4})\s*kcal/i)
    const m = kj ?? lines[i].match(new RegExp(`(?:${CAL.source})[^\\d\\n]{0,14}(\\d{1,4})`, 'i')) ?? lines[i + 1]?.match(/^\D{0,3}(\d{1,4})\b/)
    if (m) kcal = Number(m[1])
  }

  const cand = { f: candidates(text, WORDS.f), c: candidates(text, WORDS.c), p: candidates(text, WORDS.p) }
  const pick = (k: 'f' | 'c' | 'p') => (cand[k].length ? cand[k] : [undefined])

  // Choose the readings that best agree with the calories (4/4/9 kcal per gram). Ties keep the reading as printed.
  let best: { p?: number; c?: number; f?: number } = { p: cand.p[0], c: cand.c[0], f: cand.f[0] }
  if (kcal) {
    let err = Infinity
    pick('p').forEach((p, ip) => pick('c').forEach((c, ic) => pick('f').forEach((f, iff) => {
      const e = Math.abs(kcalFrom(p ?? 0, c ?? 0, f ?? 0) - kcal!) + (ip + ic + iff) * 0.5
      if (e < err) { err = e; best = { p, c, f } }
    })))
  }

  // One value unreadable ("8g" read as "gg"): the calories pin it down.
  let inferred: LabelRead['inferred']
  if (kcal) {
    const miss = (['p', 'c', 'f'] as const).filter((k) => best[k] === undefined)
    if (miss.length === 1) {
      const k = miss[0]
      const rest = kcal - kcalFrom(best.p ?? 0, best.c ?? 0, best.f ?? 0)
      const g = rest / (k === 'f' ? 9 : 4)
      // Labels print whole grams (fat under 5 g in halves).
      const v = k === 'f' && g < 5 ? Math.round(g * 2) / 2 : Math.round(g)
      if (v >= 0) { best[k] = v; inferred = k }
    }
  }

  const sm = text.match(/serving\s*size[:\s]*([^\n]{1,40})/i)
  const serving = sm?.[1].replace(/\s+/g, ' ').replace(/\((\d+)9\)/, '($1g)').trim()
  return { kcal, ...best, serving, text: raw, ...(inferred ? { inferred } : {}) }
}

export const labelMacros = (r: LabelRead): Macros => ({ kcal: r.kcal ?? 0, p: r.p ?? 0, c: r.c ?? 0, f: r.f ?? 0 })

/** How trustworthy a reading is: every value found, and the macros adding up to the calories. */
export function labelScore(r: LabelRead) {
  const found = [r.kcal, r.p, r.c, r.f].filter((v) => v !== undefined).length
  if (found < 4 || !r.kcal) return found
  const err = Math.abs(kcalFrom(r.p!, r.c!, r.f!) - r.kcal) / Math.max(40, r.kcal)
  // 5 = adds up exactly; above ~4.5 is within ~12%. A worked-out value adds up by construction, so it can't beat a clean read.
  return r.inferred ? 4.4 : 4 + Math.max(0, 1 - err * 4)
}

// ---------- image prep ----------

/** Decodes with the photo's EXIF rotation applied (iPhone photos are often stored sideways with a rotation tag). */
async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0) }
}

/** Grayscale at a size Tesseract reads well: small photos are enlarged, huge ones shrunk. */
function grayCanvas(img: HTMLImageElement, minLong = 1100) {
  const long = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(2400, Math.max(minLong, long)) / long
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  const g = new Uint8ClampedArray(c.width * c.height)
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d.data[i] * 299 + d.data[i + 1] * 587 + d.data[i + 2] * 114) / 1000
  return { c, ctx, d, g }
}

/** Contrast stretch: the darkest 2% become black, the lightest 2% white (faded or dim photos). */
function stretched({ c, ctx, d, g }: ReturnType<typeof grayCanvas>) {
  const hist = new Uint32Array(256); for (const v of g) hist[v]++
  const at = (q: number) => { let n = 0; for (let v = 0; v < 256; v++) { n += hist[v]; if (n >= g.length * q) return v } return 255 }
  const lo = at(0.02), hi = Math.max(lo + 1, at(0.98))
  for (let j = 0, i = 0; j < g.length; j++, i += 4) { const v = ((g[j] - lo) * 255) / (hi - lo); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 }
  ctx.putImageData(d, 0, 0)
  return c
}

/** Black-and-white with a local threshold (Bradley), so shadows and uneven light don't swallow the text. */
function binarized({ c, ctx, d, g }: ReturnType<typeof grayCanvas>) {
  const w = c.width, h = c.height, s = Math.max(15, Math.round(w / 24)), t = 0.15
  const sum = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row } }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - s), y1 = Math.min(h - 1, y + s)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - s), x1 = Math.min(w - 1, x + s)
      const n = (x1 - x0 + 1) * (y1 - y0 + 1)
      const tot = sum[(y1 + 1) * (w + 1) + x1 + 1] - sum[y0 * (w + 1) + x1 + 1] - sum[(y1 + 1) * (w + 1) + x0] + sum[y0 * (w + 1) + x0]
      const v = g[y * w + x] * n <= tot * (1 - t) ? 0 : 255
      const i = (y * w + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255
    }
  }
  ctx.putImageData(d, 0, 0)
  return c
}

/**
 * Reads a photo of a Nutrition Facts panel on the phone (Tesseract, nothing uploaded). Tries a cleaned-up grayscale
 * first; if the numbers don't add up, tries black-and-white and other layouts, and keeps the best reading.
 */
export async function readLabel(file: Blob, onProgress?: (pct: number) => void, paths?: { workerPath?: string; corePath?: string; langPath?: string }): Promise<LabelRead> {
  const img = await loadImage(file)
  const { createWorker, PSM } = await import('tesseract.js')
  const gray = (minLong: number) => { const g = grayCanvas(img, minLong); for (let i = 0, j = 0; j < g.g.length; i += 4, j++) g.d.data[i] = g.d.data[i + 1] = g.d.data[i + 2] = g.g[j]; g.ctx.putImageData(g.d, 0, 0); return g.c }
  // Tried in order until one adds up; measured on real labels (straight, tilted, shadowed, small, sideways).
  const passes = [() => gray(2000), () => gray(1500), () => stretched(grayCanvas(img, 1500)), () => binarized(grayCanvas(img, 1500))]
  let pass = 0
  const worker = await createWorker('eng', 1, {
    ...paths,
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.(Math.min(0.99, (pass + m.progress) / passes.length)) },
  })
  try {
    // A label is one block of text; Tesseract's automatic layout splits the columns apart and loses the numbers.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
    let best: LabelRead | null = null
    for (const make of passes) {
      const r = parseLabel((await worker.recognize(make())).data.text)
      if (!best || labelScore(r) > labelScore(best)) best = r
      pass++
      if (labelScore(best) >= 4.85) break
    }
    return best!
  } finally { await worker.terminate() }
}
