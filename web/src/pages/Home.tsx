import { useMutation } from '@tanstack/react-query'
import { PlayCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { AgentForm } from '../components/AgentForm'
import { Button } from '../components/ui/button'
import { Menu } from '../components/ui/menu'
import { Card } from '../components/ui/primitives'
import { Backdrop } from '../components/visual/Backdrop'
import { api } from '../lib/api'
import { EXAMPLE_AGENTS } from '../lib/examples'
import { connectionSummary } from '../lib/agentMeta'
import { cn } from '../lib/format'
import { useConfig, useTargets } from '../lib/queries'

const fadeUp = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] as const },
})

const HOW_IT_WORKS = [
  { title: 'Connect your agent', body: 'Its endpoint, plus the system prompt it runs with. That prompt is the policy.' },
  { title: 'The tester agent talks to it', body: 'It writes realistic users from your prompt and chats with your agent, many at once.' },
  { title: 'See how it behaves', body: 'Watch every chat live. Each is graded, with the exact lines quoted where it slipped.' },
]

/**
 * "See an example": open the curated run if the deployment pins one, otherwise run the free offline
 * demo (scripted agent and evaluators) so there is always something live to watch. The demo runs
 * against an unsaved agent, so it never shows up in your agents or runs.
 */
function useExample() {
  const navigate = useNavigate()
  const config = useConfig()
  return useMutation({
    mutationFn: async () => {
      if (config.data?.example_run_id) return config.data.example_run_id
      const travel = EXAMPLE_AGENTS[0]
      const run = await api.createExampleRun({ name: 'Atlas (example)', description: travel.description, system_prompt: travel.prompt, num_scenarios: 6, max_turns: 4 })
      return run.id
    },
    onSuccess: (runId) => navigate(`/runs/${runId}`),
  })
}

export function HomePage() {
  const navigate = useNavigate()
  const targets = useTargets()
  const example = useExample()
  const saved = targets.data ?? []

  return (
    <div className="mx-auto w-full max-w-[860px] px-8 pt-8 pb-20">
      <motion.div {...fadeUp(0)} className="relative isolate overflow-hidden rounded-3xl border border-line">
        <Backdrop seed={8812} palette="light" className="-z-10" />
        <div className="px-10 py-10">
          <h1 className="max-w-[20ch] font-serif text-[44px] leading-[1.04] font-[380] tracking-[-0.02em] text-ink">
            See how your agent behaves <em className="font-[420] text-indigo-600">before</em> your users do.
          </h1>
          <p className="mt-4 max-w-[68ch] text-[14.5px] leading-relaxed text-pretty text-ink-2">
            Connect your agent. Heckler writes realistic users from its system prompt, talks to it in parallel, and grades every conversation with quoted evidence.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => example.mutate()} loading={example.isPending} className="bg-white/80 backdrop-blur">
              {!example.isPending && <PlayCircle className="size-4" />}
              See an example
            </Button>
            {example.error && <span className="text-[12.5px] text-fail">{(example.error as Error).message}</span>}
          </div>
        </div>
        <ol className="grid border-t border-white/60 bg-white/35 backdrop-blur-sm sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title} className={cn('px-10 py-5 sm:px-6 sm:first:pl-10 sm:last:pr-10', i > 0 && 'border-t border-white/60 sm:border-t-0 sm:border-l')}>
              <span className="font-mono text-[10.5px] font-medium tracking-[0.08em] text-indigo-700/70">0{i + 1}</span>
              <div className="mt-1.5 font-display text-[14px] font-semibold tracking-[-0.01em] text-ink">{step.title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-pretty text-ink-3">{step.body}</p>
            </li>
          ))}
        </ol>
      </motion.div>

      {saved.length > 0 && (
        <motion.div {...fadeUp(1)} className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3 shadow-card">
          <span className="text-[13px] text-ink-2">Evaluating an agent you already connected?</span>
          <Menu
            className="w-[240px]"
            placeholder="Choose a saved agent"
            onSelect={(id) => navigate(`/evaluate/${id}`)}
            items={saved.map((t) => {
              const conn = connectionSummary(t)
              return { value: t.id, label: t.name, hint: conn.label, icon: conn.icon }
            })}
          />
        </motion.div>
      )}

      <motion.div {...fadeUp(2)} className="mt-6">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-[18px] font-semibold tracking-[-0.015em]">Connect your agent</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">Two connections: the agent you’re testing, and the model that tests it.</p>
          </div>
          <AgentForm onSaved={(t) => navigate(`/evaluate/${t.id}`)} />
        </Card>
      </motion.div>
    </div>
  )
}
