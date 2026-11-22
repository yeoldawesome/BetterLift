import { kcalFrom, type Macros } from './nutrition'

/** What a Nutrition Facts panel says, per serving. Missing values are undefined. */
export type LabelRead = { kcal?: number; p?: number; c?: number; f?: number; serving?: string; text: string }

// OCR slips on digits: O→0, l/I/|→1, S→5, B→8.
const fixDigits = (s: string) => s.replace(/\b[oO](?=\s?m?g\b)/g, '0').replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0').replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1').replace(/(?<=\d)S|S(?=\d)/g, '5').replace(/(?<=\d)B(?=\d)/g, '8')

/** Grams after a label word: "Total Fat 8g", "Protein 12 g", "Total Carbohydrate. 37g". Also returns the reading with a misread "g" (→ "9") dropped. */
function grams(text: string, word: RegExp): number[] {
  const m = text.match(new RegExp(`(?:${word.source})[^\\d\\n]{0,14}(\\d{1,3}(?:[.,]\\d)?)\\s*(m?g|9)?`, 'i'))
  if (!m) return []
  const v = parseFloat(m[1].replace(',', '.'))
  if (m[2]?.toLowerCase() === 'mg') return [] // "Protein 0mg"? not a macro line we trust
  const out = [v]
  // "12g" read as "129": no unit after, ends in 9, and there's a shorter number to try.
  if (!m[2] && /9$/.test(m[1]) && m[1].length > 1) out.push(parseFloat(m[1].slice(0, -1)))
  if (m[2] === '9') out.splice(0, 1, v) // "12 9" → the 9 was the g
  return out
}

/** Reads calories, macros and serving size from OCR text of a US / Canadian-style Nutrition Facts label. */
export function parseLabel(raw: string): LabelRead {
  const text = fixDigits(raw).replace(/[ \t]+/g, ' ')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Calories: the number after "Calories" (often on the same line, sometimes the next). Skip "Calories from Fat".
  let kcal: number | undefined
  for (let i = 0; i < lines.length && kcal === undefined; i++) {
    if (!/calories|energy/i.test(lines[i]) || /from fat|per gram|2,?000|diet/i.test(lines[i])) continue
    const m = (lines[i].match(/(?:calories|energy)[^\d]{0,12}(\d{1,4})/i) ?? lines[i + 1]?.match(/^(\d{1,4})\b/))
    if (m) kcal = Number(m[1])
  }

  const fat = grams(text, /total\s*fat|\bfat\b/)
  const carb = grams(text, /total\s*carb\w*|carbohydrate\w*|\bcarbs?\b/)
  const prot = grams(text, /protein/)

  // Pick the readings that best agree with the calories (4/4/9 kcal per gram).
  let best: { p?: number; c?: number; f?: number } = { p: prot[0], c: carb[0], f: fat[0] }
  if (kcal) {
    let err = Infinity
    for (const p of prot.length ? prot : [undefined]) for (const c of carb.length ? carb : [undefined]) for (const f of fat.length ? fat : [undefined]) {
      const e = Math.abs(kcalFrom(p ?? 0, c ?? 0, f ?? 0) - kcal)
      if (e < err) { err = e; best = { p, c, f } }
    }
  }

  const sm = text.match(/serving\s*size[:\s]*([^\n]{1,40})/i)
  const serving = sm?.[1].replace(/\s+/g, ' ').replace(/(\d)9\)/, '$1g)').trim()
  return { kcal, ...best, serving, text: raw }
}

export const labelMacros = (r: LabelRead): Macros => ({ kcal: r.kcal ?? 0, p: r.p ?? 0, c: r.c ?? 0, f: r.f ?? 0 })

/** Shrinks and grayscales the photo (faster, and OCR reads it better), then runs Tesseract in a worker. */
export async function readLabel(file: Blob, onProgress?: (pct: number) => void): Promise<LabelRead> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.4)'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress) } })
  try {
    const { data } = await worker.recognize(canvas)
    return parseLabel(data.text)
  } finally { await worker.terminate() }
}
