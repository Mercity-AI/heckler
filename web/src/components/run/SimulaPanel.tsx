import { Check, ChevronRight, CircleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn, compact, humanize, shortModel } from '../../lib/format'
import type { GeneratorCall, RunStatus } from '../../lib/types'
import { Card, Eyebrow, Spinner } from '../ui/primitives'

const EASE = [0.22, 1, 0.36, 1] as const

const PHASES = [
  { key: 'taxonomy', title: 'Map the space' },
  { key: 'strategies', title: 'Design the mix' },
  { key: 'meta_prompts', title: 'Draft situations' },
  { key: 'generating', title: 'Write and critique' },
]

const TASK_LABEL: Record<string, string> = {
  factor_discovery: 'Find factors of variation',
  node_expansion: 'Expand taxonomy node',
  taxonomy_critic: 'Critique taxonomy',
  level_plan: 'Plan next level',
  strategy: 'Write sampling strategies',
  meta_prompt: 'Draft situations for a mix',
  complexify: 'Make a situation harder',
  generate: 'Write scenario',
  repair: 'Repair scenario',
  semantic_critic: 'Critic check',
  refine: 'Refine scenario',
}

function parseJson(text: string): unknown {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    return JSON.parse(text.slice(a, b + 1))
  } catch {
    return null
  }
}

/** One readable line about what a finished call produced. */
function gist(call: GeneratorCall): string | null {
  if (call.status === 'error') return call.error
  if (call.status !== 'done') return null
  const data = parseJson(call.output) as Record<string, unknown> | null
  if (!data) return null
  const names = (xs: unknown) => (Array.isArray(xs) ? xs.map((x) => (x as { name?: string; id?: string })?.name ?? (x as { id?: string })?.id).filter(Boolean) : [])
  if (typeof data.title === 'string') return data.title
  if (Array.isArray(data.children)) return names(data.children).map((n) => humanize(String(n))).join(' · ')
  if (Array.isArray(data.factors)) return names(data.factors).map((n) => humanize(String(n))).join(' · ')
  if (Array.isArray(data.strategies)) return `${data.strategies.length} strategies: ${names(data.strategies).map((n) => humanize(String(n))).join(', ')}`
  if (Array.isArray(data.meta_prompts)) return `${data.meta_prompts.length} situations drafted`
  if (typeof data.meta_prompt === 'string') return data.meta_prompt
  if (typeof data.verdict === 'string') return `${humanize(data.verdict)}${typeof data.explanation === 'string' ? `: ${data.explanation}` : ''}`
  if (typeof data.plan === 'string') return data.plan
  return null
}

