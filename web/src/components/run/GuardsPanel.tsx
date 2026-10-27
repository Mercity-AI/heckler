import { ArrowRight, ChevronDown, ShieldCheck, ShieldX } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { cn, convLabel, shortModel } from '../../lib/format'
import { outcomeOf } from '../../lib/outcome'
import type { GuardInfo, GuardStats } from '../../lib/types'
import { Button } from '../ui/button'
import { Card, EmptyState, Eyebrow, Tooltip } from '../ui/primitives'
import { GuardReport, Headlines, Matrix } from './GuardReport'
import { policyRules, reasonOf } from '../../lib/guards'
import { Panel } from './Insights'

/** One guard on one graded conversation, against the evaluator's grade. */
type Call = 'caught' | 'missed' | 'false_alarm' | 'clear' | 'pending'

const CALL: Record<Call, { label: string; cell: string; text: string }> = {
  caught: { label: 'Caught', cell: 'bg-pass text-white', text: 'Blocked a reply in a chat the evaluator failed' },
  missed: { label: 'Missed', cell: 'bg-fail text-white', text: 'Let every reply through, but the evaluator found a violation' },
  false_alarm: { label: 'False alarm', cell: 'bg-warn text-white', text: 'Blocked a reply in a chat the evaluator passed' },
  clear: { label: 'Clear', cell: 'bg-n-100 text-ink-3', text: 'Allowed every reply in a chat the evaluator passed' },
  pending: { label: 'Waiting', cell: 'bg-n-50 text-ink-3 border border-dashed border-line-2', text: 'Not graded yet' },
}

/** The first reply this guard blocked in a conversation, with the rule it blocked on. */
function firstBlock(c: LiveConversation, g: GuardInfo, rules: string[]): string | null {
  const d = c.guard_decisions.filter((x) => x.guard_id === g.id && x.flagged).sort((a, b) => a.turn - b.turn)[0]
  if (!d) return null
  const r = reasonOf(d, rules, g.threshold)
  return `First blocked turn ${d.turn}${r ? ` · ${r.label} (${r.probability.toFixed(2)})${r.text ? `: “${r.text}”` : ''}` : ''}`
}

function callOf(c: LiveConversation, guardId: string): Call {
  const outcome = outcomeOf(c)
  const mine = c.guard_decisions.filter((d) => d.guard_id === guardId)
  if (!outcome || !mine.length) return 'pending'
  const flagged = mine.some((d) => d.flagged)
  if (outcome === 'held') return flagged ? 'false_alarm' : 'clear'
  return flagged ? 'caught' : 'missed'
}

