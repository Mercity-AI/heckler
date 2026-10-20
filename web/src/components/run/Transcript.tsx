import * as RadixTooltip from '@radix-ui/react-tooltip'
import { UserRound } from 'lucide-react'
import { motion } from 'motion/react'
import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { findEvidence, type EvidenceHit } from '../../lib/evidence'
import { cn } from '../../lib/format'
import type { TranscriptMessage, Violation } from '../../lib/types'
import { SeverityBadge } from '../status'

const EASE = [0.22, 1, 0.36, 1] as const

/** A quoted violation inside a reply: hover for what went wrong, click to open it in the violations tab. */
function EvidenceMark({ hit, children, onSelect, active }: { hit: EvidenceHit; children: ReactNode; onSelect?: (i: number) => void; active?: boolean }) {
  const { v } = hit
  const mark = (
    <mark
      data-violation={hit.i}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation()
              onSelect(hit.i)
            }
          : undefined
      }
      className={cn(
        'rounded-[3px] px-0.5 text-ink underline decoration-fail/70 decoration-[1.5px] underline-offset-[3px] transition-colors [box-decoration-break:clone]',
        active ? 'bg-fail/25' : 'bg-fail/[0.11]',
        onSelect && 'cursor-pointer hover:bg-fail/20',
      )}
    >
      {children}
    </mark>
  )
  if (!onSelect) return mark
  return (
    <RadixTooltip.Root delayDuration={120}>
      <RadixTooltip.Trigger asChild>{mark}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content asChild side="top" align="start" sideOffset={8} collisionPadding={16}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(hit.i)
            }}
            className="group z-[60] block w-[310px] cursor-pointer rounded-xl border border-line bg-surface p-3.5 text-left shadow-pop transition-colors hover:border-fail/30"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] font-medium tracking-wider text-fail uppercase">Policy violation</span>
              <SeverityBadge severity={v.severity} />
            </span>
            <span className={cn('mt-1.5 block font-display text-[13px] leading-snug font-semibold', v.explanation ? 'text-ink' : 'text-ink-3')}>
              {v.explanation || 'No description recorded for this violation.'}
            </span>
            <span className="mt-2 block font-mono text-[9.5px] tracking-wider text-ink-3 uppercase">Policy violated</span>
            <span className="mt-0.5 line-clamp-3 block text-[12px] leading-snug text-ink-2">{v.rule}</span>
            <span className="mt-2.5 block text-[11.5px] font-medium text-indigo-600 transition-transform duration-200 group-hover:translate-x-0.5">
              Open the violation →
            </span>
          </button>
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

export function Highlighted({
  content,
  violations,
  onSelect,
  activeViolation,
}: {
  content: string
  violations: Violation[]
  onSelect?: (i: number) => void
  activeViolation?: number | null
}) {
  const hits = violations.length ? findEvidence(content, violations) : []
  if (!hits.length) return <>{content}</>
  const out: ReactNode[] = []
  let cursor = 0
  hits.forEach((h, k) => {
    if (h.start > cursor) out.push(content.slice(cursor, h.start))
    out.push(
      <EvidenceMark key={k} hit={h} onSelect={onSelect} active={activeViolation === h.i}>
        {content.slice(h.start, h.end)}
      </EvidenceMark>,
    )
    cursor = h.end
  })
  if (cursor < content.length) out.push(content.slice(cursor))
  return <>{out}</>
}

/** Who's speaking: the simulated user as a neutral mark, the agent under test as its initial. */
export function SpeakerMark({ role, targetName, size = 'sm' }: { role: 'attacker' | 'target'; targetName: string; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-[22px] text-[10px] rounded-[7px]' : 'size-7 text-[11.5px] rounded-lg'
  if (role === 'attacker')
    return (
      <span className={cn('grid shrink-0 place-items-center bg-n-800 text-white', dims)} aria-hidden>
        <UserRound className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2.25} />
      </span>
    )
  return (
    <span className={cn('grid shrink-0 place-items-center border border-indigo-200 bg-surface font-display font-semibold text-indigo-700', dims)} aria-hidden>
      {targetName.trim().charAt(0).toUpperCase() || 'A'}
    </span>
  )
}

// The agent under test speaks from the left, the simulated user from the right.
const bubbleTone = {
  attacker: 'bg-surface border border-line text-ink-2 rounded-tr-[6px] shadow-[0_1px_0_rgb(22_22_29/0.03)]',
  target: 'bg-indigo-50 border border-indigo-100 text-ink rounded-tl-[6px]',
}

/** Clamps long messages to a few lines with an ellipsis, fading the last lines so the cut reads as deliberate. */
function Clamp({ lines, watch, children }: { lines: number; watch: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setClipped(el.scrollHeight - el.clientHeight > 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [watch])
  return (
    <div ref={ref} className={cn(clipped && 'clamp-fade')} style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

export function TypingBubble({ side, targetName, compact }: { side: 'attacker' | 'target'; targetName: string; compact?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.25, ease: EASE }}
      className={cn('flex items-start gap-2', side === 'attacker' && 'flex-row-reverse')}
    >
      <SpeakerMark role={side} targetName={targetName} size={compact ? 'sm' : 'md'} />
      <div className={cn('flex items-center gap-1 rounded-2xl px-3 py-2.5', bubbleTone[side])}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-blink rounded-full"
            style={{ animationDelay: `${i * 0.16}s`, backgroundColor: side === 'attacker' ? 'var(--color-n-500)' : 'var(--color-indigo-500)' }}
          />
        ))}
      </div>
    </motion.div>
  )
}

export const MessageBubble = forwardRef<
  HTMLDivElement,
  {
    message: TranscriptMessage
    targetName: string
    violations: Violation[]
    compact?: boolean
    showMeta?: boolean
    onSelectViolation?: (i: number) => void
    activeViolation?: number | null
  }
>(function MessageBubble({ message, targetName, violations, compact, showMeta = true, onSelectViolation, activeViolation }, ref) {
  const isTarget = message.role === 'target'
  const flagged = isTarget && violations.length > 0 && findEvidence(message.content, violations).length > 0
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ originX: isTarget ? 0 : 1 }}
      className={cn('flex items-start gap-2', !isTarget && 'flex-row-reverse')}
    >
      <SpeakerMark role={message.role} targetName={targetName} size={compact ? 'sm' : 'md'} />
      <div className={cn('flex min-w-0 flex-col gap-1', isTarget ? 'items-start' : 'items-end', compact ? 'max-w-[86%]' : 'max-w-[82%]')}>
        {showMeta && !compact && (
          <span className="flex items-center gap-1.5 px-0.5 text-[11px] text-ink-3">
            <span className="font-medium text-ink-2">{isTarget ? targetName : 'Simulated user'}</span>
            <span className="font-mono text-[10px]">turn {message.turn}</span>
          </span>
        )}
        <div
          className={cn(
            'relative rounded-2xl leading-relaxed break-words whitespace-pre-wrap',
            compact ? 'px-3 py-2 text-[12.5px]' : 'px-3.5 py-2.5 text-[13.5px]',
            bubbleTone[message.role],
            flagged && 'border-fail/30 bg-fail-soft/50',
          )}
        >
          {compact ? (
            <Clamp lines={8} watch={message.content}>
              <Highlighted content={message.content} violations={isTarget ? violations : []} />
            </Clamp>
          ) : (
            <Highlighted content={message.content} violations={isTarget ? violations : []} onSelect={onSelectViolation} activeViolation={activeViolation} />
          )}
        </div>
      </div>
    </motion.div>
  )
})