function ms(n: number | null) {
  if (n == null) return ''
  return n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`
}

function CallRow({ call }: { call: GeneratorCall }) {
  const [open, setOpen] = useState(false)
  const line = gist(call)
  return (
    <div className="border-b border-line/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-n-50"
        aria-expanded={open}
      >
        <span className="mt-[3px] grid size-3.5 shrink-0 place-items-center">
          {call.status === 'running' ? (
            <Spinner className="size-3.5 text-indigo-500" />
          ) : call.status === 'error' ? (
            <CircleAlert className="size-3.5 text-fail" />
          ) : (
            <Check className="size-3.5 text-pass" strokeWidth={2.5} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('truncate font-display text-[12.5px] font-medium', call.status === 'running' ? 'text-ink' : 'text-ink-2')}>
              {TASK_LABEL[call.task] ?? humanize(call.task)}
            </span>
            <span className="truncate font-mono text-[10.5px] text-ink-3">{shortModel(call.model)}</span>
          </span>
          {line && (
            <span className={cn('mt-0.5 block truncate text-[12px]', call.status === 'error' ? 'text-fail' : 'text-ink-3')}>
              <span className="mr-1 text-ink-3/70">⎿</span>
              {line}
            </span>
          )}
        </span>
        <span className="mt-[1px] flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-ink-3 tabular">
          {call.status === 'done' && (
            <span>
              {compact(call.input_tokens)}→{compact(call.output_tokens)}
            </span>
          )}
          <span className="w-10 text-right">{call.status === 'running' ? '…' : ms(call.duration_ms)}</span>
          <ChevronRight className={cn('size-3.5 transition-transform duration-200', open && 'rotate-90')} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
            <div className="grid gap-3 px-4 pt-1 pb-3.5 pl-10 lg:grid-cols-2">
              <Pre label={`Prompt · ${call.role} model`} text={call.prompt} />
              <Pre label="Response" text={call.status === 'running' ? 'Waiting for the model…' : call.status === 'error' ? (call.error ?? 'Failed') : call.output} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Pre({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow className="mb-1.5">{label}</Eyebrow>
      <pre className="scrollbar-thin max-h-[260px] overflow-auto rounded-lg border border-line bg-n-50 px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink-2">
        {text || '—'}
      </pre>
    </div>
  )
}

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since == null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [since])
  return since == null ? 0 : Math.max(0, Math.round((now - since) / 1000))
}

export function SimulaPanel({ status, calls, numScenarios, startedAt }: { status: RunStatus | null; calls: GeneratorCall[]; numScenarios?: number; startedAt?: string | null }) {
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const elapsed = useElapsed(startedAt ? new Date(startedAt).getTime() : null)

  const { done, running, tokens, phaseIdx, phaseCounts, scenarios } = useMemo(() => {
    const phaseCounts: Record<string, number> = {}
    let tokens = 0
    let phaseIdx = status === 'generating_scenarios' ? 0 : -1
    const scenarios: string[] = []
    for (const c of calls) {
      phaseCounts[c.phase] = (phaseCounts[c.phase] ?? 0) + 1
      tokens += c.input_tokens + c.output_tokens
      phaseIdx = Math.max(phaseIdx, PHASES.findIndex((p) => p.key === c.phase))
      if (c.task === 'generate' && c.status === 'done') {
        const t = (parseJson(c.output) as { title?: string } | null)?.title
        if (t) scenarios.push(t)
      }
    }
    return { done: calls.filter((c) => c.status === 'done').length, running: calls.filter((c) => c.status === 'running').length, tokens, phaseIdx, phaseCounts, scenarios }
  }, [calls, status])

  useLayoutEffect(() => {
    const el = log.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [calls])

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="flex min-h-[520px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <Eyebrow>Simula</Eyebrow>
            <div className="mt-1 font-display text-[16px] font-semibold tracking-[-0.01em]">
              {status === 'queued' ? 'Getting ready…' : `Generating ${numScenarios ?? ''} scenarios from your system prompt`}
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-ink-3 tabular">
            <span>
              <span className="font-display text-[14px] font-semibold text-ink">{done}</span> calls
            </span>
            {running > 0 && <span className="text-indigo-600">{running} in flight</span>}
            <span>{compact(tokens)} tokens</span>
            <span>{elapsed}s</span>
          </div>
        </div>

        {/* phases */}
        <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
          {PHASES.map((p, i) => {
            const state = phaseIdx > i ? 'done' : phaseIdx === i ? 'active' : 'todo'
            return (
              <div key={p.key} className="flex items-center gap-2 bg-surface px-4 py-2.5">
                <span
                  className={cn(
                    'grid size-[18px] shrink-0 place-items-center rounded-full border text-[10px]',
                    state === 'done' ? 'border-indigo-500 bg-indigo-500 text-white' : state === 'active' ? 'border-indigo-500 text-indigo-600' : 'border-line text-ink-3',
                  )}
                >
                  {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : state === 'active' ? <Spinner className="size-3" /> : <span className="font-mono">{i + 1}</span>}
                </span>
                <span className={cn('truncate font-display text-[12.5px] font-medium', state === 'todo' ? 'text-ink-3' : 'text-ink')}>{p.title}</span>
                {phaseCounts[p.key] ? <span className="ml-auto font-mono text-[10.5px] text-ink-3 tabular">{phaseCounts[p.key]}</span> : null}
              </div>
            )
          })}
        </div>

        {/* live call log */}
        <div
          ref={log}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
          }}
          className="scrollbar-thin max-h-[560px] min-h-0 flex-1 overflow-y-auto"
        >
          {calls.length === 0 ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2.5 text-center">
              <Spinner className="size-5 text-indigo-500" />
              <div className="font-display text-[13.5px] font-medium text-ink-2">Reading your system prompt</div>
              <div className="max-w-[360px] text-[12.5px] leading-relaxed text-ink-3">
                The first call maps the factors your prompt varies along. Every model call appears here as it happens; click one to see its prompt and response.
              </div>
            </div>
          ) : (
            calls.map((c) => <CallRow key={c.id} call={c} />)
          )}
        </div>
      </Card>

      <Card className="flex flex-col p-5">
        <Eyebrow>Drafts written</Eyebrow>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-[22px] font-semibold tabular">{scenarios.length}</span>
          {numScenarios != null && <span className="text-[12px] text-ink-3">{numScenarios} needed; extras let the critic drop weak ones</span>}
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {scenarios.slice(-12).map((t, i) => (
              <motion.div
                key={`${t}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="truncate rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] text-ink-2"
              >
                {t}
              </motion.div>
            ))}
          </AnimatePresence>
          {!scenarios.length && <p className="text-[12.5px] leading-relaxed text-ink-3">Drafts appear here as Simula writes them. A separate critic checks each one before it is kept.</p>}
        </div>
        <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
          When the set is ready, every conversation starts at once, each with its own simulated user.
        </p>
      </Card>
    </div>
  )
}
