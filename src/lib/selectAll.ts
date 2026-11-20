import type { FocusEvent } from 'react'

/**
 * onFocus handler: select the whole value so typing replaces it. iOS drops a selection made during focus
 * (the tap then places the caret), so select again on the next frame.
 */
export function selectAll(e: FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget
  const sel = () => { try { el.setSelectionRange(0, el.value.length) } catch { el.select() } }
  sel()
  requestAnimationFrame(sel)
  setTimeout(sel, 50)
}
