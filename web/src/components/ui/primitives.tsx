import * as RadixTooltip from '@radix-ui/react-tooltip'
import { Check, Minus } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { forwardRef, useEffect, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useSpotlight } from '../../hooks/useSpotlight'
import { cn } from '../../lib/format'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('size-4 animate-spin', className)} aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * `hover="glow"` adds the cursor spotlight; `hover="lift"` also raises the card. Use glow alone on
 * cards that hold form controls, so they don't move under the pointer.
 */
export function Card({ className, hover, onPointerMove, ...props }: HTMLAttributes<HTMLDivElement> & { hover?: 'glow' | 'lift' }) {
  const spot = useSpotlight()
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-card',
        hover && 'spotlight transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:border-line-2',
        hover === 'lift' && 'hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
      onPointerMove={(e) => {
        if (hover) spot(e)
        onPointerMove?.(e)
      }}
      {...props}
    />
  )
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3', className)} {...props} />
}

export function Chip({ className, tone = 'neutral', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'indigo' | 'outline' }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-n-100 text-ink-2',
        tone === 'indigo' && 'bg-indigo-100 text-indigo-700',
        tone === 'outline' && 'border border-line text-ink-2',
        className,
      )}
      {...props}
    />
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-n-50 px-1 font-mono text-[10.5px] text-ink-3">{children}</kbd>
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-md bg-[linear-gradient(90deg,var(--color-n-100)_0%,var(--color-n-200)_50%,var(--color-n-100)_100%)] bg-[length:200%_100%] animate-shimmer', className)}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-[10px] border border-line bg-surface px-3 text-[13.5px] text-ink shadow-card outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-n-400 hover:border-line-2 focus:border-indigo-300 focus:shadow-[0_0_0_3px_var(--color-indigo-100)] focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'scrollbar-thin w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-ink shadow-card outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-n-400 hover:border-line-2 focus:border-indigo-300 focus:shadow-[0_0_0_3px_var(--color-indigo-100)] focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  )
})

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="font-display text-[12.5px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] leading-snug text-ink-3">{hint}</p>}
    </div>
  )
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200', checked ? 'bg-indigo-500' : 'bg-n-300')}
      >
        <motion.span
          className="absolute size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(22_22_29/0.25)]"
          initial={false}
          animate={{ x: checked ? 18 : 2 }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        />
      </button>
      <span className="flex flex-col">
        <span className="font-display text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[12px] leading-snug text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

/** Segmented control with a sliding thumb. */
/** Square checkbox. `indeterminate` shows a dash (some, not all, selected). Clicks don't bubble. */
export function Checkbox({ checked, indeterminate, onChange, label, className }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  const on = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[5px] border outline-none transition-[background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-indigo-300',
        on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-line-2 bg-surface hover:border-n-400',
        className,
      )}
    >
      {indeterminate ? <Minus className="size-3" strokeWidth={3} /> : checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  id,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  id: string
  className?: string
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-[10px] border border-line bg-n-100 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn('relative flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[12.5px] sm:px-3 font-medium transition-colors', active ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[280px] rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-pop"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

/** A number that eases to its new value. */
export function Ticker({ value, format = (n) => Math.round(n).toString(), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [mv, value])
  return <motion.span className={cn('tabular', className)}>{text}</motion.span>
}

export function Meter({ value, tone = 'indigo', className }: { value: number; tone?: 'indigo' | 'fail' | 'pass' | 'warn' | 'ink'; className?: string }) {
  const color = { indigo: 'bg-indigo-500', fail: 'bg-fail', pass: 'bg-pass', warn: 'bg-warn', ink: 'bg-ink' }[tone]
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-n-100', className)}>
      <motion.div
        className={cn('h-full rounded-full', color)}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink-3 shadow-card">{icon}</div>}
      <div className="font-display text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
