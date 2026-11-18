import { useEffect, useRef } from 'react'
import { pb } from './pb'

/** Re-runs `onChange` (debounced) whenever any of the given collections change. */
export function useRealtime(collections: string[], onChange: () => void, filter?: string) {
  const cb = useRef(onChange)
  cb.current = onChange
  const key = collections.join(',') + (filter ?? '')
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const fire = () => { clearTimeout(t); t = setTimeout(() => cb.current(), 300) }
    const subs = collections.map((c) => pb.collection(c).subscribe('*', fire, filter ? { filter } : undefined).catch(() => () => Promise.resolve()))
    return () => { clearTimeout(t); subs.forEach((s) => s.then((un) => un()).catch(() => {})) }
  }, [key])
}
