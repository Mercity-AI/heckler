import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RunStatus } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function pct(rate: number | null | undefined, digits = 0): string {
  if (rate == null) return '–'
  return `${(rate * 100).toFixed(digits)}%`
}

export function score(value: number | null | undefined): string {
  if (value == null) return '–'
  return Math.round(value).toString()
}

export function compact(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function duration(startIso: string | null | undefined, endIso?: string | null): string {
  if (!startIso) return ''
  const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** snake_case / kebab → "Sentence case". */
export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const ACTIVE_STATUSES: RunStatus[] = ['queued', 'generating_scenarios', 'running']
export const isActive = (s: RunStatus | null | undefined) => !!s && ACTIVE_STATUSES.includes(s)

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued',
  generating_scenarios: 'Mapping scenarios',
  running: 'In conversation',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const END_REASON_LABEL: Record<string, string> = {
  attacker_ended: 'Evaluator ended the chat',
  max_turns: 'Reached turn limit',
  target_error: 'Target errored',
  attacker_error: 'Evaluator errored',
  attacker_stalled: 'Evaluator stopped early',
  cancelled: 'Cancelled',
}

/** Conversations are numbered, never named: "#01", "#02", … */
export function convLabel(index: number): string {
  return `#${String(index + 1).padStart(2, '0')}`
}

/** Last path segment of a model id: "anthropic/claude-haiku-5.5" → "claude-haiku-5.5". */
export function shortModel(model: string | null | undefined): string {
  return model ? (model.split('/').pop() ?? model) : ''
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}
