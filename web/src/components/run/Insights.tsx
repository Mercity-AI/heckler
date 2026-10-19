import { Lightbulb } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { cn, compact, humanize, pct } from '../../lib/format'
import type { GroupStats, RunStats, Severity } from '../../lib/types'
import { AgentAvatar, SeverityBadge } from '../status'
import { AgentDimensionDots, BreakTurnChart, DifficultyStrip, ScoreHistogram, ScoreTimeline } from './Charts'
import { Card, EmptyState, Eyebrow, Tooltip } from '../ui/primitives'

function Panel({ title, sub, children, className, right }: { title: string; sub?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <Card hover="glow" className={cn('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <div className="font-display text-[14px] font-semibold tracking-[-0.01em]">{title}</div>
          {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
        </div>
        {right}
      </div>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </Card>
  )
}

/** Single-series horizontal bars, 0–10. Sorted weakest first so the problem reads at the top. */
function DimensionChart({ means }: { means: Record<string, number> }) {
  const rows = Object.entries(means).sort((a, b) => a[1] - b[1])
  if (!rows.length) return <p className="text-[13px] text-ink-3">No graded chats yet.</p>
  return (
    <div className="flex flex-col gap-1">
      {rows.map(([k, v], i) => (
        <Tooltip key={k} content={`${humanize(k)}: ${v.toFixed(1)} / 10`} side="right">
          <div className="grid grid-cols-[140px_1fr_36px] items-center gap-3 rounded-md py-1.5 transition-colors hover:bg-n-50">
            <span className={cn('truncate text-[12.5px]', i === 0 ? 'font-medium text-ink' : 'text-ink-2')}>{humanize(k)}</span>
            <div className="relative h-[14px]">
              {[2.5, 5, 7.5].map((g) => (
                <span key={g} className="absolute inset-y-0 w-px bg-n-100" style={{ left: `${g * 10}%` }} />
              ))}
              <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-indigo-500 transition-[width] duration-700 ease-out-soft" style={{ width: `${(v / 10) * 100}%` }} />
            </div>
            <span className="text-right font-display text-[12.5px] font-semibold tabular">{v.toFixed(1)}</span>
          </div>
        </Tooltip>
      ))}
      <div className="grid grid-cols-[140px_1fr_36px] gap-3 pt-1">
        <span />
        <div className="relative h-3 font-mono text-[10px] text-ink-3">
          {[0, 5, 10].map((g) => (
            <span key={g} className="absolute -translate-x-1/2" style={{ left: `${g * 10}%` }}>
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Verdict mix as one stacked bar with a 2px surface gap between segments, plus a legend. */
function VerdictMix({ stats }: { stats: RunStats }) {
  const segs = [
    { k: 'Held', v: stats.passed, cls: 'bg-pass' },
    { k: 'Partial', v: stats.partial, cls: 'bg-warn' },
    { k: 'Failed', v: stats.failed, cls: 'bg-fail' },
    { k: 'Errored', v: stats.errored, cls: 'bg-n-300' },
  ].filter((s) => s.v > 0)
  const total = segs.reduce((a, s) => a + s.v, 0)
  if (!total) return <p className="text-[13px] text-ink-3">No graded chats yet.</p>
  return (
    <div>
      <div className="flex h-6 gap-[2px] overflow-hidden rounded-[6px]">
        {segs.map((s) => (
          <Tooltip key={s.k} content={`${s.k}: ${s.v} of ${total} (${pct(s.v / total)})`}>
            <div className={cn('h-full transition-[flex-grow] duration-700', s.cls)} style={{ flexGrow: s.v }} />
          </Tooltip>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segs.map((s) => (
          <span key={s.k} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className={cn('size-2 rounded-[2px]', s.cls)} />
            {s.k} <span className="font-display font-semibold text-ink tabular">{s.v}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-fail-soft/70 px-3 py-2 text-[12.5px] text-ink-2">
        <span className="font-display text-[15px] font-semibold text-fail tabular">{stats.broken}</span> of the {stats.failed} failed chats were instruction breaches.
      </div>
    </div>
  )
}

function GroupTable({ rows, label, render }: { rows: [string, GroupStats][]; label: string; render: (name: string) => ReactNode }) {
  if (!rows.length) return <p className="text-[13px] text-ink-3">Nothing yet.</p>
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-left text-ink-3">
          <th className="pb-2 font-mono text-[10.5px] font-medium tracking-wider uppercase">{label}</th>
          <th className="pb-2 text-right font-mono text-[10.5px] font-medium tracking-wider uppercase">Chats</th>
          <th className="w-[38%] pb-2 pl-4 font-mono text-[10.5px] font-medium tracking-wider uppercase">Breached</th>
          <th className="pb-2 text-right font-mono text-[10.5px] font-medium tracking-wider uppercase">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, g]) => {
          const rate = g.evaluated ? g.broken / g.evaluated : 0
          return (
            <tr key={name} className="border-t border-line/70">
              <td className="py-2 pr-2">{render(name)}</td>
              <td className="py-2 text-right tabular text-ink-2">{g.conversations}</td>
              <td className="py-2 pl-4">
                <Tooltip content={`The agent set its prompt aside in ${g.broken} of ${g.evaluated} graded chats`}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-n-100">
                      <div className="h-full rounded-full bg-fail transition-[width] duration-700" style={{ width: `${rate * 100}%` }} />
                    </div>
                    <span className="w-9 text-right tabular text-ink-2">{g.evaluated ? pct(rate) : '–'}</span>
                  </div>
                </Tooltip>
              </td>
              <td className="py-2 text-right font-display font-semibold tabular">{g.mean_score == null ? '–' : Math.round(g.mean_score)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export function Insights({ stats, conversations, onOpen, maxTurns }: { stats: RunStats | null; conversations: LiveConversation[]; onOpen: (id: string) => void; maxTurns: number }) {
  // Group violations by rule so recurring weaknesses stand out.
  const rules = useMemo(() => {
    const map = new Map<string, { rule: string; severity: Severity; hits: { id: string; agent: string; title: string }[] }>()
    for (const c of conversations) {
      for (const v of c.evaluation?.policy_violations ?? []) {
        const key = v.rule.trim().toLowerCase()
        const entry = map.get(key) ?? { rule: v.rule, severity: v.severity, hits: [] }
        if (SEV_RANK[v.severity] < SEV_RANK[entry.severity]) entry.severity = v.severity
        if (!entry.hits.some((h) => h.id === c.id)) entry.hits.push({ id: c.id, agent: c.agent_name, title: c.scenario?.title ?? '' })
        map.set(key, entry)
      }
    }
    return [...map.values()].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.hits.length - a.hits.length)
  }, [conversations])

  const recommendations = useMemo(() => {
    const map = new Map<string, { text: string; n: number }>()
    for (const c of conversations) {
      for (const r of c.evaluation?.recommendations ?? []) {
        const key = r.trim().toLowerCase()
        const e = map.get(key) ?? { text: r.trim(), n: 0 }
        e.n++
        map.set(key, e)
      }
    }
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 8)
  }, [conversations])

  if (!stats || !stats.evaluated)
    return (
      <Card>
        <EmptyState title="Insights appear as conversations are graded">Each evaluator grades its conversation as soon as it ends. Everything here updates live.</EmptyState>
      </Card>
    )

  const byAgent = Object.entries(stats.by_agent).sort((a, b) => a[0].localeCompare(b[0]))
  const byCategory = Object.entries(stats.by_category).sort((a, b) => (b[1].evaluated ? b[1].broken / b[1].evaluated : 0) - (a[1].evaluated ? a[1].broken / a[1].evaluated : 0))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Score timeline" sub="Every graded chat in the order it finished, with the running mean. Click a dot to open it." className="lg:col-span-2">
        <ScoreTimeline conversations={conversations} onOpen={onOpen} />
      </Panel>
      <Panel title="Score distribution" sub="How graded scores spread from 0 to 100">
        <ScoreHistogram conversations={conversations} />
      </Panel>
      <Panel title="Turn of first violation" sub="When the agent first slipped, per conversation">
        <BreakTurnChart conversations={conversations} maxTurns={maxTurns} />
      </Panel>

      <Panel title="Weakest dimensions" sub="Mean score per dimension across graded chats, lowest first (0–10)">
        <DimensionChart means={stats.dimension_means} />
      </Panel>
      <Panel title="Verdicts" sub={`${stats.evaluated} graded chats`}>
        <VerdictMix stats={stats} />
      </Panel>

      <Panel title="Dimensions by evaluator" sub="Mean per evaluator on a 0–10 scale; the grey bar spans their spread">
        <AgentDimensionDots conversations={conversations} />
      </Panel>
      <Panel title="Score by difficulty" sub="Each dot is a chat. Harder scenarios should score lower; if not, they aren’t hard.">
        <DifficultyStrip conversations={conversations} onOpen={onOpen} />
      </Panel>

      <Panel title="Policy findings" sub="Grouped by rule, most severe first. Open a conversation to see the quoted evidence." className="lg:col-span-2">
        {rules.length ? (
          <div className="divide-y divide-line/70">
            {rules.map((r) => (
              <div key={r.rule} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <SeverityBadge severity={r.severity} />
                    <span className="font-display text-[13.5px] font-semibold text-ink">{r.rule}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <span className="mr-1 text-[12px] text-ink-3 tabular">
                    {r.hits.length} chat{r.hits.length === 1 ? '' : 's'}
                  </span>
                  {r.hits.slice(0, 8).map((h) => (
                    <Tooltip key={h.id} content={h.title}>
                      <button onClick={() => onOpen(h.id)} className="rounded-md transition-transform hover:-translate-y-px">
                        <AgentAvatar name={h.agent} size="sm" />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">No policy violations recorded.</p>
        )}
      </Panel>

      <Panel title="By evaluator" sub="Same agent, different scenarios">
        <GroupTable
          rows={byAgent}
          label="Agent"
          render={(name) => (
            <span className="inline-flex items-center gap-2 font-medium text-ink">
              <AgentAvatar name={name} size="sm" />
              {name}
            </span>
          )}
        />
      </Panel>
      <Panel title="By scenario category" sub="Sorted by breach rate, highest first">
        <GroupTable rows={byCategory} label="Category" render={(name) => <span className="font-medium text-ink">{humanize(name)}</span>} />
      </Panel>

      {recommendations.length > 0 && (
        <Panel title="Recommended prompt changes" sub="From the evaluators, most repeated first" className="lg:col-span-2">
          <ol className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-ink-2">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-indigo-500" />
                <span>
                  {r.text}
                  {r.n > 1 && <span className="ml-1.5 rounded bg-n-100 px-1 font-mono text-[10.5px] text-ink-3">×{r.n}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-[12px] text-ink-3 lg:col-span-2">
        <Eyebrow>Evaluator usage</Eyebrow>
        <span>
          <span className="font-display font-semibold text-ink-2 tabular">{compact(stats.attacker_usage.input_tokens)}</span> input tokens
        </span>
        <span>
          <span className="font-display font-semibold text-ink-2 tabular">{compact(stats.attacker_usage.output_tokens)}</span> output tokens
        </span>
        <span>
          <span className="font-display font-semibold text-ink-2 tabular">{stats.attacker_usage.calls}</span> calls
        </span>
      </div>
    </div>
  )
}
