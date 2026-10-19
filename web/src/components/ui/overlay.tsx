import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/format'

const EASE = [0.22, 1, 0.36, 1] as const

function Overlay() {
  return (
    <RadixDialog.Overlay asChild forceMount>
      <motion.div
        className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      />
    </RadixDialog.Overlay>
  )
}

/** Centered modal. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Overrides the body's default padding (e.g. for a form that pads its own sections). */
  bodyClassName?: string
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <Overlay />
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-8">
              <RadixDialog.Content asChild forceMount>
                <motion.div
                  className={cn('relative flex max-h-[min(860px,calc(100vh-4rem))] w-full max-w-[640px] flex-col rounded-2xl border border-line bg-surface shadow-pop outline-none', className)}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.32, ease: EASE }}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
                    <div>
                      <RadixDialog.Title className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</RadixDialog.Description>
                      ) : (
                        <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
                      )}
                    </div>
                    <RadixDialog.Close className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-n-100 hover:text-ink" aria-label="Close">
                      <X className="size-4" />
                    </RadixDialog.Close>
                  </div>
                  <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5', bodyClassName)}>{children}</div>
                  {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-n-50/60 px-6 py-3.5 rounded-b-2xl">{footer}</div>}
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  )
}

/** Right-hand sheet for drilling into one item without losing the page behind it. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  header,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  header?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <Overlay />
            <RadixDialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              // floating layers (tooltips) are portalled outside the sheet; clicking them must not close it
              onInteractOutside={(e) => (e.target as HTMLElement | null)?.closest?.('[data-radix-popper-content-wrapper]') && e.preventDefault()}
            >
              <motion.div
                className={cn('fixed inset-y-2 right-2 z-50 flex w-[min(1080px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-ground shadow-pop outline-none', className)}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ duration: 0.38, ease: EASE }}
              >
                <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
                <div className="flex items-start gap-4 border-b border-line bg-surface px-6 py-4">
                  <div className="min-w-0 flex-1">{header}</div>
                  <RadixDialog.Close className="-mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-n-100 hover:text-ink" aria-label="Close">
                    <X className="size-4" />
                  </RadixDialog.Close>
                </div>
                <div className="min-h-0 flex-1">{children}</div>
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  )
}
