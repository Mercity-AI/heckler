import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronRight, Copy, Repeat, Square, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ConversationCard } from '../components/run/ConversationCard'
import { ConversationSheet } from '../components/run/ConversationSheet'
import { Insights } from '../components/run/Insights'
import { ScenarioMap } from '../components/run/ScenarioMap'
import { SimulaPanel } from '../components/run/SimulaPanel'
import { StatTiles } from '../components/run/StatTiles'
import { RunStatusPill } from '../components/status'
import { Button } from '../components/ui/button'
import { Card, EmptyState, Skeleton } from '../components/ui/primitives'
import { Tabs } from '../components/ui/tabs'
import { ShaderField } from '../components/visual/ShaderField'
import { useRunStream, type LiveConversation } from '../hooks/useRunStream'
import { api } from '../lib/api'
import { cn, duration, isActive, relativeTime } from '../lib/format'
import { keys, useRun } from '../lib/queries'
import { outcomeOf } from '../lib/outcome'

type Tab = 'live' | 'insights' | 'scenarios'
type Filter = 'all' | 'violated' | 'breached' | 'held' | 'active'

const FILTERS: { value: Filter; label: string; test: (c: LiveConversation) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'active', label: 'In progress', test: (c) => ['running', 'evaluating', 'pending'].includes(c.status) },
  // breached chats are violated too: any violation fails the conversation
  { value: 'violated', label: 'Violated', test: (c) => ['violated', 'breached'].includes(outcomeOf(c) ?? '') },
  { value: 'breached', label: 'Breached', test: (c) => outcomeOf(c) === 'breached' },
  { value: 'held', label: 'Held', test: (c) => outcomeOf(c) === 'held' },
]

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

function CopyId({ id }: { id: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(id)
        setDone(true)
        window.setTimeout(() => setDone(false), 1200)
      }}
      className="inline-flex items-center gap-1 font-mono text-[11.5px] text-ink-3 transition-colors hover:text-ink"
    >
      {id}
      {done ? <Check className="size-3 text-pass" /> : <Copy className="size-3" />}
    </button>
  )
}

