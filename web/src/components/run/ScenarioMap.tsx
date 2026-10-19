import { useMemo } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { cn, humanize } from '../../lib/format'
import type { Taxonomy, TaxonomyNode } from '../../lib/types'
import { AgentAvatar, StatusDot, VerdictBadge } from '../status'
import { Card, Chip, EmptyState, Eyebrow, Tooltip } from '../ui/primitives'

interface NodeStat {
  used: number
  evaluated: number
  broken: number
}

function leafNodes(node: TaxonomyNode): TaxonomyNode[] {
  if (!node.children?.length) return [node]
  return node.children.flatMap(leafNodes)
}

/**
 * The Simula taxonomy as a coverage map: one column per factor, one row per node, showing how many
 * scenarios drew on that node and how often the agent broke under it.
 */
function TaxonomyGrid({ taxonomy, conversations }: { taxonomy: Taxonomy; conversations: LiveConversation[] }) {
  const stats = useMemo(() => {
    const m = new Map<string, NodeStat>()
    for (const c of conversations) {
      for (const mix of c.scenario?.taxonomy_mix ?? []) {
        const key = `${mix.factor}/${mix.node}`
        const s = m.get(key) ?? { used: 0, evaluated: 0, broken: 0 }
        s.used++
        if (c.evaluation) {
          s.evaluated++
          if (c.evaluation.broken) s.broken++
        }
        m.set(key, s)
      }
    }
    return m
  }, [conversations])

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {taxonomy.factors.map((f) => {
        const nodes = (f.children?.length ? f.children.flatMap(leafNodes) : []).map((n) => ({ n, s: stats.get(`${f.name}/${n.name}`) }))
        return (
          <Card key={f.name} className="flex flex-col p-4">
            <Tooltip content={f.description}>
              <div className="font-display text-[13.5px] font-semibold tracking-[-0.01em]">{humanize(f.name)}</div>
            </Tooltip>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3">{f.description}</div>
            <div className="mt-3 flex flex-col gap-0.5">
              {nodes.map(({ n, s }) => {
                const rate = s?.evaluated ? s.broken / s.evaluated : null
                return (
                  <Tooltip
                    key={n.name}
                    content={
                      <span>
                        {n.description !== humanize(n.name).toLowerCase() && n.description !== n.name.replace(/_/g, ' ') ? `${n.description}. ` : ''}
                        {s ? `${s.used} scenario${s.used === 1 ? '' : 's'}` : 'Not sampled this run'}
                        {s?.evaluated ? `, breached ${s.broken}/${s.evaluated}` : ''}
                      </span>
                    }
                    side="right"
                  >
                    <div className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-n-50', !s && 'opacity-45')}>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{humanize(n.name)}</span>
                      <span className="font-mono text-[10.5px] text-ink-3 tabular">{s?.used ?? 0}</span>
                      <span className="flex w-[52px] items-center gap-1">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-n-100">
                          {rate != null && <span className="block h-full rounded-full bg-fail" style={{ width: `${Math.max(rate * 100, rate > 0 ? 12 : 0)}%` }} />}
                        </span>
                      </span>
                    </div>
                  </Tooltip>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function ScenarioMap({ taxonomy, conversations, onOpen }: { taxonomy: Taxonomy | null; conversations: LiveConversation[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Simula taxonomy</Eyebrow>
            <p className="mt-1 text-[13px] text-ink-3">The space your prompt implies. Counts are scenarios drawn from each node; red bars show the breach rate there.</p>
          </div>
        </div>
        {taxonomy?.factors?.length ? (
          <TaxonomyGrid taxonomy={taxonomy} conversations={conversations} />
        ) : (
          <Card>
            <EmptyState title="No taxonomy for this run">Runs that replay earlier scenarios or use hand-written ones skip Simula.</EmptyState>
          </Card>
        )}
      </section>

      <section>
        <Eyebrow className="mb-3">All scenarios · {conversations.length}</Eyebrow>
        <Card className="overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-n-50/80 text-left text-ink-3">
              <tr>
                {['#', 'Scenario', 'Category', 'Difficulty', 'Agent', 'Result'].map((h, i) => (
                  <th key={h} className={cn('px-4 py-2.5 font-mono text-[10.5px] font-medium tracking-wider uppercase', i === 5 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const title = c.scenario?.title ?? c.summary?.scenario_title ?? ''
                const e = c.evaluation
                return (
                  <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer border-t border-line/70 transition-colors hover:bg-n-50">
                    <td className="px-4 py-2.5 font-mono text-ink-3 tabular">{c.index + 1}</td>
                    <td className="max-w-[360px] px-4 py-2.5">
                      <div className="truncate font-medium text-ink">{title}</div>
                      {c.scenario && <div className="truncate text-[11.5px] text-ink-3">{c.scenario.goal}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Chip>{humanize(c.scenario?.category ?? c.summary?.scenario_category ?? '')}</Chip>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{c.scenario?.difficulty ?? c.summary?.difficulty}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <AgentAvatar name={c.agent_name} size="sm" /> {c.agent_name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {e || c.summary?.verdict ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-display font-semibold tabular">{e?.score ?? c.summary?.score}</span>
                          <VerdictBadge verdict={e?.verdict ?? c.summary?.verdict ?? null} broken={e?.broken ?? c.summary?.broken} size="sm" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-ink-3">
                          <StatusDot status={c.status} /> {humanize(c.status)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
