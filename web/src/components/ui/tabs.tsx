import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/format'

/** Underline tabs; the indicator slides between items. Content switching is left to the caller. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  id,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode; count?: ReactNode }[]
  id: string
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-line', className)}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative -mb-px flex h-10 items-center gap-2 px-3 font-display text-[13.5px] font-medium transition-colors',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {item.label}
            {item.count != null && (
              <span className={cn('tabular rounded-md px-1.5 py-px font-mono text-[10.5px] transition-colors', active ? 'bg-ink text-white' : 'bg-n-100 text-ink-3')}>
                {item.count}
              </span>
            )}
            {active && (
              <motion.span layoutId={`tab-${id}`} className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
