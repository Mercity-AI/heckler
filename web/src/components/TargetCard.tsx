import { useMutation } from '@tanstack/react-query'
import { Check, CircleAlert, Cloud, FlaskConical, Globe, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useSpotlight } from '../hooks/useSpotlight'
import { api } from '../lib/api'
import { cn } from '../lib/format'
import type { Target } from '../lib/types'
import { Button } from './ui/button'

export function connectionSummary(t: Target): { icon: ReactNode; label: string; detail: string } {
  const c = t.connection
  if (c.kind === 'openai_chat') {
    let host = c.base_url
    try {
      host = new URL(c.base_url).host
    } catch {
      /* keep raw */
    }
    return { icon: <Cloud className="size-3.5" />, label: c.model, detail: host }
  }
  if (c.kind === 'http') return { icon: <Globe className="size-3.5" />, label: 'HTTP endpoint', detail: c.url }
  return { icon: <FlaskConical className="size-3.5" />, label: 'Offline demo', detail: c.behavior === 'leaky' ? 'scripted · leaky' : 'scripted · compliant' }
}

export function ProbeButton({ target, size = 'sm' }: { target: Target; size?: 'sm' | 'md' }) {
  const probe = useMutation({ mutationFn: () => api.probeTarget(target.id) })
  const r = probe.data
  return (
    <div className="flex max-w-[320px] min-w-0 flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <Button size={size} variant="secondary" loading={probe.isPending} onClick={() => probe.mutate()} className="w-fit">
        {!probe.isPending && <Zap className="size-3.5" />}
        Test connection
      </Button>
      <AnimatePresence>
        {(r || probe.error) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            {r?.ok ? (
              <div className="rounded-lg border border-pass/20 bg-pass-soft/60 px-3 py-2 text-[12px]">
                <div className="flex items-center gap-1.5 font-medium text-pass">
                  <Check className="size-3.5" /> Replied in {r.latency_ms} ms
                </div>
                {r.reply && <p className="mt-1 line-clamp-3 leading-snug text-ink-2">“{r.reply}”</p>}
              </div>
            ) : (
              <div className="rounded-lg border border-fail/20 bg-fail-soft/60 px-3 py-2 text-[12px]">
                <div className="flex items-center gap-1.5 font-medium text-fail">
                  <CircleAlert className="size-3.5" /> Couldn’t reach it
                </div>
                <p className="mt-1 line-clamp-4 break-words leading-snug text-ink-2">{r?.error ?? (probe.error as Error)?.message}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TargetCard({ target, selected, onSelect }: { target: Target; selected: boolean; onSelect: () => void }) {
  const spot = useSpotlight<HTMLButtonElement>()
  const conn = connectionSummary(target)
  const rules = target.system_prompt.split('\n').filter((l) => /^\s*[-*•\d]/.test(l)).length
  return (
    <motion.button
      type="button"
      layout
      onClick={onSelect}
      onPointerMove={spot}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      aria-pressed={selected}
      className={cn(
        'spotlight group flex flex-col gap-3 rounded-2xl border bg-surface p-4 text-left transition-[border-color,box-shadow] duration-300',
        selected ? 'border-ink shadow-lift' : 'border-line shadow-card hover:border-line-2 hover:shadow-lift',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{target.name}</div>
          {target.description && <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{target.description}</div>}
        </div>
        <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border transition-all duration-200', selected ? 'border-ink bg-ink text-white' : 'border-line-2 text-transparent group-hover:border-n-400')}>
          <Check className="size-3" strokeWidth={3} />
        </span>
      </div>
      <p className="line-clamp-2 font-mono text-[11.5px] leading-relaxed text-ink-3">{target.system_prompt}</p>
      <div className="flex items-center gap-2 text-[11.5px] text-ink-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-n-100 px-1.5 py-0.5">
          {conn.icon}
          <span className="truncate font-mono">{conn.label}</span>
        </span>
        {rules > 0 && <span className="shrink-0 text-ink-3">{rules} rules</span>}
      </div>
    </motion.button>
  )
}
