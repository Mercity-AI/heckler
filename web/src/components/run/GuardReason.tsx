import { guardTone } from '../../lib/guardMeta'
import { reasonOf } from '../../lib/guards'
import { cn } from '../../lib/format'
import type { GuardDecision } from '../../lib/types'

/**
 * Why a decision model blocked or allowed a reply, e.g. `Blocked · rule 2 (0.91): "The reply must not…"`.
 * Decision models return no reasoning, so the reason is the rule they scored highest.
 */
export function GuardReasonLine({ d, rules, threshold, className }: { d: GuardDecision; rules: string[]; threshold: number; className?: string }) {
  const t = guardTone(d)
  const reason = d.error ? null : reasonOf(d, rules, threshold)
  return (
    <div className={cn('flex flex-col gap-1 text-[12.5px] leading-snug', className)}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10.5px] font-medium', t.cls)}>
          {t.icon}
          {t.label}
        </span>
        {reason && (
          <span className="text-ink-2">
            · {d.flagged ? '' : 'highest: '}
            <span className="font-medium text-ink">{reason.label}</span> <span className="font-mono text-[11.5px] tabular">({reason.probability.toFixed(2)})</span>
            {reason.text ? ':' : ''}
          </span>
        )}
      </div>
      {d.error ? <p className="text-fail">{d.error}</p> : reason?.text && <p className="text-ink-3">“{reason.text}”</p>}
    </div>
  )
}

/** Hover text for a guard's chip under a reply, styled for the dark tooltip. */
export function GuardReasonTooltip({ d, rules, threshold }: { d: GuardDecision; rules: string[]; threshold: number }) {
  if (d.error)
    return (
      <span className="block">
        <span className="font-semibold">{d.guard_name}</span> couldn’t check this reply
        <span className="mt-1 block text-white/70">{d.error}</span>
      </span>
    )
  const reason = reasonOf(d, rules, threshold)
  return (
    <span className="block">
      <span className="font-semibold">{d.guard_name}</span> {d.flagged ? 'blocked' : 'allowed'} this reply
      {reason && (
        <span className="mt-1 block text-white/90">
          {d.flagged ? 'On ' : 'Highest score: '}
          {reason.label} · <span className="font-mono tabular">{reason.probability.toFixed(2)}</span>
          <span className="text-white/60"> (blocks at ≥ {threshold})</span>
        </span>
      )}
      {reason?.text && <span className="mt-1 block text-white/65">“{reason.text}”</span>}
    </span>
  )
}
