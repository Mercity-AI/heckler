import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, Play, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AddTargetDialog } from '../components/AddTargetDialog'
import { StatusDot } from '../components/status'
import { connectionSummary, ProbeButton } from '../components/TargetCard'
import { Button } from '../components/ui/button'
import { Card, EmptyState, Eyebrow, Skeleton } from '../components/ui/primitives'
import { api } from '../lib/api'
import { cn, pct, relativeTime } from '../lib/format'
import { keys, useRuns, useTargets } from '../lib/queries'
import type { RunSummary, Target } from '../lib/types'

function AgentRow({ target, runs, index }: { target: Target; runs: RunSummary[]; index: number }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const conn = connectionSummary(target)
  const remove = useMutation({
    mutationFn: () => api.deleteTarget(target.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.targets }),
  })
  const last = runs[0]

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}>
      <Card hover="glow" className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-6 p-5">
          <div className="min-w-[240px] flex-1">
            <div className="font-display text-[16px] font-semibold tracking-[-0.01em]">{target.name}</div>
            {target.description && <div className="mt-0.5 text-[13px] text-ink-3">{target.description}</div>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-n-100 px-2 py-1">
                {conn.icon}
                <span className="font-mono">{conn.label}</span>
              </span>
              <span className="truncate font-mono text-ink-3">{conn.detail}</span>
            </div>
          </div>
          <div className="min-w-[180px]">
            <Eyebrow>Latest run</Eyebrow>
            {last ? (
              <Link to={`/runs/${last.id}`} className="mt-1.5 flex items-center gap-2 text-[13px] hover:underline">
                <StatusDot status={last.status} />
                <span className="text-ink-2">{relativeTime(last.created_at)}</span>
                {last.break_rate != null && <span className={cn('tabular', last.break_rate > 0 ? 'text-fail' : 'text-pass')}>· breached {pct(last.break_rate)}</span>}
              </Link>
            ) : (
              <div className="mt-1.5 text-[13px] text-ink-3">Not evaluated yet</div>
            )}
            <div className="mt-0.5 text-[12px] text-ink-3">
              {runs.length} run{runs.length === 1 ? '' : 's'} total
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ProbeButton target={target} />
            <Button size="sm" variant="ink" onClick={() => navigate(`/?target=${target.id}`)}>
              <Play className="size-3.5" /> Evaluate
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line bg-n-50/50 px-5 py-2">
          <button onClick={() => setExpanded((e) => !e)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-ink">
            <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
            System prompt
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {confirm ? (
              <>
                <span className="text-[12px] text-ink-3">Delete this agent?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Keep
                </Button>
                <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  Delete
                </Button>
              </>
            ) : (
              <Button size="icon" variant="ghost" aria-label="Delete agent" onClick={() => setConfirm(true)}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <pre className="max-h-[360px] overflow-auto border-t border-line px-5 py-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2 scrollbar-thin">{target.system_prompt}</pre>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

export function AgentsPage() {
  const targets = useTargets()
  const runs = useRuns()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pt-10 pb-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Agents</Eyebrow>
          <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em]">Your agents</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">The agents you evaluate, each held to its own system prompt.</p>
        </div>
        <Button variant="ink" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Connect agent
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {targets.isPending ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-[150px] rounded-2xl" />)
        ) : !targets.data?.length ? (
          <Card>
            <EmptyState
              icon={<Bot className="size-5" />}
              title="No agents yet"
              action={
                <Button variant="ink" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" /> Connect agent
                </Button>
              }
            >
              Connect an OpenAI-compatible endpoint or your own HTTP backend, or start with the offline demo.
            </EmptyState>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {targets.data.map((t, i) => (
              <AgentRow key={t.id} target={t} index={i} runs={(runs.data ?? []).filter((r) => r.target_id === t.id)} />
            ))}
          </AnimatePresence>
        )}
      </div>
      <AddTargetDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
