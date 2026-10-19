import { AlertTriangle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { violationTurns } from '../../lib/evidence'
import { cn, convLabel, plural } from '../../lib/format'
import { outcomeOf, violationCount } from '../../lib/outcome'
import { CancelledMark, OutcomeBadge, ScoreRing } from '../status'
import { Skeleton, Tooltip } from '../ui/primitives'
import { MessageBubble, TypingBubble } from './Transcript'

const EASE = [0.22, 1, 0.36, 1] as const

/** One hairline segment per allowed turn: filled as turns complete, red where a violation was quoted. */
function TurnTrack({ c, maxTurns, flagged }: { c: LiveConversation; maxTurns: number; flagged: Set<number> }) {
  const done = new Set(c.messages.filter((m) => m.role === 'target').map((m) => m.turn))
  const lastTurn = c.messages.length ? c.messages[c.messages.length - 1].turn : 0
  const live = c.status === 'running' ? Math.max(1, done.has(lastTurn) ? lastTurn + 1 : lastTurn) : null
  return (
    <div className="flex gap-[3px]" aria-label={`${done.size} of ${maxTurns} turns`}>
      {Array.from({ length: maxTurns }, (_, i) => {
        const t = i + 1
        const state = flagged.has(t) ? 'flag' : done.has(t) ? 'done' : t === live ? 'live' : 'todo'
        return (
          <span key={t} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-n-200/70">
            <motion.span
              className={cn('absolute inset-0 rounded-full', state === 'flag' ? 'bg-fail' : state === 'live' ? 'animate-pulse bg-indigo-300' : 'bg-indigo-500')}
              initial={false}
              animate={{ scaleX: state === 'todo' ? 0 : 1 }}
              style={{ originX: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </span>
        )
      })}
    </div>
  )
}

function StatusSlot({ c }: { c: LiveConversation }) {
  if (c.status === 'running')
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 text-[11.5px] font-medium text-indigo-700">
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500 opacity-60" />
          <span className="relative size-1.5 rounded-full bg-indigo-500" />
        </span>
        Live
      </span>
    )
  if (c.status === 'evaluating') return <span className="shimmer-text text-[12px] font-semibold">Grading…</span>
  if (c.status === 'pending') return <span className="text-[11.5px] text-ink-3">Starting…</span>
  if (c.status === 'failed')
    return (
      <Tooltip content={c.error}>
        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-fail">
          <AlertTriangle className="size-3" /> Error
        </span>
      </Tooltip>
    )
  if (c.status === 'cancelled') return <CancelledMark />
  const score = c.evaluation?.score ?? c.summary?.score ?? null
  return (
    <span className="inline-flex items-center gap-2">
      <OutcomeBadge outcome={outcomeOf(c)} size="sm" />
      {score != null && <ScoreRing value={score} size={28} stroke={3} />}
    </span>
  )
}

export const ConversationCard = memo(function ConversationCard({
  c,
  targetName,
  maxTurns,
  onOpen,
}: {
  c: LiveConversation
  targetName: string
  maxTurns: number
  onOpen: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const outcome = outcomeOf(c)
  const violations = useMemo(() => c.evaluation?.policy_violations ?? [], [c.evaluation])
  const nViolations = violationCount(c)
  const flagged = useMemo(() => violationTurns(c.messages, violations), [c.messages, violations])
  const last = c.messages[c.messages.length - 1]
  const typing = c.status === 'running' ? (last?.role === 'attacker' ? 'target' : 'attacker') : null
  const firstFlag = flagged.size ? Math.min(...flagged) : null
  const bad = outcome === 'breached' || outcome === 'violated'

  // follow the conversation unless the reader scrolled up; instant, since a smooth scroll emits
  // scroll events mid-flight that would unstick us
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [c.messages.length, typing])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const title = c.scenario?.title ?? c.summary?.scenario_title

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.5, ease: EASE }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(c.id))}
      className={cn(
        'group flex h-[620px] cursor-pointer flex-col rounded-[20px] border bg-surface text-left shadow-card outline-none transition-[border-color,box-shadow,transform] duration-300 ease-out-soft hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-indigo-300',
        bad ? 'border-fail/25' : c.status === 'running' ? 'border-indigo-200' : 'border-line hover:border-line-2',
      )}
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex h-7 items-center gap-2.5">
          <span className="font-mono text-[11.5px] font-medium text-ink-3 tabular">{convLabel(c.index)}</span>
          <span className="ml-auto">
            <StatusSlot c={c} />
          </span>
        </div>
        {title ? (
          <div className="mt-1 line-clamp-2 min-h-[40px] font-display text-[15px] leading-[1.35] font-semibold tracking-[-0.012em] text-ink">{title}</div>
        ) : (
          <Skeleton className="mt-2 h-4 w-2/3" />
        )}
        <div className="mt-3">
          <TurnTrack c={c} maxTurns={maxTurns} flagged={flagged} />
        </div>
      </div>

      <div className="mx-2.5 min-h-0 flex-1 overflow-hidden rounded-[14px] bg-n-50">
        <div ref={scroller} className={cn('scroll-quiet h-full overflow-y-auto px-3 py-3', c.messages.length > 2 && 'fade-top')}>
          {c.messages.length === 0 && c.status !== 'running' ? (
            <div className="grid h-full place-items-center text-center text-[12px] text-ink-3">
              {c.summary && !c.scenario ? (
                <div className="w-full space-y-2.5">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="ml-auto h-10 w-2/3" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              ) : (
                <span className="max-w-[240px]">{c.status === 'pending' ? 'The simulated user is about to say hello.' : (c.error ?? 'No messages')}</span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {c.messages.map((m, i) => (
                <MessageBubble key={i} message={m} targetName={targetName} violations={violations} compact />
              ))}
              <AnimatePresence>{typing && <TypingBubble key={typing + c.messages.length} side={typing} targetName={targetName} compact />}</AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="flex h-10 items-center px-4 text-[11.5px]">
        {nViolations > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-fail tabular">
            <AlertTriangle className="size-3" />
            {plural(nViolations, 'violation')}
            {firstFlag && <span className="font-normal text-fail/70">· turn {firstFlag}</span>}
          </span>
        )}
        <span className="ml-auto text-ink-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">Open →</span>
      </div>
    </motion.div>
  )
})
