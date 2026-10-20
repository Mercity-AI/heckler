import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/format'
import { Spinner } from './primitives'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-indigo-500 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(48_40_215/0.35)] hover:bg-indigo-600 active:bg-indigo-700',
  ink: 'bg-ink text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(22_22_29/0.3)] hover:bg-n-800',
  secondary: 'bg-surface text-ink border border-line shadow-card hover:border-line-2 hover:bg-n-50',
  ghost: 'text-ink-2 hover:bg-n-100 hover:text-ink',
  danger: 'bg-surface text-fail border border-line hover:border-fail/40 hover:bg-fail-soft',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-[13.5px] gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-[14.5px] gap-2 rounded-xl',
  icon: 'h-8 w-8 rounded-lg justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center whitespace-nowrap font-display font-medium tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-out-soft active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  )
})
