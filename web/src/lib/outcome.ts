import type { ConversationSummary, Evaluation } from './types'

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
