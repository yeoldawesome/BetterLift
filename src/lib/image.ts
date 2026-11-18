/** Decode any picked photo (incl. iPhone HEIC, which Safari hands over as JPEG) into a drawable image. */
async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    return { img: bmp, w: bmp.width, h: bmp.height }
  } catch {
    // Older iOS Safari: fall back to an <img> element.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { img, w: img.naturalWidth, h: img.naturalHeight }
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
  }
}

/** Center-crop to a square and downscale to max 512px JPEG (always far under the 5MB server limit). */
export async function resizeImage(file: File, max = 512): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) throw new Error('Please choose an image.')
  const { img, w, h } = await decode(file)
  const side = Math.min(w, h)
  const out = Math.min(max, side)
  const c = document.createElement('canvas')
  c.width = c.height = out
  c.getContext('2d')!.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encode failed'))), 'image/jpeg', 0.85))
  if (blob.size > 5 * 1024 * 1024) throw new Error('Image too large')
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
}
