import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileCheck2, MessagesSquare, Network, Plus, Repeat, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AddTargetDialog } from '../components/AddTargetDialog'
import { AgentAvatar } from '../components/status'
import { TargetCard } from '../components/TargetCard'
import { Button } from '../components/ui/button'
import { Card, Chip, EmptyState, Eyebrow, Input, Kbd, Segmented, Skeleton } from '../components/ui/primitives'
import { SliderField } from '../components/ui/slider'
import { Backdrop } from '../components/visual/Backdrop'
import { api } from '../lib/api'
import { FOCUS_SUGGESTIONS } from '../lib/examples'
import { cn, relativeTime } from '../lib/format'
import { keys, useAgents, useConfig, useRuns, useTargets } from '../lib/queries'

const fadeUp = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] as const },
})

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-6 place-items-center rounded-full border border-line bg-surface font-mono text-[11px] text-ink-2 shadow-card">{n}</span>
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        <div className="ml-auto">{aside}</div>
      </div>
      {children}
    </section>
  )
}

export function NewRunPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const targets = useTargets()
  const runs = useRuns()
  const agents = useAgents()
  const config = useConfig()

  const [pickedTarget, setTargetId] = useState<string | null>(params.get('target'))
  const [addOpen, setAddOpen] = useState(false)
  const [numScenarios, setNumScenarios] = useState(9)
  const [pickedTurns, setMaxTurns] = useState<number | null>(null)
  const [pickedConcurrency, setConcurrency] = useState<number | null>(null)
  const [focus, setFocus] = useState('')
  const [source, setSource] = useState<'simula' | 'replay'>(params.get('replay') ? 'replay' : 'simula')
  const [pickedReplay, setReplayId] = useState<string | null>(params.get('replay'))

  // Fall back to server defaults and the first agent until the user picks something.
  const maxTurns = pickedTurns ?? config.data?.defaults.max_turns ?? 6
  const concurrency = pickedConcurrency ?? config.data?.defaults.concurrency ?? 3
  const target = targets.data?.find((t) => t.id === pickedTarget) ?? targets.data?.[0] ?? null
  const targetId = target?.id ?? null
  const replayable = useMemo(() => (runs.data ?? []).filter((r) => r.target_id === targetId && r.total > 0), [runs.data, targetId])
  const replayRun = replayable.find((r) => r.id === pickedReplay) ?? replayable[0] ?? null
  const replayId = replayRun?.id ?? null

  const limits = config.data?.limits ?? { max_turns: 20, concurrency: 10, num_scenarios: 100 }
  const effectiveScenarios = source === 'replay' && replayRun ? replayRun.total : numScenarios

  const launch = useMutation({
    mutationFn: () =>
      api.createRun({
        target_id: targetId!,
        num_scenarios: numScenarios,
        max_turns: maxTurns,
        concurrency,
        focus: source === 'simula' && focus.trim() ? focus.trim() : null,
        reuse_scenarios_from_run_id: source === 'replay' ? replayId : null,
      }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: keys.runs })
      navigate(`/runs/${run.id}`)
    },
  })

  const canLaunch = !!targetId && (source === 'simula' || !!replayRun) && !launch.isPending

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

  return (
    <div className="mx-auto w-full max-w-[1180px] px-8 pt-6 pb-16">
      {/* hero */}
      <motion.div {...fadeUp(0)} className="relative isolate overflow-hidden rounded-3xl border border-line">
        <Backdrop seed={8812} palette="light" className="-z-10" />
        <div className="grid gap-8 px-10 py-10 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div>
            <Eyebrow className="text-indigo-700/80">Pre-launch agent evaluation</Eyebrow>
            <h1 className="mt-3 font-serif text-[44px] leading-[1.04] font-[380] tracking-[-0.02em] text-ink">
              See how your agent behaves <em className="font-[420] text-indigo-600">before</em> your users do.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-2">
              Heckler reads your system prompt, maps the situations it implies, and runs simulated users through them in live conversations. Every
              conversation is graded against your policy, and every finding is quoted from the transcript.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {[
              { icon: Network, title: 'Map the space', text: 'Simula turns your prompt into a taxonomy of intents, personas and policy boundaries, so coverage is a number you can check.' },
              { icon: MessagesSquare, title: 'Simulate users', text: 'Three evaluator agents play those users in parallel, multi-turn conversations.' },
              { icon: FileCheck2, title: 'Grade with evidence', text: 'Each conversation is scored against your policy, with every finding quoted.' },
            ].map((s, i) => (
              <motion.div
                key={s.title}
                {...fadeUp(i + 2)}
                className="group flex cursor-default items-start gap-3 rounded-xl border border-white/60 bg-white/55 px-3.5 py-2.5 backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out-soft hover:-translate-x-1 hover:border-white hover:bg-white/85 hover:shadow-lift"
              >
                <s.icon className="mt-0.5 size-4 shrink-0 text-indigo-600 transition-transform duration-300 ease-out-soft group-hover:scale-110" />
                <div className="text-[12.5px] leading-snug">
                  <span className="font-display font-semibold text-ink">{s.title}.</span> <span className="text-ink-2">{s.text}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          <motion.div {...fadeUp(3)}>
            <Step
              n={1}
              title="Choose the agent to evaluate"
              aside={
                targets.data?.length ? (
                  <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
                    <Plus className="size-3.5" /> Connect another
                  </Button>
                ) : null
              }
            >
              {targets.isPending ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-[132px] rounded-2xl" />
                  <Skeleton className="h-[132px] rounded-2xl" />
                </div>
              ) : targets.isError ? (
                <Card>
                  <EmptyState title="Can’t load your agents">{(targets.error as Error).message}</EmptyState>
                </Card>
              ) : !targets.data.length ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-2 bg-surface/60 px-6 py-12 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface shadow-card transition-transform group-hover:scale-105">
                    <Plus className="size-5 text-ink-2" />
                  </span>
                  <span className="font-display text-[15px] font-semibold">Connect your first agent</span>
                  <span className="max-w-sm text-[13px] text-ink-3">Any OpenAI-compatible endpoint, your own HTTP backend, or an offline demo to see how it works.</span>
                </button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {targets.data.map((t) => (
                    <TargetCard key={t.id} target={t} selected={t.id === targetId} onSelect={() => setTargetId(t.id)} />
                  ))}
                </div>
              )}
            </Step>
          </motion.div>

          <motion.div {...fadeUp(4)}>
            <Step n={2} title="Design the test">
              <Card hover="glow" className="flex flex-col gap-6 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-display text-[13px] font-medium text-ink">Scenarios</div>
                    <div className="text-[12px] text-ink-3">Generate a fresh set, or replay an earlier run to measure a prompt change.</div>
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
                      <SliderField label="How many scenarios" value={numScenarios} onChange={setNumScenarios} min={1} max={Math.min(limits.num_scenarios, 60)} hint="Each scenario is one simulated user, shared across the evaluator agents." />
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
                    <motion.div key="replay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col gap-2">
                      {replayable.length ? (
                        <div className="flex flex-col gap-1.5">
                          {replayable.slice(0, 6).map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setReplayId(r.id)}
                              className={cn(
                                'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                                r.id === replayId ? 'border-ink bg-n-50' : 'border-line hover:border-line-2',
                              )}
                            >
                              <span className={cn('size-3.5 rounded-full border-[4px] transition-colors', r.id === replayId ? 'border-ink' : 'border-n-200')} />
                              <span className="font-mono text-[12px] text-ink-2">{r.id}</span>
                              <span className="text-[12px] text-ink-3">{relativeTime(r.created_at)}</span>
                              <span className="ml-auto text-[12px] tabular text-ink-2">{r.total} scenarios</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-xl border border-dashed border-line-2 px-4 py-5 text-center text-[13px] text-ink-3">
                          No earlier runs for this agent yet. Generate a set first, then replay it after each prompt change to compare like for like.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-px bg-line" />
                <div className="grid gap-6 sm:grid-cols-2">
                  <SliderField label="Max turns per chat" value={maxTurns} onChange={setMaxTurns} min={1} max={limits.max_turns} hint="An evaluator ends early once the outcome is clear." />
                  <SliderField label="Run in parallel" value={concurrency} onChange={setConcurrency} min={1} max={limits.concurrency} hint="Conversations running at once." />
                </div>
              </Card>
            </Step>
          </motion.div>
        </div>

        {/* summary */}
        <motion.aside {...fadeUp(5)} className="lg:sticky lg:top-6 lg:self-start">
          <Card hover="lift" className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <Eyebrow>Summary</Eyebrow>
              <div className="mt-2 font-display text-[16px] font-semibold tracking-[-0.01em]">{target ? target.name : <span className="text-ink-3">No agent selected</span>}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { k: 'scenarios', v: effectiveScenarios },
                  { k: 'turns max', v: maxTurns },
                  { k: 'parallel', v: concurrency },
                ].map((x) => (
                  <div key={x.k} className="rounded-lg bg-n-100/70 py-2 transition-colors duration-300 hover:bg-indigo-50">
                    <motion.div key={x.v} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25 }} className="font-display text-[18px] font-semibold tabular">
                      {x.v}
                    </motion.div>
                    <div className="text-[11px] text-ink-3">{x.k}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4">
              <Eyebrow>Evaluators</Eyebrow>
              <div className="mt-2.5 flex flex-col gap-2">
                {agents.isPending
                  ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-7" />)
                  : agents.data?.map((a) => (
                      <div key={a.name} className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors duration-200 hover:bg-n-100/70">
                        <AgentAvatar name={a.name} size="sm" className="transition-transform duration-300 ease-out-soft group-hover:scale-110 group-hover:-rotate-6" />
                        <span className="font-display text-[13px] font-medium">{a.name}</span>
                        <span className="ml-auto truncate font-mono text-[11px] text-ink-3">{a.model.model.split('/').pop()}</span>
                      </div>
                    ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">No fixed personas. Each evaluator plays the user its scenario describes, then grades the conversation.</p>
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

      <AddTargetDialog open={addOpen} onOpenChange={setAddOpen} onCreated={(t) => setTargetId(t.id)} />
    </div>
  )
}
