import { ArrowDown, ArrowUp, CircleCheck, CircleX, Lightbulb, Quote, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { cn, END_REASON_LABEL, humanize } from '../../lib/format'
import type { Violation } from '../../lib/types'
import { AgentAvatar, ScoreRing, SeverityBadge, VerdictBadge } from '../status'
import { Button } from '../ui/button'
import { Sheet } from '../ui/overlay'
import { Chip, Eyebrow, Kbd, Skeleton } from '../ui/primitives'
import { Tabs } from '../ui/tabs'
import { findEvidence } from '../../lib/evidence'
import { MessageBubble, TypingBubble } from './Transcript'

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

export function ConversationSheet({
  conversation: c,
  targetName,
  maxTurns,
  onClose,
  onStep,
  position,
}: {
  conversation: LiveConversation | null
  targetName: string
  maxTurns: number
  onClose: () => void
  onStep: (dir: 1 | -1) => void
  position: { index: number; total: number }
}) {
  const [tab, setTab] = useState<'report' | 'scenario'>('report')
  const scroller = useRef<HTMLDivElement>(null)
  const msgRefs = useRef<(HTMLDivElement | null)[]>([])
  const [flash, setFlash] = useState<number | null>(null)

  const evaluation = c?.evaluation ?? null
  const violations = useMemo(() => evaluation?.policy_violations ?? [], [evaluation])
  const last = c?.messages[c.messages.length - 1]
  const typing = c?.status === 'running' ? (last?.role === 'attacker' ? 'target' : 'attacker') : null

  useEffect(() => {
    if (c && !c.evaluation && c.status !== 'evaluating') setTab('scenario')
    else setTab('report')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && c?.status === 'running') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [c?.messages.length, c?.status])

  useEffect(() => {
    if (!c) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return
      if (e.key === 'ArrowDown' || e.key === 'j') onStep(1)
      if (e.key === 'ArrowUp' || e.key === 'k') onStep(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [c, onStep])

  function jumpToEvidence(v: Violation) {
    if (!c) return
    const idx = c.messages.findIndex((m) => m.role === 'target' && findEvidence(m.content, [v]).length > 0)
    if (idx < 0) return
    msgRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(idx)
    window.setTimeout(() => setFlash(null), 1400)
  }

  const s = c?.scenario

  return (
    <Sheet
      open={!!c}
      onOpenChange={(o) => !o && onClose()}
      title={c ? `${c.agent_name}: ${s?.title ?? 'conversation'}` : 'Conversation'}
      header={
        c && (
          <div className="flex items-center gap-4">
            <AgentAvatar name={c.agent_name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <span className="font-display font-semibold text-ink-2">{c.agent_name}</span>
                <span>→</span>
                <span>{targetName}</span>
                <span className="font-mono">· #{c.index + 1}</span>
              </div>
              <div className="mt-0.5 truncate font-display text-[17px] font-semibold tracking-[-0.01em]">{s?.title ?? c.summary?.scenario_title ?? '…'}</div>
            </div>
            {evaluation && (
              <div className="flex items-center gap-3">
                <VerdictBadge verdict={evaluation.verdict} broken={evaluation.broken} />
                <ScoreRing value={evaluation.score} size={44} />
              </div>
            )}
            <div className="flex items-center gap-1 border-l border-line pl-3">
              <Button size="icon" variant="ghost" aria-label="Previous conversation" onClick={() => onStep(-1)}>
                <ArrowUp className="size-4" />
              </Button>
              <span className="font-mono text-[11px] text-ink-3 tabular">
                {position.index + 1}/{position.total}
              </span>
              <Button size="icon" variant="ghost" aria-label="Next conversation" onClick={() => onStep(1)}>
                <ArrowDown className="size-4" />
              </Button>
            </div>
          </div>
        )
      }
    >
      {c && (
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
                    className={cn('rounded-2xl transition-[background-color,box-shadow] duration-500', flash === i && 'bg-fail-soft/70 shadow-[0_0_0_8px_var(--color-fail-soft)]')}
                  >
                    <MessageBubble message={m} agentName={c.agent_name} targetName={targetName} violations={violations} showMeta={i === 0 || c.messages[i - 1].role !== m.role} />
                  </div>
                ))}
                <AnimatePresence>{typing && <TypingBubble key={typing + c.messages.length} side={typing} agentName={c.agent_name} targetName={targetName} />}</AnimatePresence>
                {c.status === 'evaluating' && <div className="mt-2 text-center text-[12px] shimmer-text font-medium">{c.agent_name} is grading this conversation against your policy…</div>}
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

          {/* report / scenario */}
          <div className="flex min-h-0 flex-col bg-ground">
            <Tabs
              id="sheet"
              value={tab}
              onChange={setTab}
              className="px-4"
              items={[
                { value: 'report', label: 'Report', count: violations.length || undefined },
                { value: 'scenario', label: 'Scenario' },
              ]}
            />
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {tab === 'report' ? (
                evaluation ? (
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
                      <Section title={`Policy violations · ${violations.length}`} icon={<CircleX className="size-3.5" />}>
                        <div className="flex flex-col gap-2.5">
                          {violations.map((v, i) => (
                            <button key={i} onClick={() => jumpToEvidence(v)} className="group rounded-xl border border-line bg-surface p-3.5 text-left shadow-card transition-colors hover:border-fail/30">
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-display text-[13px] font-semibold text-ink">{v.rule}</span>
                                <SeverityBadge severity={v.severity} />
                              </div>
                              <div className="mt-2 flex gap-2 border-l-2 border-fail/40 pl-3 text-[12.5px] leading-relaxed text-ink-2 italic">
                                <Quote className="mt-0.5 size-3 shrink-0 text-ink-3 not-italic" />
                                {v.evidence}
                              </div>
                              <div className="mt-2 text-[11.5px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">Show in transcript →</div>
                            </button>
                          ))}
                        </div>
                      </Section>
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
                    <Section title="Recommendations" icon={<Lightbulb className="size-3.5" />}>
                      <Bullets items={evaluation.recommendations} tone="indigo" />
                    </Section>
                  </div>
                ) : (
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
              ) : s ? (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip>{humanize(s.category)}</Chip>
                    <Chip tone="outline">{s.difficulty}</Chip>
                    <Chip tone="outline">{s.emotional_state}</Chip>
                    <Chip tone="outline">{s.source === 'simula' ? 'Simula' : 'Manual'}</Chip>
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
              )}
            </div>
            <div className="flex items-center gap-1.5 border-t border-line px-6 py-2 text-[11px] text-ink-3">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to switch conversations · <Kbd>Esc</Kbd> to close
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
