import { AlertTriangle, ArrowUpRight, Clock, MessageSquare } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { useSpotlight } from '../../hooks/useSpotlight'
import { violationTurns } from '../../lib/evidence'
import { cn, END_REASON_LABEL, humanize } from '../../lib/format'
import type { Difficulty } from '../../lib/types'
import { AgentAvatar, CancelledMark, ScoreRing, VerdictBadge } from '../status'
import { Skeleton, Tooltip } from '../ui/primitives'
import { MessageBubble, TypingBubble } from './Transcript'

const EASE = [0.22, 1, 0.36, 1] as const

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function DifficultyMeter({ value }: { value: Difficulty }) {
  const n = value === 'easy' ? 1 : value === 'medium' ? 2 : 3
  return (
    <Tooltip content={`${humanize(value)} scenario`}>
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <span className="flex items-end gap-[2px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('w-[3px] rounded-[1px]', i < n ? 'bg-ink-2' : 'bg-n-200')} style={{ height: 5 + i * 2.5 }} />
          ))}
        </span>
        {value}
      </span>
    </Tooltip>
  )
}

/** One segment per allowed turn: filled as turns complete, red where a violation was quoted, pulsing on the live turn. */
function TurnTrack({ c, maxTurns, flagged }: { c: LiveConversation; maxTurns: number; flagged: Set<number> }) {
  const done = new Set(c.messages.filter((m) => m.role === 'target').map((m) => m.turn))
  const lastTurn = c.messages.length ? c.messages[c.messages.length - 1].turn : 0
  const live = c.status === 'running' ? Math.max(1, done.has(lastTurn) ? lastTurn + 1 : lastTurn) : null
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex flex-1 gap-[3px]">
        {Array.from({ length: maxTurns }, (_, i) => {
          const t = i + 1
          const state = flagged.has(t) ? 'flag' : done.has(t) ? 'done' : t === live ? 'live' : 'todo'
          return (
            <Tooltip key={t} content={`Turn ${t}${state === 'flag' ? ': violation' : state === 'live' ? ': in progress' : state === 'todo' ? '' : ''}`}>
              <span className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-n-200/80">
                <motion.span
                  className={cn('absolute inset-0 rounded-full', state === 'flag' ? 'bg-fail' : state === 'live' ? 'animate-pulse bg-indigo-300' : 'bg-indigo-500')}
                  initial={false}
                  animate={{ scaleX: state === 'todo' ? 0 : 1 }}
                  style={{ originX: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </span>
            </Tooltip>
          )
        })}
      </div>
      <span className="w-8 text-right font-mono text-[10.5px] text-ink-3 tabular">
        {done.size}/{maxTurns}
      </span>
    </div>
  )
}

function StatusSlot({ c, queuePos }: { c: LiveConversation; queuePos?: number }) {
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
  if (c.status === 'pending')
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
        <Clock className="size-3" /> Queued{queuePos ? ` · #${queuePos}` : ''}
      </span>
    )
  if (c.status === 'failed')
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-fail">
        <AlertTriangle className="size-3" /> Error
      </span>
    )
  if (c.status === 'cancelled') return <CancelledMark />
  const e = c.evaluation
  const score = e?.score ?? c.summary?.score ?? null
  return (
    <span className="inline-flex items-center gap-2">
      <VerdictBadge verdict={e?.verdict ?? c.summary?.verdict ?? null} broken={e?.broken ?? c.summary?.broken} size="sm" />
      {score != null && <ScoreRing value={score} size={30} stroke={3} />}
    </span>
  )
}

