import { useCallback, type PointerEvent } from 'react'

/** Feeds the cursor position to the `.spotlight` CSS (as --mx/--my) without re-rendering. */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  return useCallback((e: PointerEvent<T>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])
}
