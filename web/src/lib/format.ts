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
  cancelled: 'Cancelled',
}

/** Fixed categorical order for attacker agents (validated: CVD ΔE ≥ 14 between neighbours). */
const AGENT_HUES = ['#5048e5', '#1f9e99', '#d9831a', '#7a5af0', '#3e3e4c']

export function agentColor(name: string): string {
  const letter = agentLetter(name)
  const idx = letter.charCodeAt(0) - 65
  return AGENT_HUES[idx >= 0 && idx < AGENT_HUES.length ? idx : AGENT_HUES.length - 1]
}

export function agentLetter(name: string): string {
  const m = name.match(/([A-Z])\s*$/)
  return m ? m[1] : name.charAt(0).toUpperCase()
}
