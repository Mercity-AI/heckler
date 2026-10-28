// Mirrors src/heckler/domain/models.py and src/heckler/api/schemas.py.

export type RunStatus = 'queued' | 'generating_scenarios' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ConversationStatus = 'pending' | 'running' | 'evaluating' | 'completed' | 'failed' | 'cancelled'
export type EndReason = 'attacker_ended' | 'max_turns' | 'target_error' | 'attacker_error' | 'attacker_stalled' | 'cancelled'
export type Verdict = 'pass' | 'partial' | 'fail'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface ModelSpec {
  provider: string
  model: string
  max_tokens: number
  temperature: number | null
}

export interface OpenAIChatConnection {
  kind: 'openai_chat'
  base_url: string
  model: string
  api_key?: string | null
  headers?: Record<string, string>
  send_system_prompt?: boolean
  temperature?: number | null
  max_tokens?: number
}

export interface HttpConnection {
  kind: 'http'
  url: string
  headers?: Record<string, string>
  messages_field?: string
  response_path?: string
  send_system_prompt?: boolean
  extra_body?: Record<string, unknown>
}

export interface FakeConnection {
  kind: 'fake'
  behavior: 'compliant' | 'leaky'
}

export type TargetConnection = OpenAIChatConnection | HttpConnection | FakeConnection

/** The model that plays the simulated users and grades each conversation (OpenAI-compatible). */
export interface EvaluatorConnection {
  base_url: string
  model: string
  /** "***" when a key is stored; send "***" back to keep it. */
  api_key?: string | null
  /** Drives Simula's scenario generation on the same endpoint; defaults to `model`. */
  scenario_model?: string | null
  max_tokens?: number
  temperature?: number | null
}

/**
 * A decision model (Jev, Clef, Laya…) that screens each agent reply against the guard policy: through
 * OpenRouter's Decisions API, or any endpoint serving `POST {base_url}/v1/systemone`.
 */
export interface GuardConnection {
  id?: string
  name: string
  /** 'fake': a scripted offline guard for the demo. */
  kind: 'systemone' | 'fake'
  base_url: string
  model: string
  /** "***" when a key is stored; send "***" back to keep it. null on OpenRouter: uses the evaluator's OpenRouter key. */
  api_key?: string | null
  /** Blocks when the highest probability across its questions reaches this. */
  threshold?: number
}

export interface GuardInfo {
  id: string
  name: string
  model: string
  threshold: number
}

export interface Target {
  id: string
  name: string
  description: string | null
  system_prompt: string
  connection: TargetConnection
  evaluator: EvaluatorConnection | null
  guards: (GuardConnection & { id: string })[]
  guard_policy: string | null
  created_at: string
}

export interface TargetCreate {
  name: string
  description?: string | null
  system_prompt: string
  connection: TargetConnection
  evaluator?: EvaluatorConnection | null
  guards?: GuardConnection[]
  guard_policy?: string | null
}

export interface GuardProbeResult extends ProbeResult {
  guard_id: string
  name: string
  /** Its call on a harmless sample reply: anything but false is worth a look. */
  flagged: boolean | null
}

export interface ConnectionTestResult {
  target: ProbeResult
  evaluator: ProbeResult | null
  guards: GuardProbeResult[]
}

export interface ProbeResult {
  ok: boolean
  reply: string | null
  error: string | null
  latency_ms: number
}

export interface TaxonomyMixEntry {
  factor: string
  node: string
  level: number
  path: string[]
  description: string
}

export interface Scenario {
  id: string
  title: string
  category: string
  persona: string
  emotional_state: string
  context: string
  goal: string
  tactics: string[]
  policy_focus: string
  expected_behavior: string
  difficulty: Difficulty
  taxonomy_mix: TaxonomyMixEntry[]
  source: 'simula' | 'manual'
}

export interface TranscriptMessage {
  role: 'attacker' | 'target'
  content: string
  turn: number
  created_at: string
}

export interface Violation {
  rule: string
  evidence: string
  severity: Severity
  /** Plain-language account of what went wrong (empty on older reports). */
  explanation?: string
}

export interface Evaluation {
  score: number
  verdict: Verdict
  broken: boolean
  policy_violations: Violation[]
  dimension_scores: Record<string, number>
  escalation_appropriate: boolean | null
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  summary: string
}

/** One guard's call on one agent reply. */
export interface GuardDecision {
  guard_id: string
  guard_name: string
  turn: number
  /** true: would have blocked the reply. null: the call failed. */
  flagged: boolean | null
  /** Highest probability across its questions, compared with the threshold. */
  probability: number | null
  /** "rule_1" | "rule_2" | … → probability the reply breaks that rule ("violates_policy" on older runs). */
  rule_scores: Record<string, number>
  /** Numbers of the rules at or above the threshold. */
  violated_rules: string[]
  latency_ms: number
  input_tokens: number
  output_tokens: number
  /** USD, when the endpoint reports it (OpenRouter does). */
  cost: number | null
  error: string | null
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  calls: number
}

