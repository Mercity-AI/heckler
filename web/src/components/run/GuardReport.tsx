import { ArrowRight } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { violationTurns } from '../../lib/evidence'
import { cn, compact, convLabel, pct, shortModel } from '../../lib/format'
import { reasonOf } from '../../lib/guards'
import { outcomeOf } from '../../lib/outcome'
import type { GuardInfo, GuardStats } from '../../lib/types'
import { Sheet } from '../ui/overlay'
import { Eyebrow, Meter } from '../ui/primitives'

// Below this many chats a percentage swings too much on one chat to mean anything; show the count alone.
const MIN_FOR_PERCENT = 10

const usd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`

/** A headline number in words: "4 of 4", the plain meaning under it, a percentage once the sample is big enough. */
export function Headline({ label, n, of, sub, tone }: { label: string; n: number; of: number; sub: string; tone: 'pass' | 'warn' | 'indigo' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11.5px] font-medium text-ink-2">{label}</span>
      <div className="flex items-baseline gap-1.5">
        {of ? (
          <>
            <span className="font-display text-[24px] leading-none font-semibold tracking-[-0.02em] tabular">{n}</span>
            <span className="text-[13px] text-ink-3 tabular">of {of}</span>
            {of >= MIN_FOR_PERCENT && <span className="ml-auto text-[12px] font-medium text-ink-2 tabular">{pct(n / of)}</span>}
          </>
        ) : (
          <span className="font-display text-[24px] leading-none font-semibold text-ink-3">–</span>
        )}
      </div>
      <Meter value={of ? n / of : 0} tone={tone} />
      <span className="text-[11.5px] leading-snug text-ink-3">{sub}</span>
    </div>
  )
}

/** The four numbers that say how a guard did, shared by its card and its report. */
export function Headlines({ s }: { s: GuardStats }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-5">
      <Headline label="Caught" n={s.tp} of={s.tp + s.fn} tone="pass" sub="Chats where your agent broke a rule that it blocked." />
      <Headline label="Stopped in time" n={s.stopped} of={s.stoppable} tone="pass" sub="Blocked before the user saw the violation." />
      <Headline label="Wrongly blocked" n={s.fp} of={s.fp + s.tn} tone="warn" sub="Chats where your agent was fine that it blocked anyway." />
      <Headline label="Right when it blocked" n={s.tp} of={s.tp + s.fp} tone="indigo" sub="Chats it blocked that really broke a rule." />
    </div>
  )
}

export function Matrix({ s }: { s: GuardStats }) {
  const cell = (n: number, label: string, tone: string) => (
    <div className={cn('flex flex-col items-center justify-center rounded-lg py-2', tone)}>
      <span className="font-display text-[16px] font-semibold tabular">{n}</span>
      <span className="text-[10.5px]">{label}</span>
    </div>
  )
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-1.5 text-[11px] text-ink-3">
      <span />
      <span className="text-center">Blocked</span>
      <span className="text-center">Allowed</span>
      <span className="pr-1 text-right">Violated</span>
      {cell(s.tp, 'caught', 'bg-pass-soft text-pass')}
      {cell(s.fn, 'missed', 'bg-fail-soft text-fail')}
      <span className="pr-1 text-right">Held</span>
      {cell(s.fp, 'false alarm', 'bg-warn-soft text-warn')}
      {cell(s.tn, 'clear', 'bg-n-100 text-ink-2')}
    </div>
  )
}

/** One row of a report section: the number, then what it means in a line. */
function Detail({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 py-2.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span className="text-right font-display text-[14px] font-semibold text-ink tabular">{value}</span>
      <span className="col-span-2 text-[12px] leading-snug text-ink-3">{children}</span>
    </div>
  )
}

function ReportSection({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
      <div>
        <h3 className="font-display text-[14px] font-semibold tracking-[-0.01em]">{title}</h3>
        {sub && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

type Pick = { c: LiveConversation; note: string }

/** Chats worth reading for this guard, and which rules it blocked on. Built from the transcripts the page already has. */
function useReportData(conversations: LiveConversation[], guard: GuardInfo, rules: string[]) {
  return useMemo(() => {
    const missed: Pick[] = []
    const late: Pick[] = []
    const wrong: Pick[] = []
    const byRule = new Map<string, { label: string; text: string | null; count: number }>()
    for (const c of conversations) {
      const mine = c.guard_decisions.filter((d) => d.guard_id === guard.id).sort((a, b) => a.turn - b.turn)
      for (const d of mine) {
        if (!d.flagged) continue
        const r = reasonOf(d, rules, guard.threshold)
        if (!r) continue
        const entry = byRule.get(r.label) ?? { label: r.label, text: r.text, count: 0 }
        entry.count += 1
        byRule.set(r.label, entry)
      }
      const outcome = outcomeOf(c)
      if (!outcome || !mine.length) continue
      const first = mine.find((d) => d.flagged)
      const why = first ? reasonOf(first, rules, guard.threshold) : null
      const blockedAt = first ? `blocked at turn ${first.turn}${why ? ` on ${why.label} (${why.probability.toFixed(2)})` : ''}` : ''
      if (outcome === 'held') {
        if (first) wrong.push({ c, note: `Your agent held its policy, but it ${blockedAt}.` })
        continue
      }
      if (!first) {
        const top = Math.max(...mine.map((d) => d.probability ?? 0))
        missed.push({ c, note: `Allowed every reply; its highest score was ${top.toFixed(2)}.` })
        continue
      }
      const bad = violationTurns(c.messages, c.evaluation?.policy_violations ?? [])
      const firstBad = bad.size ? Math.min(...bad) : null
      if (firstBad != null && first.turn > firstBad) late.push({ c, note: `The first violation was at turn ${firstBad}; it only ${blockedAt}.` })
    }
    const rulesBlocked = [...byRule.values()].sort((a, b) => b.count - a.count)
    return { missed, late, wrong, rulesBlocked }
  }, [conversations, guard, rules])
}

function ChatList({ items, empty, onOpen }: { items: Pick[]; empty: string; onOpen: (id: string) => void }) {
  if (!items.length) return <p className="py-1 text-[12.5px] text-ink-3">{empty}</p>
  return (
    <div className="flex flex-col divide-y divide-line">
      {items.map(({ c, note }) => (
        <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="group flex items-start gap-3 py-2.5 text-left">
          <span className="w-9 shrink-0 pt-0.5 font-mono text-[11.5px] text-ink-3">{convLabel(c.index)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{c.scenario?.title ?? c.summary?.scenario_title}</span>
            <span className="block text-[12px] leading-snug text-ink-3">{note}</span>
          </span>
          <ArrowRight className="mt-1 size-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
        </button>
      ))}
    </div>
  )
}

/** The full report for one guard model, opened from its card. */
export function GuardReport({
  stats: s,
  guard,
  conversations,
  rules,
  onOpenConversation,
  onClose,
}: {
  stats: GuardStats | null
  guard: GuardInfo | null
  conversations: LiveConversation[]
  rules: string[]
  onOpenConversation: (id: string) => void
  onClose: () => void
}) {
  return (
    <Sheet
      open={!!s && !!guard}
      onOpenChange={(o) => !o && onClose()}
      title={s ? `${s.name} report` : 'Guard report'}
      className="w-[min(760px,calc(100vw-1rem))]"
      header={
        s &&
        guard && (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pr-6">
            <div className="min-w-0">
              <Eyebrow>Guard model report</Eyebrow>
              <div className="mt-1 font-display text-[19px] font-semibold tracking-[-0.01em]">{s.name}</div>
              <div className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                {shortModel(s.model)} · blocks at ≥ {guard.threshold}
              </div>
            </div>
            <div className="text-right text-[12px] leading-snug text-ink-3 tabular">
              {s.cost != null && <div className="font-medium text-ink-2">{usd(s.cost)}</div>}
              {s.mean_latency_ms != null && <div>{Math.round(s.mean_latency_ms)} ms per reply</div>}
            </div>
          </div>
        )
      }
    >
      {s && guard && <ReportBody s={s} guard={guard} conversations={conversations} rules={rules} onOpenConversation={onOpenConversation} />}
    </Sheet>
  )
}

function ReportBody({
  s,
  guard,
  conversations,
  rules,
  onOpenConversation,
}: {
  s: GuardStats
  guard: GuardInfo
  conversations: LiveConversation[]
  rules: string[]
  onOpenConversation: (id: string) => void
}) {
  const { missed, late, wrong, rulesBlocked } = useReportData(conversations, guard, rules)
  const violating = s.tp + s.fn
  const clean = s.fp + s.tn
  const maxRule = Math.max(1, ...rulesBlocked.map((r) => r.count))
  const summary = [
    violating ? `Caught ${s.tp} of ${violating} chat${violating === 1 ? '' : 's'} where your agent broke a rule` : 'No chat in this run broke a rule',
    s.stoppable ? `, and stopped ${s.stopped} of them before the user saw the violation.` : '.',
    clean ? ` It wrongly blocked ${s.fp} of ${clean} chat${clean === 1 ? '' : 's'} where your agent was fine.` : '',
  ].join('')

  return (
    <div className="scrollbar-thin h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4">
        <p className="font-serif text-[16.5px] leading-[1.55] text-ink">{summary}</p>

        <ReportSection title="At a glance">
          <div className="pt-2">
            <Headlines s={s} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Eyebrow>Against the evaluator · {violating + clean} graded chats</Eyebrow>
            <Matrix s={s} />
          </div>
          {(violating < 5 || clean < 5) && violating + clean > 0 && (
            <p className="mt-3 rounded-lg bg-n-50 px-3 py-2 text-[12px] leading-snug text-ink-3">
              Only {violating} chat{violating === 1 ? '' : 's'} with a violation and {clean} without in this run, so one chat moves these numbers a lot. Run more conversations for a steadier read.
            </p>
          )}
        </ReportSection>

        <ReportSection title="Chats to look at" sub="Click one to open the conversation.">
          <Eyebrow className="mt-2">Missed · {missed.length}</Eyebrow>
          <ChatList items={missed} empty="It blocked something in every chat where your agent broke a rule." onOpen={onOpenConversation} />
          <Eyebrow className="mt-3">Caught too late · {late.length}</Eyebrow>
          <ChatList items={late} empty="Whenever it caught a violation, it blocked the first violating reply." onOpen={onOpenConversation} />
          <Eyebrow className="mt-3">Wrongly blocked · {wrong.length}</Eyebrow>
          <ChatList items={wrong} empty="It never blocked a chat where your agent was fine." onOpen={onOpenConversation} />
        </ReportSection>

        <ReportSection title="What it blocked on" sub="Decision models give no reasoning, so this is the rule each blocked reply scored highest on.">
          {rulesBlocked.length ? (
            <div className="flex flex-col gap-2.5 pt-2">
              {rulesBlocked.map((r) => (
                <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
                  <span className="text-[12.5px] text-ink-2">
                    <span className="font-medium text-ink">{r.label}</span>
                    {r.text && <span className="text-ink-3"> · {r.text}</span>}
                  </span>
                  <span className="text-right font-display text-[13px] font-semibold tabular">{r.count}</span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-n-100">
                    <div className="h-full rounded-full bg-fail/70" style={{ width: `${(r.count / maxRule) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-1 text-[12.5px] text-ink-3">It didn’t block any reply.</p>
          )}
        </ReportSection>

        <ReportSection title="Comparing models" sub="Independent of the threshold you set, so models can be compared fairly.">
          <div className="flex flex-col divide-y divide-line">
            <Detail label="AUC" value={pct(s.auc)}>
              How well its scores separate chats with a violation from clean ones, at any threshold. 50% is a coin flip, 100% is perfect. Needs both kinds of chat.
            </Detail>
            <Detail label="Best threshold in this run" value={s.best_threshold == null ? '–' : `≥ ${s.best_threshold.toFixed(2)}`}>
              Where it would have scored best (F1 {pct(s.best_f1)}, vs {pct(s.f1)} at {guard.threshold}). Set it on the guard for the next run.
            </Detail>
            <Detail label="F1 · accuracy" value={`${pct(s.f1)} · ${pct(s.accuracy)}`}>
              F1 balances caught against right-when-blocked; accuracy is the share of chats it called right.
            </Detail>
          </div>
        </ReportSection>

        <ReportSection title="Reply by reply" sub="Every reply it checked, not just whole chats.">
          <div className="flex flex-col divide-y divide-line">
            <Detail label="Replies blocked" value={`${s.flagged_replies} of ${s.screened}`}>
              Every reply it checked, across all chats.
            </Detail>
            <Detail label="Violating replies caught" value={`${s.turn_tp} of ${s.turn_tp + s.turn_fn}`}>
              Replies where the evaluator quoted a violation, that it blocked ({pct(s.turn_recall)}).
            </Detail>
            <Detail label="Blocked replies that were violations" value={`${s.turn_tp} of ${s.turn_tp + s.turn_fp}`}>
              Of the replies it blocked, how many the evaluator quoted as a violation ({pct(s.turn_precision)}). Low means it also blocks harmless replies.
            </Detail>
          </div>
        </ReportSection>

        <ReportSection title="Usage">
          <div className="flex flex-col divide-y divide-line">
            <Detail label="Cost" value={s.cost != null ? usd(s.cost) : '–'}>
              {compact(s.usage.input_tokens)} input tokens over {s.screened} calls{s.mean_latency_ms != null ? `, ${Math.round(s.mean_latency_ms)} ms each on average` : ''}.
            </Detail>
            {s.errors > 0 && (
              <Detail label="Failed calls" value={<span className="text-fail">{s.errors}</span>}>
                Calls that errored, counted as neither blocked nor allowed.
              </Detail>
            )}
          </div>
        </ReportSection>
      </div>
    </div>
  )
}
