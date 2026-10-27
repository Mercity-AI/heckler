import type { GuardConnection, GuardDecision, Target } from './types'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

export const isOpenRouter = (url: string) => url.includes('openrouter.ai')

/** Where a guard runs, as the form's switch shows it. Derived from the row, never stored. */
export type GuardWhere = 'openrouter' | 'endpoint' | 'fake'

/** A guard row as the form edits it. `savedKey`: the server holds a key for it (the form never sees it). */
export interface GuardDraft {
  uid: string
  id?: string
  name: string
  kind: GuardConnection['kind']
  base_url: string
  model: string
  api_key: string
  savedKey: boolean
  /** As typed, 0–1. */
  threshold: string
}

export const whereOf = (g: GuardDraft): GuardWhere => (g.kind === 'fake' ? 'fake' : isOpenRouter(g.base_url) ? 'openrouter' : 'endpoint')

/**
 * Shortcuts for the model and endpoint fields. Each fills both fields; anything else can be typed in.
 * On OpenRouter: decision models it serves. Elsewhere: hosts of the System One API (`/v1/systemone`).
 */
export const GUARD_PICKS: Record<Exclude<GuardWhere, 'fake'>, { label: string; base_url: string; model: string }[]> = {
  openrouter: [
    { label: 'Jev 1.14', base_url: OPENROUTER_URL, model: 'typesafe/jev-1.14' },
    { label: 'Clef', base_url: OPENROUTER_URL, model: 'cloudflare/clef' },
    { label: 'Clef Flash', base_url: OPENROUTER_URL, model: 'cloudflare/clef-flash' },
  ],
  endpoint: [
    { label: 'TypeSafe (Jev)', base_url: 'https://api.typesafe.ai', model: 'jev-latest' },
    { label: 'Laya Studio', base_url: 'https://api.laya.studio', model: 'laya' },
  ],
}

let seq = 0
const uid = () => `g${++seq}`

export function guardDrafts(target?: Target): GuardDraft[] {
  return (target?.guards ?? []).map((g) => ({
    uid: uid(),
    id: g.id,
    name: g.name,
    kind: g.kind,
    base_url: g.base_url,
    model: g.model,
    api_key: '',
    savedKey: g.api_key === '***',
    threshold: String(g.threshold ?? 0.5),
  }))
}

export function newGuard(offline: boolean): GuardDraft {
  const base = { uid: uid(), name: '', api_key: '', savedKey: false, threshold: '0.5' }
  if (offline) return { ...base, kind: 'fake', base_url: '', model: 'offline-strict' }
  return { ...base, kind: 'systemone', base_url: OPENROUTER_URL, model: '' }
}

/** The row after switching where it runs: each place starts from its own sensible empty state. */
export function moveGuard(g: GuardDraft, where: GuardWhere): Partial<GuardDraft> {
  if (where === whereOf(g)) return {}
  if (where === 'fake') return { kind: 'fake', base_url: '', model: 'offline-strict' }
  if (where === 'openrouter') return { kind: 'systemone', base_url: OPENROUTER_URL, model: '' }
  return { kind: 'systemone', base_url: '', model: '' }
}

/** What a guard is called when its name is left blank: the model, without the maker. */
export function defaultGuardName(g: Pick<GuardDraft, 'kind' | 'model'>): string {
  if (g.kind === 'fake') return g.model === 'offline-lenient' ? 'Offline lenient guard' : 'Offline strict guard'
  return g.model.trim().split('/').pop()?.replace(/^~/, '') ?? ''
}

/**
 * The guards for the request body, or an error message for the first incomplete row. `sharedKey`: the
 * evaluator runs on OpenRouter with a key, which guards on OpenRouter use when they have none of their own.
 */
export function buildGuards(drafts: GuardDraft[], sharedKey: boolean): GuardConnection[] | string {
  const out: GuardConnection[] = []
  for (const [i, g] of drafts.entries()) {
    const name = g.name.trim() || defaultGuardName(g)
    const label = name || `guard ${i + 1}`
    if (!g.model.trim()) return `Which decision model is ${label}? Pick one or type any model id.`
    const threshold = Number(g.threshold)
    if (g.threshold.trim() === '' || !(threshold >= 0 && threshold <= 1)) return `The threshold for “${label}” must be between 0 and 1.`
    if (g.kind === 'systemone') {
      if (!g.base_url.trim()) return `Add the base URL for “${label}”.`
      if (!g.api_key && !g.savedKey && !(sharedKey && isOpenRouter(g.base_url))) return `Paste the API key for “${label}”.`
    }
    out.push({
      ...(g.id && { id: g.id }),
      name,
      kind: g.kind,
      base_url: g.kind === 'fake' ? '' : g.base_url.trim(),
      model: g.model.trim(),
      // "***" keeps a saved key; null on OpenRouter falls back to the evaluator's key
      api_key: g.kind === 'fake' ? null : g.api_key || (g.savedKey ? '***' : null),
      threshold,
    })
  }
  return out
}

/** The numbered rules of a guard policy, as the backend turns them into questions (rule_1, rule_2…). */
export function policyRules(policy: string | null | undefined): string[] {
  const rules: string[] = []
  for (const line of (policy ?? '').split('\n')) {
    const m = line.match(/^\s*\d+[.)]\s+(.*\S)/)
    if (m) rules.push(m[1])
    else if (rules.length && line.trim()) rules[rules.length - 1] += ` ${line.trim()}`
  }
  return rules
}

/** Why a decision model blocked or allowed a reply: the rule it scored highest (they give no reasoning of their own). */
export interface GuardReason {
  /** "rule 2", or "the policy" when only the overall question crossed the threshold. */
  label: string
  probability: number
  /** The rule's text from the policy, when known. */
  text: string | null
}

export function reasonOf(d: GuardDecision, rules: string[], threshold: number): GuardReason | null {
  const entries = Object.entries(d.rule_scores)
  if (!entries.length) return null
  const top = (list: [string, number][]) => list.reduce((a, b) => (b[1] > a[1] ? b : a))
  const ruleEntries = entries.filter(([k]) => k.startsWith('rule_'))
  const rule = ruleEntries.length ? top(ruleEntries) : null
  const overall = d.rule_scores.violates_policy
  // blocked on the overall question alone: no single rule reached the threshold
  if (d.flagged && overall != null && (!rule || rule[1] < threshold) && overall >= threshold) return { label: 'the policy', probability: overall, text: null }
  if (!rule) return overall != null ? { label: 'the policy', probability: overall, text: null } : null
  const n = Number(rule[0].slice(5))
  return { label: `rule ${n}`, probability: rule[1], text: rules[n - 1] ?? null }
}