export interface Conversation {
  id: string
  run_id: string
  index: number
  agent_name: string
  scenario: Scenario
  status: ConversationStatus
  messages: TranscriptMessage[]
  end_reason: EndReason | null
  evaluation: Evaluation | null
  error: string | null
  attacker_usage: Usage
  guard_decisions: GuardDecision[]
  started_at: string | null
  finished_at: string | null
}

export interface RunConfig {
  num_scenarios: number
  max_turns: number
  /** null: every conversation runs in parallel. */
  concurrency: number | null
  focus: string | null
  reuse_scenarios_from_run_id: string | null
  scenarios: Scenario[] | null
  /** Which of the agent's guards screen the run. null: all of them. */
  guard_ids?: string[] | null
}

export interface GroupStats {
  conversations: number
  evaluated: number
  passed: number
  broken: number
  with_violations: number
  mean_score: number | null
}

/** How one guard did against the evaluator's grades. Conversation level unless prefixed `turn_`. */
export interface GuardStats {
  guard_id: string
  name: string
  model: string
  screened: number
  flagged_replies: number
  errors: number
  tp: number
  fp: number
  fn: number
  tn: number
  precision: number | null
  recall: number | null
  f1: number | null
  accuracy: number | null
  false_positive_rate: number | null
  turn_tp: number
  turn_fp: number
  turn_fn: number
  turn_tn: number
  turn_precision: number | null
  turn_recall: number | null
  /** Violating chats where it blocked the first violating reply (or earlier). */
  stopped: number
  stoppable: number
  stop_rate: number | null
  /** Threshold-free: chance a violating chat scores above a clean one. */
  auc: number | null
  /** The threshold that would have maximised conversation-level F1, and that F1. */
  best_threshold: number | null
  best_f1: number | null
  mean_latency_ms: number | null
  usage: Usage
  /** USD, summed over calls whose endpoint reported a cost. */
  cost: number | null
}

export interface RunStats {
  total: number
  finished: number
  evaluated: number
  errored: number
  passed: number
  partial: number
  failed: number
  broken: number
  with_violations: number
  mean_score: number | null
  pass_rate: number | null
  break_rate: number | null
  violation_rate: number | null
  dimension_means: Record<string, number>
  severity_counts: Record<string, number>
  by_category: Record<string, GroupStats>
  attacker_usage: Usage
  guards?: Record<string, GuardStats>
}

export interface RunSummary {
  id: string
  target_id: string
  target_name: string
  status: RunStatus
  created_at: string
  finished_at: string | null
  total: number
  finished: number
  evaluated: number
  passed: number
  with_violations: number
  broken: number
  mean_score: number | null
  pass_rate: number | null
  break_rate: number | null
  violation_rate: number | null
  error: string | null
}

export interface ConversationSummary {
  id: string
  index: number
  agent_name: string
  status: ConversationStatus
  scenario_title: string
  scenario_category: string
  difficulty: Difficulty
  message_count: number
  end_reason: EndReason | null
  score: number | null
  verdict: Verdict | null
  broken: boolean | null
  violation_count: number
  error: string | null
}

export interface RunDetail {
  id: string
  target_id: string
  target_name: string
  status: RunStatus
  config: RunConfig
  stats: RunStats
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  example: boolean
  is_active: boolean
  guards: GuardInfo[]
  guard_policy: string | null
  conversations: ConversationSummary[]
}

export interface RunCreate extends Partial<RunConfig> {
  target_id: string
}

export interface ExampleRunCreate {
  name: string
  description?: string | null
  system_prompt: string
  num_scenarios?: number
  max_turns?: number
}

export interface PublicConfig {
  defaults: { max_turns: number }
  limits: { max_turns: number; concurrency: number; num_scenarios: number }
  suggested_evaluator: { base_url: string; model: string; scenario_model: string }
  example_run_id: string | null
}

export interface TaxonomyNode {
  name: string
  description: string
  weight?: number
  level: number
  path?: string[]
  children: TaxonomyNode[]
}

export interface Taxonomy {
  description?: string
  factors: TaxonomyNode[]
}

/** One model call Simula made while generating scenarios. Sent at start (running) and end (done/error). */
export interface GeneratorCall {
  id: number
  task: string
  phase: string
  role: string
  model: string
  status: 'running' | 'done' | 'error'
  started_at: number
  duration_ms: number | null
  input_tokens: number
  output_tokens: number
  prompt: string
  output: string
  error: string | null
}

export interface ScenarioProgress {
  phase: 'taxonomy' | 'strategies' | 'meta_prompts' | 'generating' | string
  calls: number
  detail: string | null
  call?: GeneratorCall | null
}

export interface RunEvent<T = Record<string, unknown>> {
  seq: number
  type: string
  run_id: string
  data: T
  created_at: string
}
