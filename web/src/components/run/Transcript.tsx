import { motion } from 'motion/react'
import { forwardRef, type ReactNode } from 'react'
import { findEvidence } from '../../lib/evidence'
import { agentColor, agentLetter, cn } from '../../lib/format'
import type { TranscriptMessage, Violation } from '../../lib/types'

const EASE = [0.22, 1, 0.36, 1] as const

export function Highlighted({ content, violations }: { content: string; violations: Violation[] }) {
  const hits = violations.length ? findEvidence(content, violations) : []
  if (!hits.length) return <>{content}</>
  const out: ReactNode[] = []
  let cursor = 0
  hits.forEach((h, i) => {
    if (h.start > cursor) out.push(content.slice(cursor, h.start))
    out.push(
      <mark
        key={i}
        title={`${h.v.severity} · ${h.v.rule}`}
        className="rounded-[3px] bg-fail/[0.11] px-0.5 text-ink underline decoration-fail/70 decoration-[1.5px] underline-offset-[3px] [box-decoration-break:clone]"
      >
        {content.slice(h.start, h.end)}
      </mark>,
    )
    cursor = h.end
  })
  if (cursor < content.length) out.push(content.slice(cursor))
  return <>{out}</>
}

/** Who's speaking: the attacker in its agent colour, the target as an ink monogram. */
export function SpeakerMark({ role, agentName, targetName, size = 'sm' }: { role: 'attacker' | 'target'; agentName: string; targetName: string; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-[22px] text-[10px] rounded-[7px]' : 'size-7 text-[11.5px] rounded-lg'
  if (role === 'attacker')
    return (
      <span className={cn('grid shrink-0 place-items-center font-display font-semibold text-white', dims)} style={{ backgroundColor: agentColor(agentName) }} aria-hidden>
        {agentLetter(agentName)}
      </span>
    )
  return (
    <span className={cn('grid shrink-0 place-items-center border border-line bg-surface font-display font-semibold text-ink-2', dims)} aria-hidden>
      {targetName.trim().charAt(0).toUpperCase() || 'T'}
    </span>
  )
}

const bubbleTone = {
  attacker: 'bg-surface border border-line text-ink-2 rounded-tl-[6px] shadow-[0_1px_0_rgb(22_22_29/0.03)]',
  target: 'bg-indigo-50 border border-indigo-100 text-ink rounded-tr-[6px]',
}

export function TypingBubble({ side, agentName, targetName, compact }: { side: 'attacker' | 'target'; agentName: string; targetName: string; compact?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.25, ease: EASE }}
      className={cn('flex items-start gap-2', side === 'target' && 'flex-row-reverse')}
    >
      <SpeakerMark role={side} agentName={agentName} targetName={targetName} size={compact ? 'sm' : 'md'} />
      <div className={cn('flex items-center gap-1 rounded-2xl px-3 py-2.5', bubbleTone[side])}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-blink rounded-full" style={{ animationDelay: `${i * 0.16}s`, backgroundColor: side === 'attacker' ? agentColor(agentName) : 'var(--color-indigo-500)' }} />
        ))}
      </div>
    </motion.div>
  )
}

export const MessageBubble = forwardRef<
  HTMLDivElement,
  { message: TranscriptMessage; agentName: string; targetName: string; violations: Violation[]; compact?: boolean; showMeta?: boolean }
>(function MessageBubble({ message, agentName, targetName, violations, compact, showMeta = true }, ref) {
  const isTarget = message.role === 'target'
  const flagged = isTarget && violations.length > 0 && findEvidence(message.content, violations).length > 0
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ originX: isTarget ? 1 : 0 }}
      className={cn('flex items-start gap-2', isTarget && 'flex-row-reverse')}
    >
      <SpeakerMark role={message.role} agentName={agentName} targetName={targetName} size={compact ? 'sm' : 'md'} />
      <div className={cn('flex min-w-0 flex-col gap-1', isTarget ? 'items-end' : 'items-start', compact ? 'max-w-[84%]' : 'max-w-[80%]')}>
        {showMeta && !compact && (
          <span className="flex items-center gap-1.5 px-0.5 text-[11px] text-ink-3">
            <span className="font-medium text-ink-2">{isTarget ? targetName : agentName}</span>
            <span className="font-mono text-[10px]">turn {message.turn}</span>
          </span>
        )}
        <div
          className={cn(
            'relative rounded-2xl leading-relaxed break-words whitespace-pre-wrap',
            compact ? 'px-3 py-2 text-[12.5px]' : 'px-3.5 py-2.5 text-[13.5px]',
            bubbleTone[message.role],
            flagged && 'border-fail/30 bg-fail-soft/50',
            compact && 'line-clamp-[7]',
          )}
        >
          <Highlighted content={message.content} violations={isTarget ? violations : []} />
        </div>
      </div>
    </motion.div>
  )
})
