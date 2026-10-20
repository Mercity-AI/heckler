import { isActive } from './format'
import type { ConversationSummary, Evaluation, RunSummary } from './types'

/**
 * How a graded conversation ended, from the policy owner's point of view. Any violation, however
 * small, means the agent did not hold its policy in that conversation.
 */
export type Outcome = 'breached' | 'violated' | 'held'

export function outcomeOf(c: { evaluation: Evaluation | null; summary?: ConversationSummary }): Outcome | null {
  const e = c.evaluation
  if (e) return e.broken ? 'breached' : e.policy_violations.length ? 'violated' : 'held'
  const s = c.summary
  if (!s || s.verdict == null) return null
  return s.broken ? 'breached' : s.violation_count ? 'violated' : 'held'
}

export function violationCount(c: { evaluation: Evaluation | null; summary?: ConversationSummary }): number {
  return c.evaluation ? c.evaluation.policy_violations.length : (c.summary?.violation_count ?? 0)
}

export const OUTCOME_LABEL: Record<Outcome, string> = { breached: 'Breached', violated: 'Violated', held: 'Held' }
export const OUTCOME_COLOR: Record<Outcome, string> = {
  breached: 'var(--color-crit)',
  violated: 'var(--color-fail)',
  held: 'var(--color-pass)',
}

export interface RunResult {
  text: string
  dot: string
  live?: boolean
}

/** Outcome of a run in a few words, and the colour of its dot. */
export function runResult(run: RunSummary): RunResult {
  if (isActive(run.status)) return { text: run.status === 'running' ? `In conversation, ${run.finished}/${run.total} done` : 'Writing scenarios', dot: 'bg-indigo-500', live: true }
  if (run.status === 'failed') return { text: run.error ? `Failed: ${run.error}` : 'Failed', dot: 'bg-n-400' }
  if (!run.evaluated) return { text: run.status === 'cancelled' ? 'Stopped' : 'No graded conversations', dot: 'bg-n-300' }
  const bad = Math.max(run.with_violations, run.broken)
  return bad ? { text: `Violated in ${bad} of ${run.evaluated}`, dot: 'bg-fail' } : { text: `Held in all ${run.evaluated}`, dot: 'bg-pass' }
}
