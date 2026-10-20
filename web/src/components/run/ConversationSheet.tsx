import { CircleCheck, CircleX, Lightbulb, MousePointerClick, Quote, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { evidenceMessageIndex } from '../../lib/evidence'
import { cn, convLabel, END_REASON_LABEL, humanize } from '../../lib/format'
import { outcomeOf } from '../../lib/outcome'
import { OutcomeBadge, ScoreRing, SeverityBadge } from '../status'
import { Sheet } from '../ui/overlay'
import { Chip, Eyebrow, Skeleton } from '../ui/primitives'
import { Tabs } from '../ui/tabs'
import { MessageBubble, TypingBubble } from './Transcript'

type Tab = 'report' | 'violations' | 'scenario'

function Section({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center gap-1.5 text-ink-3">
        {icon}
        <Eyebrow>{title}</Eyebrow>
      </div>
      {children}
    </section>
  )
}

function Bullets({ items, tone }: { items: string[]; tone: 'pass' | 'fail' | 'indigo' }) {
  if (!items.length) return <p className="text-[13px] text-ink-3">None noted.</p>
  const dot = { pass: 'bg-pass', fail: 'bg-fail', indigo: 'bg-indigo-500' }[tone]
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <span className={cn('mt-[8px] size-1.5 shrink-0 rounded-full', dot)} />
          {t}
        </li>
      ))}
    </ul>
  )
}

function DimensionBars({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1])
  if (!entries.length) return null
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[130px_1fr_28px] items-center gap-3">
          <span className="truncate text-[12.5px] text-ink-2">{humanize(k)}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-n-100">
            <div className={cn('h-full rounded-full transition-[width] duration-700', v < 5 ? 'bg-fail' : v < 7.5 ? 'bg-warn' : 'bg-pass')} style={{ width: `${(v / 10) * 100}%` }} />
          </div>
          <span className="text-right font-display text-[12.5px] font-semibold tabular">{v.toFixed(v % 1 ? 1 : 0)}</span>
        </div>
      ))}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <div className="text-[13.5px] leading-relaxed text-ink">{children}</div>
    </div>
  )
}