export const ConversationCard = memo(function ConversationCard({
  c,
  targetName,
  maxTurns,
  onOpen,
  queuePos,
  concurrency,
}: {
  c: LiveConversation
  targetName: string
  maxTurns: number
  onOpen: (id: string) => void
  /** 1-based place in line while pending. */
  queuePos?: number
  concurrency?: number
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const spot = useSpotlight()
  const broken = c.evaluation?.broken ?? c.summary?.broken ?? false
  const violations = useMemo(() => c.evaluation?.policy_violations ?? [], [c.evaluation])
  const violationCount = c.evaluation ? violations.length : (c.summary?.violation_count ?? 0)
  const flagged = useMemo(() => violationTurns(c.messages, violations), [c.messages, violations])
  const last = c.messages[c.messages.length - 1]
  const typing = c.status === 'running' ? (last?.role === 'attacker' ? 'target' : 'attacker') : null
  const firstFlag = flagged.size ? Math.min(...flagged) : null

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

  const s = c.scenario
  const title = s?.title ?? c.summary?.scenario_title
  const category = s?.category ?? c.summary?.scenario_category
  const difficulty = s?.difficulty ?? c.summary?.difficulty

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.5, ease: EASE }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c.id)}
      onPointerMove={spot}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(c.id))}
      style={broken ? ({ '--spot': '210 58 67' } as React.CSSProperties) : undefined}
      className={cn(
        'spotlight group flex h-[456px] cursor-pointer flex-col rounded-[20px] border bg-surface text-left shadow-card outline-none transition-[border-color,box-shadow,transform] duration-300 ease-out-soft hover:shadow-lift focus-visible:ring-2 focus-visible:ring-indigo-300',
        broken ? 'border-fail/25' : c.status === 'running' ? 'border-indigo-200' : 'border-line hover:border-line-2',
      )}
    >
      {/* header */}
      <div className={cn('rounded-t-[20px] px-4 pt-3.5 pb-3 transition-colors duration-500', broken && 'bg-[linear-gradient(to_bottom,rgb(253_235_236/0.75),transparent)]')}>
        <div className="flex h-[30px] items-center gap-2">
          <AgentAvatar name={c.agent_name} size="sm" />
          <span className="font-display text-[12.5px] font-semibold text-ink-2">{c.agent_name}</span>
          <span className="font-mono text-[10.5px] text-ink-3">#{String(c.index + 1).padStart(2, '0')}</span>
          <span className="ml-auto">
            <StatusSlot c={c} queuePos={queuePos} />
          </span>
        </div>
        {title ? (
          <div className="mt-2 line-clamp-1 font-display text-[15px] font-semibold tracking-[-0.012em] text-ink">{title}</div>
        ) : (
          <Skeleton className="mt-2 h-4 w-2/3" />
        )}
        <div className="mt-0.5 line-clamp-1 h-[18px] text-[12px] text-ink-3">{s ? s.persona : ''}</div>
        <div className="mt-2.5 flex items-center gap-3">
          {category && <span className="truncate rounded-md bg-n-100 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2">{humanize(category)}</span>}
          {difficulty && <DifficultyMeter value={difficulty} />}
          {s?.emotional_state && <span className="truncate text-[11.5px] text-ink-3">· {s.emotional_state}</span>}
        </div>
        <div className="mt-3">
          <TurnTrack c={c} maxTurns={maxTurns} flagged={flagged} />
        </div>
      </div>

      {/* transcript */}
      <div className="mx-2.5 min-h-0 flex-1 overflow-hidden rounded-[14px] border border-line/70 bg-n-50">
        <div ref={scroller} className={cn('scroll-quiet h-full overflow-y-auto px-3 py-3', c.messages.length > 2 && 'fade-top')}>
          {c.messages.length === 0 && c.status !== 'running' ? (
            <div className="grid h-full place-items-center text-center text-[12px] text-ink-3">
              {c.status === 'pending' ? (
                <span className="flex max-w-[240px] flex-col items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-full border border-line bg-surface font-display text-[13px] font-semibold text-ink-2 tabular">
                    {queuePos ? `#${queuePos}` : <Clock className="size-4 text-ink-3" />}
                  </span>
                  <span className="font-display text-[13px] font-medium text-ink-2">In line{queuePos ? `, ${ordinal(queuePos)} up` : ''}</span>
                  <span className="leading-relaxed">
                    {concurrency === 1 ? 'Conversations run one at a time. ' : concurrency ? `${concurrency} conversations run at once. ` : ''}This one starts as soon as a running
                    conversation finishes.
                  </span>
                </span>
              ) : c.summary && !c.scenario ? (
                <div className="w-full space-y-2.5">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="ml-auto h-10 w-2/3" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              ) : (
                <span>{c.error ?? 'No messages'}</span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {c.messages.map((m, i) => (
                <MessageBubble key={i} message={m} agentName={c.agent_name} targetName={targetName} violations={violations} compact />
              ))}
              <AnimatePresence>{typing && <TypingBubble key={typing + c.messages.length} side={typing} agentName={c.agent_name} targetName={targetName} compact />}</AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="flex h-11 items-center gap-3 px-4 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1 tabular">
          <MessageSquare className="size-3" />
          {c.messages.length || c.summary?.message_count || 0}
        </span>
        {violationCount > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-fail tabular">
            <AlertTriangle className="size-3" />
            {violationCount} violation{violationCount === 1 ? '' : 's'}
            {firstFlag && <span className="font-normal text-fail/70">· turn {firstFlag}</span>}
          </span>
        )}
        <span className="relative ml-auto h-4 min-w-0 flex-1 text-right">
          <span className="absolute inset-0 truncate transition-[opacity,transform] duration-300 ease-out-soft group-hover:-translate-y-1 group-hover:opacity-0">
            {c.end_reason ? (END_REASON_LABEL[c.end_reason] ?? c.end_reason) : ''}
          </span>
          <span className="absolute inset-0 inline-flex translate-y-1 items-center justify-end gap-0.5 font-medium text-ink opacity-0 transition-[opacity,transform] duration-300 ease-out-soft group-hover:translate-y-0 group-hover:opacity-100">
            Open <ArrowUpRight className="size-3.5" />
          </span>
        </span>
      </div>
    </motion.div>
  )
})
