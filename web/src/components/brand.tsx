import { cn } from '../lib/format'

/** The Mercity mark: a hub with four linked nodes, redrawn as SVG from the company logo. */
export function MercityMark({ className }: { className?: string }) {
  return (
    <svg viewBox="56 38 218 206" className={cn('size-7 shrink-0', className)} aria-hidden>
      <g stroke="currentColor" fill="none" strokeLinecap="round">
        <path d="M165 150 L122 58 M165 150 L78 147 M165 150 L256 158 M165 150 L116 224" strokeWidth="7" />
        <circle cx="122" cy="58" r="11" strokeWidth="6.5" fill="var(--color-surface)" />
        <circle cx="78" cy="147" r="11" strokeWidth="6.5" fill="var(--color-surface)" />
        <circle cx="256" cy="158" r="11" strokeWidth="6.5" fill="var(--color-surface)" />
        <circle cx="116" cy="224" r="11" strokeWidth="6.5" fill="var(--color-surface)" />
        <circle cx="165" cy="150" r="23" strokeWidth="13" fill="var(--color-surface)" />
      </g>
    </svg>
  )
}
