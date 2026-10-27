import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Pencil, Repeat, ShieldCheck, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { evaluatorLabel } from '../lib/agentMeta'
import { AgentDialog } from '../components/AgentDialog'
import { Button } from '../components/ui/button'
import { Card, Checkbox, Chip, EmptyState, Eyebrow, Input, Kbd, Segmented, Skeleton } from '../components/ui/primitives'
import { SliderField } from '../components/ui/slider'
import { api } from '../lib/api'
import { FOCUS_SUGGESTIONS } from '../lib/examples'
import { cn, relativeTime, shortModel } from '../lib/format'
import { keys, useConfig, useRuns, useTargets } from '../lib/queries'

const fadeUp = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] as const },
})

export function DesignPage() {
  const { targetId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const targets = useTargets()
  const runs = useRuns()
  const config = useConfig()

  const [numScenarios, setNumScenarios] = useState(9)
  const [pickedTurns, setMaxTurns] = useState<number | null>(null)
  const [focus, setFocus] = useState('')
  const [source, setSource] = useState<'simula' | 'replay'>(params.get('replay') ? 'replay' : 'simula')
  const [pickedReplay, setReplayId] = useState<string | null>(params.get('replay'))
  const [editing, setEditing] = useState(false)
  // guard ids switched off for this run; every guard screens by default
  const [skipGuards, setSkipGuards] = useState<string[]>([])

  const target = targets.data?.find((t) => t.id === targetId) ?? null
  const maxTurns = pickedTurns ?? config.data?.defaults.max_turns ?? 6
  const limits = config.data?.limits ?? { max_turns: 20, concurrency: 100, num_scenarios: 100 }
  const replayable = useMemo(() => (runs.data ?? []).filter((r) => r.target_id === targetId && r.total > 0), [runs.data, targetId])
  const replayRun = replayable.find((r) => r.id === pickedReplay) ?? replayable[0] ?? null
  const effectiveScenarios = source === 'replay' && replayRun ? replayRun.total : numScenarios
  const guards = target?.guards ?? []
  const activeGuards = guards.filter((g) => !skipGuards.includes(g.id))

  const launch = useMutation({
    mutationFn: () =>
      api.createRun({
        target_id: targetId,
        num_scenarios: numScenarios,
        max_turns: maxTurns,
        focus: source === 'simula' && focus.trim() ? focus.trim() : null,
        reuse_scenarios_from_run_id: source === 'replay' ? (replayRun?.id ?? null) : null,
        guard_ids: activeGuards.length === guards.length ? null : activeGuards.map((g) => g.id),
      }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: keys.runs })
      navigate(`/runs/${run.id}`)
    },
  })
  const canLaunch = !!target && (source === 'simula' || !!replayRun) && !launch.isPending

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canLaunch) {
        e.preventDefault()
        launch.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canLaunch, launch])

  if (targets.isSuccess && !target)
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-16 sm:px-8 sm:pt-24">
        <Card>
          <EmptyState title="Agent not found" action={<Button onClick={() => navigate('/')}>Connect an agent</Button>} />
        </Card>
      </div>
    )

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pt-5 pb-16 sm:px-8 sm:pt-8">
      <motion.div {...fadeUp(0)}>
        <Link to="/" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft className="size-3.5" /> Connect
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Design the test</Eyebrow>
            <h1 className="mt-2 font-display text-[24px] sm:text-[28px] leading-tight font-semibold tracking-[-0.02em]">{target ? target.name : <Skeleton className="h-8 w-56" />}</h1>
          </div>
          {target && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit agent
            </Button>
          )}
        </div>
      </motion.div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <motion.div {...fadeUp(1)}>
          <Card className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div>
                <div className="font-display text-[14px] font-semibold text-ink">Scenarios</div>
                <div className="text-[12.5px] text-ink-3">Generate a fresh set, or replay an earlier run to measure a prompt change.</div>
              </div>
              <Segmented
                id="source"
                value={source}
                onChange={setSource}
                options={[
                  { value: 'simula', label: <><Sparkles className="size-3.5" /> Generate</> },
                  { value: 'replay', label: <><Repeat className="size-3.5" /> Replay</> },
                ]}
              />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {source === 'simula' ? (
                <motion.div key="simula" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col gap-6">
                  <SliderField
                    label="How many conversations"
                    value={numScenarios}
                    onChange={setNumScenarios}
                    min={1}
                    max={Math.min(limits.num_scenarios, 60)}
                    hint="One scenario per conversation, each with its own simulated user. They all run at once."
                  />
                  <div className="flex flex-col gap-2">
                    <span className="font-display text-[12.5px] font-medium text-ink-2">
                      Focus <span className="font-normal text-ink-3">(optional)</span>
                    </span>
                    <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. refund requests and emotional pressure" />
                    <div className="flex flex-wrap gap-1.5">
                      {FOCUS_SUGGESTIONS.map((s) => (
                        <button key={s} type="button" onClick={() => setFocus((f) => (f.includes(s.toLowerCase()) ? f : f ? `${f}, ${s.toLowerCase()}` : s))}>
                          <Chip tone="outline" className="cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
                            {s}
                          </Chip>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="replay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col gap-1.5">
                  {replayable.length ? (
                    replayable.slice(0, 6).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setReplayId(r.id)}
                        className={cn('flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors', r.id === replayRun?.id ? 'border-ink bg-n-50' : 'border-line hover:border-line-2')}
                      >
                        <span className={cn('size-3.5 rounded-full border-[4px] transition-colors', r.id === replayRun?.id ? 'border-ink' : 'border-n-200')} />
                        <span className="text-[13px] text-ink-2">{relativeTime(r.created_at)}</span>
                        <span className="font-mono text-[11.5px] text-ink-3">{r.id}</span>
                        <span className="ml-auto text-[12px] tabular text-ink-2">{r.total} scenarios</span>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-line-2 px-4 py-5 text-center text-[13px] text-ink-3">
                      No earlier runs for this agent yet. Generate a set first, then replay it after each prompt change to compare like for like.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="h-px bg-line" />
            <SliderField label="Max turns per conversation" value={maxTurns} onChange={setMaxTurns} min={1} max={limits.max_turns} hint="A simulated user ends early once the outcome is clear." />

            <div className="h-px bg-line" />
            <div className="flex flex-col gap-3">
              <div>
                <div className="font-display text-[14px] font-semibold text-ink">Guard models</div>
                <div className="text-[12.5px] text-ink-3">
                  {guards.length
                    ? 'Each one checks every reply against the guard policy, without changing the conversation. The run scores how many violations each would have stopped.'
                    : 'None yet. Add decision models like Jev, Clef or Laya to this agent to measure how many violations they would stop.'}
                </div>
              </div>
              {guards.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {guards.map((g) => {
                    const on = !skipGuards.includes(g.id)
                    const toggle = () => setSkipGuards((s) => (on ? [...s, g.id] : s.filter((x) => x !== g.id)))
                    return (
                      <div
                        key={g.id}
                        role="button"
                        tabIndex={0}
                        onClick={toggle}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
                        className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors', on ? 'border-ink bg-n-50' : 'border-line hover:border-line-2')}
                      >
                        <Checkbox checked={on} onChange={toggle} label={`Screen with ${g.name}`} />
                        <span className="text-[13px] font-medium text-ink">{g.name}</span>
                        <span className="ml-auto truncate font-mono text-[11.5px] text-ink-3">{g.kind === 'fake' ? 'offline' : shortModel(g.model)}</span>
                      </div>
                    )
                  })}
                  {!target?.guard_policy && (
                    <p className="text-[12px] text-ink-3">No guard policy saved: the evaluator writes one from the system prompt when the run starts.</p>
                  )}
                </div>
              ) : (
                target && (
                  <Button variant="secondary" size="sm" className="w-fit" onClick={() => setEditing(true)}>
                    <ShieldCheck className="size-3.5" /> Add guard models
                  </Button>
                )
              )}
            </div>
          </Card>
        </motion.div>

        <motion.aside {...fadeUp(2)} className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <div className="px-5 py-4">
              <Eyebrow>Summary</Eyebrow>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                {[
                  { k: 'conversations', v: effectiveScenarios },
                  { k: 'turns max', v: maxTurns },
                ].map((x) => (
                  <div key={x.k} className="rounded-lg bg-n-100/70 py-2">
                    <motion.div key={x.v} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25 }} className="font-display text-[18px] font-semibold tabular">
                      {x.v}
                    </motion.div>
                    <div className="text-[11px] text-ink-3">{x.k}</div>
                  </div>
                ))}
              </div>
              <dl className="mt-4 grid gap-2 text-[12.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Runs</dt>
                  <dd className="text-ink-2">all in parallel</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Evaluator</dt>
                  <dd className="truncate font-mono text-[11.5px] text-ink-2">{target ? evaluatorLabel(target) : '…'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Guards</dt>
                  <dd className="text-ink-2">{activeGuards.length ? `${activeGuards.length} screening` : 'none'}</dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-line bg-n-50/60 px-5 py-4">
              <Button variant="primary" size="lg" className="group w-full justify-center" disabled={!canLaunch} loading={launch.isPending} onClick={() => launch.mutate()}>
                Start evaluation {!launch.isPending && <ArrowRight className="size-4 transition-transform duration-300 ease-out-soft group-hover:translate-x-1" />}
              </Button>
              <div className="mt-2.5 flex items-center justify-center gap-1 text-[11.5px] text-ink-3">
                <Kbd>Ctrl</Kbd>
                <Kbd>↵</Kbd>
              </div>
              <AnimatePresence>
                {launch.error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-lg bg-fail-soft px-3 py-2 text-[12.5px] text-fail">
                    {(launch.error as Error).message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </motion.aside>
      </div>

      {target && <AgentDialog target={target} open={editing} onOpenChange={setEditing} />}
    </div>
  )
}