export function RunViewPage() {
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const stream = useRunStream(runId)
  const run = useRun(runId)

  const tab = (params.get('tab') as Tab) || 'live'
  const openId = params.get('c')
  const [filter, setFilter] = useState<Filter>('all')

  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        if (t === 'live') p.delete('tab')
        else p.set('tab', t)
        return p
      },
      { replace: true },
    )
  const openConversation = useCallback(
    (id: string | null) =>
      setParams((p) => {
        if (id) p.set('c', id)
        else p.delete('c')
        return p
      }),
    [setParams],
  )

  // refresh REST views once the stream reports the end of the run
  useEffect(() => {
    if (stream.finishedAt) {
      qc.invalidateQueries({ queryKey: keys.run(runId) })
      qc.invalidateQueries({ queryKey: keys.runs })
    }
  }, [stream.finishedAt, runId, qc])
  // and when a new status lands, so the sidebar moves too
  useEffect(() => {
    if (stream.status) qc.invalidateQueries({ queryKey: keys.runs })
  }, [stream.status, qc])

  const status = stream.status ?? run.data?.status ?? null
  const stats = stream.stats ?? run.data?.stats ?? null
  const active = isActive(status)
  const now = useNow(active)

  const taxonomyQuery = useQuery({
    queryKey: keys.taxonomy(runId),
    queryFn: () => api.taxonomy(runId),
    enabled: !stream.taxonomy && stream.connection === 'closed',
  })
  const taxonomy = stream.taxonomy ?? taxonomyQuery.data?.taxonomy ?? null

  const conversations = useMemo(() => stream.order.map((id) => stream.conversations[id]).filter(Boolean), [stream.order, stream.conversations])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, conversations.filter(f.test).length])) as Record<Filter, number>, [conversations])
  const visible = useMemo(() => conversations.filter(FILTERS.find((f) => f.value === filter)!.test), [conversations, filter])

  const openIdx = openId ? conversations.findIndex((c) => c.id === openId) : -1

  const cancel = useMutation({ mutationFn: () => api.cancelRun(runId), onSuccess: () => qc.invalidateQueries({ queryKey: keys.runs }) })

  const detail = run.data
  const targetName = detail?.target_name ?? '…'
  const maxTurns = detail?.config.max_turns ?? 6
  const heat = stats?.evaluated ? stats.broken / stats.evaluated : 0
  // the field keeps drifting after the run ends, just slower and quieter
  const energy = status === 'running' ? 0.85 : status === 'generating_scenarios' || status === 'queued' ? 0.55 : 0.3
  const generating = status === 'queued' || status === 'generating_scenarios'

  if (run.isError && !stream.status) {
    return (
      <div className="mx-auto max-w-[640px] px-8 pt-24">
        <Card>
          <EmptyState icon={<AlertTriangle className="size-5" />} title="Run not found" action={<Button onClick={() => navigate('/')}>Start a new evaluation</Button>}>
            {(run.error as Error).message}
          </EmptyState>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-full">
      {/* header */}
      <div className="relative isolate overflow-hidden border-b border-line">
        <ShaderField energy={energy} heat={heat} className="-z-10" />
        <div className="mx-auto max-w-[1440px] px-8 pt-5 pb-6">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Link to="/agents" className="hover:text-ink">
              Agents
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-ink-2">{targetName}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">{detail ? detail.target_name : <Skeleton className="h-8 w-56" />}</h1>
                {status && <RunStatusPill status={status} />}
                <AnimatePresence>
                  {stream.connection === 'reconnecting' && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-medium text-warn">
                      <WifiOff className="size-3" /> Reconnecting
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
                <CopyId id={runId} />
                {detail && (
                  <>
                    <span>Started {relativeTime(detail.created_at, now)}</span>
                    <span className="tabular">
                      {active ? 'Running for ' : 'Took '}
                      {duration(detail.started_at ?? detail.created_at, active ? new Date(now).toISOString() : detail.finished_at)}
                    </span>
                    <span>
                      {detail.config.scenarios?.length ?? (detail.config.reuse_scenarios_from_run_id ? 'Replayed' : detail.config.num_scenarios)} conversations · up to {detail.config.max_turns} turns ·{' '}
                      {detail.config.concurrency ? `${detail.config.concurrency} at a time` : 'all in parallel'}
                    </span>
                    {detail.config.focus && <span className="max-w-[320px] truncate">Focus: “{detail.config.focus}”</span>}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {active ? (
                <Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending}>
                  <Square className="size-3 fill-current" /> Stop run
                </Button>
              ) : (
                detail && (
                  <Button variant="secondary" onClick={() => navigate(conversations.length ? `/evaluate/${detail.target_id}?replay=${runId}` : `/evaluate/${detail.target_id}`)}>
                    <Repeat className="size-3.5" /> Re-run scenarios
                  </Button>
                )
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {stats && !generating && (stats.total > 0 || conversations.length > 0) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                <div className="pt-5">
                  <StatTiles stats={stats} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {stats && status === 'running' && stats.total > 0 && (
            <div className="mt-4 flex items-center gap-3 text-[12px] text-ink-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/70">
                <motion.div className="h-full rounded-full bg-indigo-500" animate={{ width: `${(stats.finished / stats.total) * 100}%` }} transition={{ duration: 0.6 }} />
              </div>
              <span className="tabular">
                {stats.finished}/{stats.total} chats done
              </span>
            </div>
          )}
        </div>
      </div>

      {/* body */}
      <div className="mx-auto max-w-[1440px] px-8 pt-5 pb-16">
        {status === 'failed' && (stream.error || detail?.error) && (
          <div className="mb-5 flex gap-3 rounded-xl border border-fail/25 bg-fail-soft px-4 py-3 text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fail" />
            <div className="min-w-0">
              <div className="font-semibold text-fail">Run failed</div>
              <div className="mt-0.5 break-words text-ink-2">{stream.error ?? detail?.error}</div>
            </div>
          </div>
        )}

        {generating ? (
          <SimulaPanel status={status} calls={stream.calls} numScenarios={detail?.config.num_scenarios} startedAt={detail?.started_at ?? detail?.created_at} />
        ) : conversations.length === 0 ? (
          stream.connection === 'connecting' || run.isPending ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[620px] rounded-2xl" />
              ))}
            </div>
          ) : (
            status !== 'failed' && (
              <Card>
                <EmptyState title="No conversations in this run" />
              </Card>
            )
          )
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 border-b border-line">
              <Tabs
                id="run"
                value={tab}
                onChange={setTab}
                className="-mb-px border-b-0"
                items={[
                  { value: 'live', label: active ? 'Live conversations' : 'Conversations', count: conversations.length },
                  { value: 'insights', label: 'Insights' },
                  { value: 'scenarios', label: 'Scenarios' },
                ]}
              />
              {tab === 'live' && (
                <div className="flex flex-wrap items-center gap-1 py-1.5">
                  {FILTERS.filter((f) => f.value === 'all' || counts[f.value] > 0).map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFilter(f.value)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                        filter === f.value ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-line-2',
                      )}
                    >
                      {f.label}
                      <span className={cn('tabular', filter === f.value ? 'text-white/70' : 'text-ink-3')}>{counts[f.value]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                {tab === 'live' &&
                  (visible.length ? (
                    <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
                      <AnimatePresence mode="popLayout">
                        {visible.map((c) => (
                          <ConversationCard key={c.id} c={c} targetName={targetName} maxTurns={maxTurns} onOpen={openConversation} />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <Card>
                      <EmptyState title="Nothing matches this filter" action={<Button onClick={() => setFilter('all')}>Show all</Button>} />
                    </Card>
                  ))}
                {tab === 'insights' && <Insights stats={stats} conversations={conversations} onOpen={openConversation} maxTurns={maxTurns} />}
                {tab === 'scenarios' && <ScenarioMap taxonomy={taxonomy} conversations={conversations} onOpen={openConversation} />}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      <ConversationSheet
        conversation={openIdx >= 0 ? conversations[openIdx] : null}
        targetName={targetName}
        maxTurns={maxTurns}
        onClose={() => openConversation(null)}
      />
    </div>
  )
}