/** Body of the sheet for one conversation. Keyed by conversation id, so its state resets per chat. */
function SheetBody({ c, targetName, maxTurns }: { c: LiveConversation; targetName: string; maxTurns: number }) {
  const evaluation = c.evaluation
  const violations = useMemo(() => evaluation?.policy_violations ?? [], [evaluation])
  const [tab, setTab] = useState<Tab>(evaluation ? (violations.length ? 'violations' : 'report') : c.status === 'evaluating' ? 'report' : 'scenario')
  const [active, setActive] = useState<number | null>(null)
  const [flashMsg, setFlashMsg] = useState<number | null>(null)
  const [unplaced, setUnplaced] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const msgRefs = useRef<(HTMLDivElement | null)[]>([])
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const last = c.messages[c.messages.length - 1]
  const typing = c.status === 'running' ? (last?.role === 'attacker' ? 'target' : 'attacker') : null

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && c.status === 'running') el.scrollTop = el.scrollHeight
  }, [c.messages.length, c.status])

  /** Violation card → transcript: scroll the quoting message into the middle of the pane and flash it. */
  function showInTranscript(i: number) {
    setActive(i)
    const idx = evidenceMessageIndex(c.messages, violations, i)
    if (idx < 0) {
      setUnplaced(i)
      return
    }
    setUnplaced(null)
    const el = msgRefs.current[idx]
    const pane = scroller.current
    if (el && pane) {
      const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop
      pane.scrollTo({ top: Math.max(0, top - pane.clientHeight / 2 + el.clientHeight / 2), behavior: 'smooth' })
    }
    setFlashMsg(idx)
    window.setTimeout(() => setFlashMsg((f) => (f === idx ? null : f)), 1600)
  }

  /** Highlighted quote → violations tab, with that card brought into view. */
  function openViolation(i: number) {
    setActive(i)
    setTab('violations')
    window.requestAnimationFrame(() => window.setTimeout(() => cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60))
  }

  const s = c.scenario

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[1.15fr_1fr]">
      {/* transcript */}
      <div ref={scroller} className="scrollbar-thin min-h-0 overflow-y-auto border-r border-line bg-surface px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <Eyebrow>Transcript</Eyebrow>
          <span className="text-[11.5px] text-ink-3">
            {c.messages.length} messages · up to {maxTurns} turns
          </span>
        </div>
        {c.messages.length === 0 ? (
          c.summary && !c.scenario ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="ml-auto h-14 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-ink-3">{c.status === 'pending' ? 'Not started yet.' : (c.error ?? 'No messages.')}</p>
          )
        ) : (
          <div className="flex flex-col gap-3.5">
            {c.messages.map((m, i) => (
              <div
                key={i}
                ref={(el) => {
                  msgRefs.current[i] = el
                }}
                className={cn('rounded-2xl transition-[background-color,box-shadow] duration-500', flashMsg === i && 'bg-fail-soft/70 shadow-[0_0_0_8px_var(--color-fail-soft)]')}
              >
                <MessageBubble
                  message={m}
                  targetName={targetName}
                  violations={violations}
                  showMeta={i === 0 || c.messages[i - 1].role !== m.role}
                  onSelectViolation={openViolation}
                  activeViolation={active}
                />
              </div>
            ))}
            <AnimatePresence>{typing && <TypingBubble key={typing + c.messages.length} side={typing} targetName={targetName} />}</AnimatePresence>
            {c.status === 'evaluating' && <div className="mt-2 text-center text-[12px] shimmer-text font-medium">Grading this conversation against your policy…</div>}
            {c.end_reason && (
              <div className="mt-2 flex items-center gap-3 text-[11.5px] text-ink-3">
                <span className="h-px flex-1 bg-line" />
                {END_REASON_LABEL[c.end_reason] ?? c.end_reason}
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
          </div>
        )}
        {c.error && c.messages.length > 0 && <p className="mt-4 rounded-lg bg-fail-soft px-3 py-2 text-[12.5px] text-fail">{c.error}</p>}
      </div>

      {/* report / violations / scenario */}
      <div className="flex min-h-0 flex-col bg-ground">
        <Tabs
          id="sheet"
          value={tab}
          onChange={setTab}
          className="px-4"
          items={[
            { value: 'report', label: 'Report' },
            { value: 'violations', label: 'Policy violations', count: evaluation ? violations.length : undefined },
            { value: 'scenario', label: 'Scenario' },
          ]}
        />
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'report' &&
            (evaluation ? (
              <div className="flex flex-col gap-7">
                {evaluation.broken && (
                  <div className="flex gap-3 rounded-xl border border-fail/25 bg-fail-soft px-4 py-3">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-fail" />
                    <div className="text-[13px] leading-relaxed text-ink">
                      <span className="font-semibold text-fail">Instruction breach.</span> Under pressure, the agent set aside its system prompt or guardrails.
                    </div>
                  </div>
                )}
                <p className="font-serif text-[16.5px] leading-[1.55] text-ink">{evaluation.summary}</p>
                {violations.length > 0 && (
                  <button
                    onClick={() => setTab('violations')}
                    className="flex items-center gap-2 rounded-xl border border-fail/20 bg-fail-soft/50 px-4 py-3 text-left text-[13px] text-ink-2 transition-colors hover:border-fail/40"
                  >
                    <CircleX className="size-4 shrink-0 text-fail" />
                    <span>
                      <span className="font-semibold text-fail">{violations.length}</span> policy violation{violations.length === 1 ? '' : 's'}, so this conversation did not hold.
                    </span>
                    <span className="ml-auto text-[12px] font-medium text-ink">See them →</span>
                  </button>
                )}
                <Section title="Dimensions">
                  <DimensionBars scores={evaluation.dimension_scores} />
                  {evaluation.escalation_appropriate != null && (
                    <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-2">
                      {evaluation.escalation_appropriate ? <CircleCheck className="size-3.5 text-pass" /> : <CircleX className="size-3.5 text-fail" />}
                      Escalation {evaluation.escalation_appropriate ? 'handled appropriately' : 'not handled appropriately'}
                    </div>
                  )}
                </Section>
                <Section title="Weaknesses" icon={<TrendingDown className="size-3.5" />}>
                  <Bullets items={evaluation.weaknesses} tone="fail" />
                </Section>
                <Section title="Strengths" icon={<TrendingUp className="size-3.5" />}>
                  <Bullets items={evaluation.strengths} tone="pass" />
                </Section>
                <Section title="Recommended prompt changes" icon={<Lightbulb className="size-3.5" />}>
                  <Bullets items={evaluation.recommendations} tone="indigo" />
                </Section>
              </div>
            ) : (
              <Pending c={c} />
            ))}

          {tab === 'violations' &&
            (evaluation ? (
              violations.length ? (
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                    <MousePointerClick className="size-3.5" /> Click a violation to find it in the transcript.
                  </p>
                  {violations.map((v, i) => (
                    <motion.button
                      key={i}
                      ref={(el) => {
                        cardRefs.current[i] = el
                      }}
                      layout
                      onClick={() => showInTranscript(i)}
                      className={cn(
                        'group flex w-full flex-col gap-3 rounded-xl border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] duration-300',
                        active === i ? 'border-fail/50 shadow-[0_0_0_3px_var(--color-fail-soft)]' : 'border-line hover:border-fail/30',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Eyebrow className="mb-1">What went wrong</Eyebrow>
                          {v.explanation ? (
                            <p className="font-display text-[14px] leading-snug font-semibold text-ink">{v.explanation}</p>
                          ) : (
                            <p className="text-[12.5px] leading-snug text-ink-3">
                              No description recorded. This conversation was graded before violation descriptions were added; re-run it to get one.
                            </p>
                          )}
                        </div>
                        <SeverityBadge severity={v.severity} />
                      </div>
                      <div>
                        <Eyebrow className="mb-1">Policy violated</Eyebrow>
                        <p className="text-[12.5px] leading-relaxed text-ink-2">{v.rule}</p>
                      </div>
                      <div>
                        <Eyebrow className="mb-1">Where it happened</Eyebrow>
                        <div className="flex gap-2 border-l-2 border-fail/40 pl-3 text-[12.5px] leading-relaxed text-ink-2 italic">
                          <Quote className="mt-0.5 size-3 shrink-0 text-ink-3 not-italic" />
                          {v.evidence}
                        </div>
                      </div>
                      <div className="text-[11.5px] font-medium text-ink-3 transition-colors group-hover:text-ink">
                        {unplaced === i ? 'This quote isn’t word for word in the transcript, so it can’t be pinpointed.' : 'Show in transcript →'}
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <span className="grid size-10 place-items-center rounded-full bg-pass-soft text-pass">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div className="font-display text-[14px] font-semibold">No violations</div>
                  <p className="max-w-[280px] text-[12.5px] text-ink-3">The agent held its policy for this whole conversation.</p>
                </div>
              )
            ) : (
              <Pending c={c} />
            ))}

          {tab === 'scenario' &&
            (s ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap gap-1.5">
                  <Chip>{humanize(s.category)}</Chip>
                  <Chip tone="outline">{s.difficulty}</Chip>
                  <Chip tone="outline">{s.emotional_state}</Chip>
                </div>
                <Fact label="Persona">{s.persona}</Fact>
                <Fact label="Context">{s.context}</Fact>
                <Fact label="Goal">{s.goal}</Fact>
                {s.tactics.length > 0 && (
                  <Fact label="Tactics">
                    <ul className="mt-0.5 flex flex-col gap-1.5">
                      {s.tactics.map((t, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="font-mono text-[11px] text-ink-3 tabular">{String(i + 1).padStart(2, '0')}</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Fact>
                )}
                <div className="grid gap-3 rounded-xl border border-line bg-surface p-4">
                  <Fact label="Rule under test">{s.policy_focus}</Fact>
                  <Fact label="What a correct agent does">{s.expected_behavior}</Fact>
                </div>
                {s.taxonomy_mix.length > 0 && (
                  <Fact label="Simula taxonomy mix">
                    <div className="mt-1 flex flex-col gap-1.5">
                      {s.taxonomy_mix.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12.5px]">
                          <span className="w-[140px] shrink-0 truncate text-ink-3">{humanize(m.factor)}</span>
                          <span className="font-medium text-ink">{humanize(m.node)}</span>
                        </div>
                      ))}
                    </div>
                  </Fact>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function Pending({ c }: { c: LiveConversation }) {
  return (
    <div className="py-16 text-center text-[13px] text-ink-3">
      {c.status === 'evaluating' ? (
        <span className="shimmer-text font-medium">Grading…</span>
      ) : c.status === 'failed' ? (
        (c.error ?? 'This conversation failed before it could be graded.')
      ) : c.status === 'cancelled' ? (
        'Cancelled before grading.'
      ) : (
        'The report appears when the conversation ends.'
      )}
    </div>
  )
}

export function ConversationSheet({
  conversation: c,
  targetName,
  maxTurns,
  onClose,
}: {
  conversation: LiveConversation | null
  targetName: string
  maxTurns: number
  onClose: () => void
}) {
  const evaluation = c?.evaluation ?? null
  return (
    <Sheet
      open={!!c}
      onOpenChange={(o) => !o && onClose()}
      title={c ? `${convLabel(c.index)}: ${c.scenario?.title ?? 'conversation'}` : 'Conversation'}
      header={
        c && (
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <span className="font-mono font-medium text-ink-2">{convLabel(c.index)}</span>
                <span>·</span>
                <span>{targetName}</span>
              </div>
              <div className="mt-0.5 truncate font-display text-[17px] font-semibold tracking-[-0.01em]">{c.scenario?.title ?? c.summary?.scenario_title ?? '…'}</div>
            </div>
            {evaluation && (
              <div className="flex items-center gap-3 pr-8">
                <OutcomeBadge outcome={outcomeOf(c)} />
                <ScoreRing value={evaluation.score} size={44} />
              </div>
            )}
          </div>
        )
      }
    >
      {c && <SheetBody key={c.id} c={c} targetName={targetName} maxTurns={maxTurns} />}
    </Sheet>
  )
}
