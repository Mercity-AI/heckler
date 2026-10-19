import { useMutation, useQueryClient } from '@tanstack/react-query'
import { History, Plus, Search, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { RunResultDot, ScoreRing } from '../components/status'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/overlay'
import { Card, Checkbox, EmptyState, Skeleton, Tooltip } from '../components/ui/primitives'
import { api } from '../lib/api'
import { cn, duration, isActive, plural, relativeTime } from '../lib/format'
import { runResult } from '../lib/outcome'
import { keys, useAllRuns } from '../lib/queries'
import type { RunSummary } from '../lib/types'

const EASE = [0.22, 1, 0.36, 1] as const

const COLUMNS = ['Agent', 'Result', 'Score', 'Chats', 'Started', 'Took']

function RunRow({ run, selected, onToggle, onOpen, onDelete }: { run: RunSummary; selected: boolean; onToggle: () => void; onOpen: () => void; onDelete: () => void }) {
  const result = runResult(run)
  const active = isActive(run.status)
  return (
    <motion.tr
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: EASE }}
      onClick={onOpen}
      className={cn('group cursor-pointer border-t border-line transition-colors duration-200', selected ? 'bg-indigo-50/60' : 'hover:bg-n-50')}
    >
      <td className="w-11 py-3 pr-1 pl-5" onClick={(e) => (e.stopPropagation(), onToggle())}>
        <Checkbox checked={selected} onChange={onToggle} label={`Select run ${run.id}`} />
      </td>
      <td className="max-w-0 min-w-[200px] py-3 pr-4">
        <div className="truncate text-[13.5px] font-medium text-ink">{run.target_name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-ink-3">{run.id}</div>
      </td>
      <td className="max-w-0 min-w-[180px] py-3 pr-4">
        <span className="flex items-center gap-2 text-[13px] text-ink-2" title={result.text}>
          <RunResultDot result={result} />
          <span className="truncate">{result.text}</span>
        </span>
      </td>
      <td className="py-3 pr-4">
        <ScoreRing value={run.mean_score} size={30} stroke={3} />
      </td>
      <td className="py-3 pr-4 text-[13px] text-ink-2 tabular">
        {run.finished}
        <span className="text-ink-3">/{run.total}</span>
      </td>
      <td className="py-3 pr-4 text-[13px] whitespace-nowrap text-ink-2" title={new Date(run.created_at).toLocaleString()}>
        {relativeTime(run.created_at)}
      </td>
      <td className="py-3 pr-4 text-[13px] whitespace-nowrap text-ink-3 tabular">{active ? 'Running' : duration(run.created_at, run.finished_at)}</td>
      <td className="w-12 py-3 pr-3">
        <Tooltip content="Delete run">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label={`Delete run ${run.id}`}
            className="grid size-8 place-items-center rounded-lg text-ink-3 opacity-0 transition-[opacity,background-color,color] duration-200 group-hover:opacity-100 hover:bg-fail-soft hover:text-fail focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </Tooltip>
      </td>
    </motion.tr>
  )
}