const usd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`

function GuardCard({ s, best, threshold, onReport }: { s: GuardStats; best: boolean; threshold: number; onReport: () => void }) {
  const violating = s.tp + s.fn
  const clean = s.fp + s.tn
  const graded = violating + clean
  const thin = graded > 0 && (violating < 5 || clean < 5)
  return (
    <Card hover="glow" className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[15px] font-semibold tracking-[-0.01em]">{s.name}</span>
            {best && <span className="rounded-full bg-pass-soft px-2 py-0.5 text-[10.5px] font-medium text-pass">Best AUC</span>}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3">
            {shortModel(s.model)} · blocks at ≥ {threshold}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11.5px] leading-snug text-ink-3 tabular">
          {s.mean_latency_ms != null && <div>{Math.round(s.mean_latency_ms)} ms avg</div>}
          {s.cost != null && <div>{usd(s.cost)}</div>}
        </div>
      </div>

      <Headlines s={s} />

      {thin && (
        <p className="rounded-lg bg-n-50 px-3 py-2 text-[11.5px] leading-snug text-ink-3">
          Only {violating} chat{violating === 1 ? '' : 's'} with a violation and {clean} without in this run, so one chat moves these numbers a lot. Run more conversations for a steadier read.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Eyebrow>Against the evaluator · {graded} graded chats</Eyebrow>
        <Matrix s={s} />
      </div>

      <Button variant="secondary" size="sm" className="group w-full justify-center" onClick={onReport}>
        Open full report <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Button>
    </Card>
  )
}

/** The run's guard models, scored against the evaluator: which would have stopped the violations it found. */
export function GuardsPanel({
  guards,
  stats,
  policy,
  conversations,
  onOpen,
}: {
  guards: GuardInfo[]
  stats: Record<string, GuardStats> | undefined
  policy: string | null
  conversations: LiveConversation[]
  onOpen: (id: string) => void
}) {
  const [showPolicy, setShowPolicy] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const rules = useMemo(() => policyRules(policy), [policy])
  const rows = useMemo(() => guards.map((g) => stats?.[g.id]).filter((s): s is GuardStats => !!s), [guards, stats])
  // AUC ranks models independently of each one's threshold; fall back to F1 while it can't be computed
  const rank = (s: GuardStats) => s.auc ?? s.f1 ?? -1
  const top = Math.max(...rows.map(rank))

  if (!guards.length) return <Card><EmptyState title="No guard models in this run" /></Card>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <p>
          Every decision model scored every reply your agent sent against each rule of the policy, without blocking anything, so each conversation played out the same for all of them. Each one is scored against the evaluator’s grade of the same conversation.
        </p>
        {policy && (
          <>
            <button type="button" onClick={() => setShowPolicy((v) => !v)} className="inline-flex w-fit items-center gap-1 font-medium text-ink-3 hover:text-ink">
              <ChevronDown className={cn('size-3.5 transition-transform', showPolicy && 'rotate-180')} /> The policy the guards enforced
            </button>
            <AnimatePresence initial={false}>
              {showPolicy && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-lg bg-n-50 px-3 py-2.5 font-mono text-[11.5px] whitespace-pre-wrap text-ink-2"
                >
                  {policy}
                </motion.pre>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-4">
        {rows.map((s) => (
          <GuardCard
            key={s.guard_id}
            s={s}
            threshold={guards.find((g) => g.id === s.guard_id)?.threshold ?? 0.5}
            best={rows.length > 1 && top >= 0 && rank(s) === top && rows.filter((r) => rank(r) === top).length === 1}
            onReport={() => setReportId(s.guard_id)}
          />
        ))}
      </div>

      <Panel title="Conversation by conversation" sub="Each square is one guard on one conversation. Click one to open the conversation.">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-[12px]">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="pr-3 font-normal">Chat</th>
                <th className="pr-3 font-normal">Evaluator</th>
                {guards.map((g) => (
                  <th key={g.id} className="px-1 text-center font-normal whitespace-nowrap">
                    {g.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const outcome = outcomeOf(c)
                return (
                  <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer transition-colors hover:bg-n-50">
                    <td className="max-w-[260px] truncate pr-3 text-ink-2">
                      <span className="mr-2 font-mono text-ink-3">{convLabel(c.index)}</span>
                      {c.scenario?.title ?? c.summary?.scenario_title}
                    </td>
                    <td className="pr-3 whitespace-nowrap">
                      {outcome ? (
                        <span className={cn('inline-flex items-center gap-1', outcome === 'held' ? 'text-pass' : 'text-fail')}>
                          {outcome === 'held' ? <ShieldCheck className="size-3.5" /> : <ShieldX className="size-3.5" />}
                          {outcome === 'held' ? 'Held' : 'Violated'}
                        </span>
                      ) : (
                        <span className="text-ink-3">…</span>
                      )}
                    </td>
                    {guards.map((g) => {
                      const call = callOf(c, g.id)
                      return (
                        <td key={g.id} className="px-1 text-center">
                          <Tooltip
                            content={
                              <span className="block max-w-[300px]">
                                {g.name}: {CALL[call].label}. {CALL[call].text}.
                                {firstBlock(c, g, rules) && <span className="mt-1 block text-ink-3">{firstBlock(c, g, rules)}</span>}
                              </span>
                            }
                          >
                            <span className={cn('inline-flex h-6 min-w-[72px] items-center justify-center rounded-md px-2 text-[11px] font-medium', CALL[call].cell)}>{CALL[call].label}</span>
                          </Tooltip>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <GuardReport
        stats={reportId ? (stats?.[reportId] ?? null) : null}
        guard={guards.find((g) => g.id === reportId) ?? null}
        conversations={conversations}
        rules={rules}
        onClose={() => setReportId(null)}
        // close the report first: the conversation opens in its own sheet
        onOpenConversation={(id) => {
          setReportId(null)
          onOpen(id)
        }}
      />
    </div>
  )
}
