import { cn } from '../lib/format'

/** The Heckler mark: an angry speech bubble with fangs, traced as SVG from the logo artwork. */
export function HecklerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 111" className={cn('size-7 shrink-0', className)} aria-hidden>
      <path d="M27 0H101A27 27 0 0 1 128 27V66.5L116.5 83.5 105.5 66.5 94.5 83.5 83.5 66.5 72 83.5 60.5 66.5 49.5 83.5 38.5 66.5H27.5L12 110.5 13.5 66.5H12A12 12 0 0 1 0 54.5V27A27 27 0 0 1 27 0Z" fill="var(--color-indigo-500)" />
      <path d="M30.5 23.5 50.5 32.5M97.5 23.5 77.5 32.5" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
      <circle cx="45" cy="46" r="6" fill="#fff" />
      <circle cx="83" cy="46" r="6" fill="#fff" />
    </svg>
  )
}

/** "Heckler" over "BY MERCITY", set like the logo artwork. */
export function HecklerWordmark({ large, className }: { large?: boolean; className?: string }) {
  return (
    <span className={cn('block leading-none whitespace-nowrap', className)}>
      <span className={cn('block font-serif font-medium tracking-[-0.01em] text-ink italic', large ? 'text-[24px]' : 'text-[19px]')}>Heckler</span>
      <span className={cn('block font-sans font-medium tracking-[0.16em] text-ink-3 uppercase', large ? 'mt-1.5 text-[10px]' : 'mt-1 text-[9px]')}>by Mercity</span>
    </span>
  )
}

/** The full Mercity logo (mark and wordmark, from the company site's navbar), linking to mercity.ai. */
export function MercityLogoLink({ className }: { className?: string }) {
  return (
    <a
      href="https://www.mercity.ai"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Mercity website (opens in a new tab)"
      className={cn('inline-flex rounded-md opacity-90 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-300', className)}
    >
      <img src="/mercity-logo.png" alt="Mercity" width={700} height={204} className="h-7 w-auto" />
    </a>
  )
}
