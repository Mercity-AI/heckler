import { Check, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/format'

export interface MenuItem {
  value: string
  label: ReactNode
  hint?: ReactNode
  icon?: ReactNode
}

/**
 * A small dropdown: trigger button plus a floating list. Closes on outside click and Escape;
 * arrow keys move through items, Enter picks.
 */
export function Menu({
  items,
  value,
  onSelect,
  placeholder,
  align = 'end',
  className,
}: {
  items: MenuItem[]
  value?: string | null
  onSelect: (value: string) => void
  placeholder: ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = items.find((i) => i.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  function pick(v: string) {
    setOpen(false)
    onSelect(v)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setOpen(false)
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setCursor(Math.max(0, items.findIndex((i) => i.value === value)))
      return setOpen(true)
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[cursor]) pick(items[cursor].value)
    }
  }

  return (
    <div ref={root} className={cn('relative', className)} onKeyDown={onKey}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setCursor(Math.max(0, items.findIndex((i) => i.value === value)))
          setOpen((o) => !o)
        }}
        className={cn(
          'inline-flex h-9 w-full items-center gap-2 rounded-[10px] border bg-surface pr-2.5 pl-3 font-display text-[13px] font-medium shadow-card outline-none transition-[border-color,box-shadow] duration-200',
          open ? 'border-indigo-300 shadow-[0_0_0_3px_var(--color-indigo-100)]' : 'border-line hover:border-line-2',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', current ? 'text-ink' : 'text-ink-2')}>{current?.label ?? placeholder}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: align === 'end' ? 'top right' : 'top left' }}
            className={cn(
              'scrollbar-thin absolute top-[calc(100%+6px)] z-40 max-h-[320px] min-w-full w-max max-w-[340px] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop',
              align === 'end' ? 'right-0' : 'left-0',
            )}
          >
            {items.map((item, i) => {
              const selected = item.value === value
              return (
                <li key={item.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => pick(item.value)}
                    onPointerEnter={() => setCursor(i)}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', cursor === i ? 'bg-n-100' : '')}
                  >
                    {item.icon && <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2">{item.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[13px] font-medium text-ink">{item.label}</span>
                      {item.hint && <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-3">{item.hint}</span>}
                    </span>
                    {selected && <Check className="size-3.5 shrink-0 text-indigo-600" strokeWidth={2.5} />}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
