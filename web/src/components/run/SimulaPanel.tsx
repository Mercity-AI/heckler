import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { cn, humanize } from '../../lib/format'
import type { RunStatus, ScenarioProgress } from '../../lib/types'
import { Card, Eyebrow, Spinner } from '../ui/primitives'

const PHASES = [
  {
    key: 'taxonomy',
    title: 'Map the space',
    text: 'Decomposing your system prompt into factors of variation (intent, persona, pressure, policy boundary) and expanding each into a tree.',
    lines: [
      'Reading your system prompt…',
      'Finding the rules worth testing…',
      'Working out who your users might be…',
      'Mapping intents, moods and pressure…',
      'Growing the taxonomy, branch by branch…',
      'Letting the critic prune weak branches…',
    ],
  },
  {
    key: 'strategies',
    title: 'Design the mix',
    text: 'Writing weighted strategies over the taxonomy: which branches combine, and how often.',
    lines: ['Deciding which branches belong together…', 'Weighting the mix toward the edges…', 'Making sure the rare cases get a turn…'],
  },
  {
    key: 'meta_prompts',
    title: 'Generate with intent',
    text: 'Drafting a concrete situation for each sampled mix, and making some of them harder.',
    lines: ['Drafting situations…', 'Giving each user a backstory…', 'Cooking up edge cases…', 'Making a few of them harder…'],
  },
  {
    key: 'generating',
    title: 'Critique and refine',
    text: 'Writing each simulated user, then checking it with a separate critic before it is accepted.',
    lines: ['Writing simulated users…', 'Running each one past the critic…', 'Sending the unrealistic ones back…', 'Almost ready to start conversations…'],
  },
]

/** Cycles through a phase's status lines so a long first model call never looks frozen. */
function StatusLines({ lines, phaseKey }: { lines: string[]; phaseKey: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % lines.length), 2600)
    return () => window.clearInterval(t)
  }, [lines])
  return (
    <div className="relative h-5 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${phaseKey}-${i}`}
          initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="shimmer-text absolute inset-0 text-[13px] font-medium whitespace-nowrap"
        >
          {lines[i]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Seconds since mount; key it by phase to restart the count. */
function Elapsed() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setS((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  return <span className="shrink-0 font-mono text-[10.5px] text-ink-3 tabular">{s}s</span>
}

export function SimulaPanel({ status, progress, phasesSeen, numScenarios }: { status: RunStatus | null; progress: ScenarioProgress | null; phasesSeen: string[]; numScenarios?: number }) {
  // Before the first progress event the first model call is already in flight: show phase 1 as active.
  const currentIdx = progress ? PHASES.findIndex((p) => p.key === progress.phase) : status === 'generating_scenarios' ? 0 : -1

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="min-w-0">
          <Eyebrow>Simula</Eyebrow>
          <div className="mt-1 font-display text-[16px] font-semibold tracking-[-0.01em]">
            {status === 'queued' ? 'Getting ready…' : `Generating ${numScenarios ?? ''} scenarios`}
          </div>
        </div>
        <div className="text-right">
          <motion.div key={progress?.calls ?? 0} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-display text-[22px] font-semibold tabular">
            {progress?.calls ?? 0}
          </motion.div>
          <div className="text-[11.5px] text-ink-3">model calls</div>
        </div>
      </div>
      <ol className="relative px-6 py-5">
        {PHASES.map((p, i) => {
          const done = currentIdx > i || (phasesSeen.includes(p.key) && currentIdx !== i)
          const active = currentIdx === i
          return (
            <li key={p.key} className="relative flex gap-4 pb-6 last:pb-0">
              {i < PHASES.length - 1 && (
                <span className="absolute top-7 bottom-1 left-[11px] w-px overflow-hidden bg-line">
                  <motion.span className="block w-full bg-indigo-500" initial={false} animate={{ height: done ? '100%' : '0%' }} transition={{ duration: 0.6 }} />
                </span>
              )}
              <span
                className={cn(
                  'relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] transition-colors duration-300',
                  done ? 'border-indigo-500 bg-indigo-500 text-white' : active ? 'border-indigo-500 bg-surface text-indigo-600' : 'border-line bg-surface text-ink-3',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <Spinner className="size-3.5" /> : <span className="font-mono">{i + 1}</span>}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className={cn('font-display text-[14px] font-semibold', active ? 'text-ink' : done ? 'text-ink-2' : 'text-ink-3')}>{p.title}</div>
                <div className={cn('mt-0.5 text-[12.5px] leading-relaxed', active ? 'text-ink-2' : 'text-ink-3')}>{p.text}</div>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <StatusLines key={p.key} lines={p.lines} phaseKey={p.key} />
                        </div>
                        {progress?.detail && progress.phase === p.key && (
                          <span className="shrink-0 rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[10.5px] text-indigo-700">{humanize(progress.detail)}</span>
                        )}
                        <Elapsed key={p.key} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
