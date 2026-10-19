import { Bot, Pencil, Play, Plus, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AgentDialog } from '../components/AgentDialog'
import { connectionSummary, evaluatorLabel } from '../lib/agentMeta'
import { StatusDot } from '../components/status'
import { Button } from '../components/ui/button'
import { Card, EmptyState, Eyebrow, Skeleton } from '../components/ui/primitives'
import { cn, relativeTime } from '../lib/format'
import { useRuns, useTargets } from '../lib/queries'
import type { RunSummary, Target } from '../lib/types'

function lastRunText(r: RunSummary): { text: string; tone: 'fail' | 'pass' | 'muted' } {
  if (!r.evaluated) return { text: r.status === 'failed' ? 'failed' : 'no graded chats', tone: 'muted' }
  return r.with_violations || r.broken
    ? { text: `violated in ${Math.max(r.with_violations, r.broken)}/${r.evaluated}`, tone: 'fail' }
    : { text: `held ${r.passed}/${r.evaluated}`, tone: 'pass' }
}

function AgentRow({ target, runs, index, onEdit }: { target: Target; runs: RunSummary[]; index: number; onEdit: () => void }) {
  const navigate = useNavigate()
  const conn = connectionSummary(target)
  const last = runs[0]
  const result = last ? lastRunText(last) : null

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}>
      <Card hover="glow" className="flex flex-wrap items-center gap-6 p-5">
        <div className="min-w-[240px] flex-1">
          <div className="font-display text-[16px] font-semibold tracking-[-0.01em]">{target.name}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-n-100 px-2 py-1">
              {conn.icon}
              <span className="font-mono">{conn.label}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-n-100 px-2 py-1" title="Evaluator model">
              <UserRound className="size-3.5" />
              <span className="font-mono">{evaluatorLabel(target)}</span>
            </span>
          </div>
        </div>
        <div className="min-w-[170px]">
          <Eyebrow>Latest run</Eyebrow>
          {last && result ? (
            <Link to={`/runs/${last.id}`} className="mt-1.5 flex items-center gap-2 text-[13px] hover:underline">
              <StatusDot status={last.status} />
              <span className="text-ink-2">{relativeTime(last.created_at)}</span>
              <span className={cn('tabular', result.tone === 'fail' ? 'text-fail' : result.tone === 'pass' ? 'text-pass' : 'text-ink-3')}>· {result.text}</span>
            </Link>
          ) : (
            <div className="mt-1.5 text-[13px] text-ink-3">Not evaluated yet</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ink" onClick={() => navigate(`/evaluate/${target.id}`)}>
            <Play className="size-3.5" /> Evaluate
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

export function AgentsPage() {
  const targets = useTargets()
  const runs = useRuns()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Target | null>(null)

  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pt-10 pb-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Agents</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">Everything you’ve connected, each held to its own system prompt.</p>
        </div>
        <Button variant="ink" onClick={() => navigate('/')}>
          <Plus className="size-4" /> Connect agent
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {targets.isPending ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : !targets.data?.length ? (
          <Card>
            <EmptyState
              icon={<Bot className="size-5" />}
              title="No agents yet"
              action={
                <Button variant="ink" onClick={() => navigate('/')}>
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
              <AgentRow key={t.id} target={t} index={i} runs={(runs.data ?? []).filter((r) => r.target_id === t.id)} onEdit={() => setEditing(t)} />
            ))}
          </AnimatePresence>
        )}
      </div>
      {editing && <AgentDialog target={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  )
}
