import { AlertOctagon, Check, CircleSlash, X } from 'lucide-react'
import { motion } from 'motion/react'
import { cn, isActive, RUN_STATUS_LABEL } from '../lib/format'
import { OUTCOME_LABEL, type Outcome, type RunResult } from '../lib/outcome'
import type { ConversationStatus, RunStatus, Severity } from '../lib/types'

export function StatusDot({ status, className }: { status: RunStatus | ConversationStatus; className?: string }) {
  const live = isActive(status as RunStatus) || status === 'evaluating' || status === 'pending'
  const color =
    status === 'completed'
      ? 'bg-pass'
      : status === 'failed'
        ? 'bg-fail'
        : status === 'cancelled'
          ? 'bg-n-400'
          : status === 'pending' || status === 'queued'
            ? 'bg-n-300'
            : 'bg-indigo-500'
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {live && status !== 'pending' && status !== 'queued' && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-50', color)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  )
}

export function RunStatusPill({ status }: { status: RunStatus }) {
  const tone = isActive(status)
    ? 'bg-indigo-100 text-indigo-700'
    : status === 'completed'
      ? 'bg-pass-soft text-pass'
      : status === 'failed'
        ? 'bg-fail-soft text-fail'
        : 'bg-n-100 text-ink-3'
  return (
    <motion.span layout className={cn('inline-flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-2 font-display text-[12px] font-medium', tone)}>
      <StatusDot status={status} />
      {RUN_STATUS_LABEL[status]}
    </motion.span>
  )
}

/** Outcome with icon + label, so state never relies on colour alone. Any violation means not held. */
export function OutcomeBadge({ outcome, size = 'md' }: { outcome: Outcome | null; size?: 'sm' | 'md' }) {
  if (!outcome) return null
  const config = {
    breached: { icon: AlertOctagon, cls: 'bg-crit text-white' },
    violated: { icon: X, cls: 'bg-fail-soft text-fail' },
    held: { icon: Check, cls: 'bg-pass-soft text-pass' },
  }[outcome]
  const Icon = config.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md font-display font-semibold whitespace-nowrap', size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]', config.cls)}>
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2.5} />
      {OUTCOME_LABEL[outcome]}
    </span>
  )
}

const SEVERITY: Record<Severity, { label: string; cls: string; bars: number }> = {
  low: { label: 'Low', cls: 'text-ink-3', bars: 1 },
  medium: { label: 'Medium', cls: 'text-warn', bars: 2 },
  high: { label: 'High', cls: 'text-fail', bars: 3 },
  critical: { label: 'Critical', cls: 'text-crit', bars: 4 },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity] ?? SEVERITY.medium
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-wider', s.cls)}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-[1px]', i < s.bars ? 'bg-current' : 'bg-n-200')} style={{ height: 4 + i * 2 }} />
        ))}
      </span>
      {s.label}
    </span>
  )
}

/** Score 0–100 as a ring; the arc reads as status (red below 50, amber below 75, green otherwise). */
export function ScoreRing({ value, size = 44, stroke = 4, className }: { value: number | null; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100
  const color = value == null ? 'var(--color-n-300)' : value < 50 ? 'var(--color-fail)' : value < 75 ? 'var(--color-warn)' : 'var(--color-pass)'
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-n-100)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute font-display font-semibold tabular text-ink" style={{ fontSize: size * 0.32 }}>
        {value == null ? '–' : Math.round(value)}
      </span>
    </span>
  )
}

export function CancelledMark() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-n-100 px-1.5 font-display text-[11px] font-semibold text-ink-3">
      <CircleSlash className="size-3" /> Stopped
    </span>
  )
}

export function RunResultDot({ result }: { result: RunResult }) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {result.live && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-50', result.dot)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', result.dot)} />
    </span>
  )
}