export function RunsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const runs = useAllRuns()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // the runs in the confirm dialog, kept while it animates out
  const [pending, setPending] = useState<RunSummary[]>([])
  const [confirming, setConfirming] = useState(false)

  const all = useMemo(() => runs.data ?? [], [runs.data])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? all.filter((r) => r.target_name.toLowerCase().includes(q) || r.id.includes(q)) : all
  }, [all, query])
  // selection only ever counts runs that still exist and are on screen
  const chosen = visible.filter((r) => selected.has(r.id))
  const allChosen = visible.length > 0 && chosen.length === visible.length

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.deleteRun(id)))
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed) throw failed.reason
    },
    onSettled: (_data, _error, ids) => {
      for (const id of ids) qc.removeQueries({ queryKey: keys.run(id) })
      qc.invalidateQueries({ queryKey: keys.runs })
    },
    onSuccess: (_data, ids) => {
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))))
      setConfirming(false)
    },
  })

  const askDelete = (list: RunSummary[]) => {
    remove.reset()
    setPending(list)
    setConfirming(true)
  }
  const pendingActive = pending.filter((r) => isActive(r.status)).length

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 pt-10 pb-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Runs</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">Every evaluation you’ve started, newest first.</p>
        </div>
        <Button variant="ink" onClick={() => navigate('/')}>
          <Plus className="size-4" /> New evaluation
        </Button>
      </div>

      <Card className="mt-8 overflow-hidden">
        {runs.isPending ? (
          <div className="space-y-4 p-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : all.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" />}
            title="No runs yet"
            action={
              <Button variant="ink" onClick={() => navigate('/')}>
                <Plus className="size-4" /> New evaluation
              </Button>
            }
          >
            Evaluations you start show up here.
          </EmptyState>
        ) : (
          <>
            <div className="flex h-14 items-center gap-3 px-5">
              <div className="relative w-full max-w-[280px]">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by agent or run ID"
                  className="h-8 w-full rounded-lg border border-transparent bg-n-100 pr-2 pl-8 text-[12.5px] outline-none transition-colors placeholder:text-ink-3 focus:border-line focus:bg-surface"
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <AnimatePresence mode="wait" initial={false}>
                  {chosen.length > 0 ? (
                    <motion.div key="selection" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.2, ease: EASE }} className="flex items-center gap-2">
                      <span className="text-[12.5px] text-ink-2 tabular">{chosen.length} selected</span>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                        Clear
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => askDelete(chosen)}>
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.span key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-[12.5px] text-ink-3 tabular">
                      {query ? `${visible.length} of ${plural(all.length, 'run')}` : plural(all.length, 'run')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="border-t border-line px-5 py-10 text-center text-[13px] text-ink-3">No runs match “{query}”.</p>
            ) : (
              <table className="w-full table-auto border-collapse text-left">
                <thead>
                  <tr className="border-t border-line bg-n-50/70">
                    <th className="w-11 py-2.5 pr-1 pl-5">
                      <Checkbox
                        checked={allChosen}
                        indeterminate={chosen.length > 0 && !allChosen}
                        onChange={() => setSelected(allChosen ? new Set() : new Set(visible.map((r) => r.id)))}
                        label="Select all runs"
                      />
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c} className="py-2.5 pr-4 font-mono text-[10.5px] font-medium tracking-[0.08em] text-ink-3 uppercase">
                        {c}
                      </th>
                    ))}
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {visible.map((run) => (
                      <RunRow
                        key={run.id}
                        run={run}
                        selected={selected.has(run.id)}
                        onToggle={() => toggle(run.id)}
                        onOpen={() => navigate(`/runs/${run.id}`)}
                        onDelete={() => askDelete([run])}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      <Dialog
        open={confirming}
        onOpenChange={(open) => !open && !remove.isPending && setConfirming(false)}
        className="max-w-[440px]"
        title={pending.length === 1 ? 'Delete this run?' : `Delete ${pending.length} runs?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => remove.mutate(pending.map((r) => r.id))} loading={remove.isPending}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          {pending.length === 1 ? (
            <>
              <span className="font-medium text-ink">{pending[0].target_name}</span>, started {relativeTime(pending[0].created_at)}. Its conversations, grades and scenarios are
              removed for good.
            </>
          ) : (
            'Their conversations, grades and scenarios are removed for good.'
          )}
          {pendingActive > 0 && <> {pendingActive === 1 && pending.length === 1 ? 'It’s still running and will be stopped first.' : `${plural(pendingActive, 'run')} still in progress will be stopped first.`}</>}
        </p>
        {remove.error && <p className="mt-3 text-[12.5px] text-fail">{(remove.error as Error).message}</p>}
      </Dialog>
    </div>
  )
}
