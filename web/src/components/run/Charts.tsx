import { motion } from 'motion/react'
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { violationTurns } from '../../lib/evidence'
import { cn, convLabel, humanize } from '../../lib/format'
import { OUTCOME_COLOR, OUTCOME_LABEL, outcomeOf } from '../../lib/outcome'
import type { Difficulty } from '../../lib/types'

/*
 * Small SVG charts for the Insights tab. Conventions (see the dataviz skill): thin marks, 4px rounded
 * data ends, 2px surface ring on dots, hairline solid gridlines, text in ink tokens (never series
 * colour), status colours only for outcomes.
 */

const EASE = [0.22, 1, 0.36, 1] as const
const SURFACE = 'var(--color-surface)'
const GRID = 'var(--color-n-100)'
const AXIS = 'var(--color-ink-3)'

/** Width of an element via a callback ref, so charts that mount their container late still measure. */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w] as const
}

type Tip = { x: number; y: number; content: ReactNode } | null

/** Hover label above a point. Near either edge it anchors to that side so it never spills out of the card. */
function ChartTip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null
  const anchor = width && tip.x > width - 140 ? 'right' : tip.x < 140 ? 'left' : 'center'
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-20 w-max max-w-[260px] -translate-y-[calc(100%+10px)] rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-pop',
        anchor === 'center' && '-translate-x-1/2',
        anchor === 'right' && '-translate-x-[calc(100%-12px)]',
        anchor === 'left' && '-translate-x-3',
      )}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  )
}

function scoreOf(c: LiveConversation) {
  return c.evaluation?.score ?? c.summary?.score ?? null
}
function outcomeTone(c: LiveConversation): { color: string; label: string } {
  const o = outcomeOf(c) ?? 'held'
  return { color: OUTCOME_COLOR[o], label: OUTCOME_LABEL[o] }
}

export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2">
      {swatch}
      {children}
    </span>
  )
}
const Dot = ({ color }: { color: string }) => <span className="size-2 rounded-full" style={{ backgroundColor: color }} />

function TipBody({ c, extra }: { c: LiveConversation; extra: ReactNode }) {
  return (
    <span>
      <span className="font-mono font-medium">{convLabel(c.index)}</span>{' '}
      · {extra}
      <br />
      <span className="text-white/65">{c.scenario?.title ?? c.summary?.scenario_title}</span>
    </span>
  )
}

/* ----------------------------------------------------------------------------------- histogram */

/** How graded scores spread across 0–100, in tens. Bars wear the band they fall in. */
export function ScoreHistogram({ conversations }: { conversations: LiveConversation[] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>(null)
  const bins = useMemo(() => {
    const b = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, n: 0 }))
    for (const c of conversations) {
      const s = scoreOf(c)
      if (s != null) b[Math.min(9, Math.floor(s / 10))].n++
    }
    return b
  }, [conversations])
  const max = Math.max(1, ...bins.map((b) => b.n))
  const H = 170
  const m = { l: 8, r: 8, t: 18, b: 22 }
  const iw = Math.max(0, w - m.l - m.r)
  const ih = H - m.t - m.b
  const slot = iw / 10
  const bw = Math.min(24, slot - 6)
  const color = (from: number) => (from < 40 ? 'var(--color-fail)' : from < 70 ? 'var(--color-warn)' : 'var(--color-pass)')

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={H} className="block">
          <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="var(--color-line)" />
          {bins.map((b, i) => {
            const h = (b.n / max) * ih
            const cx = m.l + slot * i + slot / 2
            const x0 = cx - bw / 2
            const top = m.t + ih - h
            return (
              <g key={b.from} onPointerEnter={() => setTip({ x: cx, y: top, content: `Scores ${b.from}–${b.from + 9}: ${b.n} chat${b.n === 1 ? '' : 's'}` })}>
                <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
                {b.n > 0 && (
                  <>
                    <motion.path
                      d={`M${x0},${m.t + ih} V${top + 4} Q${x0},${top} ${x0 + 4},${top} H${x0 + bw - 4} Q${x0 + bw},${top} ${x0 + bw},${top + 4} V${m.t + ih} Z`}
                      fill={color(b.from)}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      style={{ transformOrigin: `${cx}px ${m.t + ih}px` }}
                      transition={{ duration: 0.6, delay: i * 0.03, ease: EASE }}
                    />
                    <text x={cx} y={top - 5} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)" className="font-display font-semibold">
                      {b.n}
                    </text>
                  </>
                )}
                {i % 2 === 0 && (
                  <text x={m.l + slot * i} y={H - 6} fontSize={10} fill={AXIS} className="font-mono">
                    {b.from}
                  </text>
                )}
              </g>
            )
          })}
          <text x={m.l + iw} y={H - 6} fontSize={10} fill={AXIS} textAnchor="end" className="font-mono">
            100
          </text>
        </svg>
      )}
      <ChartTip tip={tip} width={w} />
    </div>
  )
}

/* ---------------------------------------------------------------------------------- break turn */

/** The turn at which the agent first produced quoted violation evidence. */
export function BreakTurnChart({ conversations, maxTurns }: { conversations: LiveConversation[]; maxTurns: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>(null)
  const { counts, total, unlocated, held } = useMemo(() => {
    const counts = Array.from({ length: maxTurns }, () => 0)
    let total = 0
    let unlocated = 0
    let held = 0
    for (const c of conversations) {
      const v = c.evaluation?.policy_violations ?? []
      if (!c.evaluation) continue
      if (!v.length) {
        held++
        continue
      }
      total++
      const turns = violationTurns(c.messages, v)
      if (!turns.size) {
        unlocated++
        continue
      }
      const t = Math.min(...turns)
      if (t >= 1 && t <= maxTurns) counts[t - 1]++
    }
    return { counts, total, unlocated, held }
  }, [conversations, maxTurns])

  const max = Math.max(1, ...counts)
  const H = 170
  const m = { l: 8, r: 8, t: 18, b: 22 }
  const iw = Math.max(0, w - m.l - m.r)
  const ih = H - m.t - m.b
  const slot = iw / maxTurns
  const bw = Math.min(24, slot - 8)
  // cumulative share, for the caption
  const byTurn2 = counts.slice(0, 2).reduce((a, b) => a + b, 0)

  if (!total)
    return <p className="py-10 text-center text-[13px] text-ink-3">{held ? `No violations in ${held} graded chat${held === 1 ? '' : 's'}.` : 'No graded chats yet.'}</p>

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
        {w > 0 && (
          <svg width={w} height={H} className="block">
            <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="var(--color-line)" />
            {counts.map((n, i) => {
              const h = (n / max) * ih
              const cx = m.l + slot * i + slot / 2
              const x0 = cx - bw / 2
              const top = m.t + ih - h
              return (
                <g key={i} onPointerEnter={() => setTip({ x: cx, y: top, content: `${n} chat${n === 1 ? '' : 's'} first slipped at turn ${i + 1}` })}>
                  <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
                  {n > 0 && (
                    <>
                      <motion.path
                        d={`M${x0},${m.t + ih} V${top + 4} Q${x0},${top} ${x0 + 4},${top} H${x0 + bw - 4} Q${x0 + bw},${top} ${x0 + bw},${top + 4} V${m.t + ih} Z`}
                        fill="var(--color-fail)"
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        style={{ transformOrigin: `${cx}px ${m.t + ih}px` }}
                        transition={{ duration: 0.6, delay: i * 0.04, ease: EASE }}
                      />
                      <text x={cx} y={top - 5} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)" className="font-display font-semibold">
                        {n}
                      </text>
                    </>
                  )}
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={AXIS} className="font-mono">
                    t{i + 1}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        <ChartTip tip={tip} width={w} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-ink-3">
        <span className="font-display font-semibold text-ink-2">
          {byTurn2} of {total}
        </span>{' '}
        conversations with a violation slipped by turn 2.
        {unlocated > 0 && ` ${unlocated} had evidence we couldn’t place in the transcript.`}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------------- difficulty */

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']

/** Linear-interpolated quantile of sorted values. */
function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Scores per scenario difficulty as a box plot (quartile box, median, whiskers to min/max), every chat a dot. */
export function DifficultyStrip({ conversations, onOpen }: { conversations: LiveConversation[]; onOpen: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>(null)
  const rows = useMemo(
    () =>
      DIFFS.map((d) => ({
        d,
        items: conversations.filter((c) => (c.scenario?.difficulty ?? c.summary?.difficulty) === d && scoreOf(c) != null),
      })),
    [conversations],
  )
  if (!rows.some((r) => r.items.length)) return <p className="py-10 text-center text-[13px] text-ink-3">No graded chats yet.</p>

  const label = 70
  const RH = 48
  const m = { t: 4, b: 22 }
  const iw = Math.max(0, w - label - 12)
  const H = m.t + rows.length * RH + m.b
  const x = (v: number) => label + (v / 100) * iw
  const WHISKER = 'var(--color-n-400)'

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
        {w > 0 && (
          <svg width={w} height={H} className="block">
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke={GRID} />
                <text x={x(v)} y={H - 6} fontSize={10} fill={AXIS} textAnchor="middle" className="font-mono">
                  {v}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cy = m.t + i * RH + RH / 2
              const scores = r.items.map((c) => scoreOf(c)!).sort((a, b) => a - b)
              const box = scores.length
                ? { min: scores[0], q1: quantile(scores, 0.25), med: quantile(scores, 0.5), q3: quantile(scores, 0.75), max: scores[scores.length - 1] }
                : null
              const bh = 22
              // deterministic jitter so overlapping scores stay visible
              const seen = new Map<number, number>()
              return (
                <g key={r.d}>
                  <text x={0} y={cy} dy="0.32em" fontSize={12} fill="var(--color-ink-2)">
                    {humanize(r.d)}
                  </text>
                  <text x={label - 10} y={cy} dy="0.32em" fontSize={10} fill={AXIS} textAnchor="end" className="font-mono">
                    {r.items.length}
                  </text>
                  {box && (
                    <g
                      onPointerEnter={() =>
                        setTip({
                          x: x(box.med),
                          y: cy - bh / 2,
                          content: (
                            <span>
                              <span className="font-medium">{humanize(r.d)}</span> · median {Math.round(box.med)}
                              <br />
                              <span className="text-white/70">
                                middle half {Math.round(box.q1)}–{Math.round(box.q3)} · range {box.min}–{box.max}
                              </span>
                            </span>
                          ),
                        })
                      }
                    >
                      <line x1={x(box.min)} x2={x(box.q1)} y1={cy} y2={cy} stroke={WHISKER} strokeWidth={1.5} />
                      <line x1={x(box.q3)} x2={x(box.max)} y1={cy} y2={cy} stroke={WHISKER} strokeWidth={1.5} />
                      <line x1={x(box.min)} x2={x(box.min)} y1={cy - 6} y2={cy + 6} stroke={WHISKER} strokeWidth={1.5} />
                      <line x1={x(box.max)} x2={x(box.max)} y1={cy - 6} y2={cy + 6} stroke={WHISKER} strokeWidth={1.5} />
                      <motion.rect
                        x={x(box.q1)}
                        y={cy - bh / 2}
                        width={Math.max(3, x(box.q3) - x(box.q1))}
                        height={bh}
                        rx={4}
                        fill="var(--color-indigo-50)"
                        stroke="var(--color-indigo-300)"
                        strokeWidth={1.5}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
                      />
                      <line x1={x(box.med)} x2={x(box.med)} y1={cy - bh / 2} y2={cy + bh / 2} stroke="var(--color-ink)" strokeWidth={2} />
                    </g>
                  )}
                  {r.items.map((c) => {
                    const s = scoreOf(c)!
                    const k = seen.get(s) ?? 0
                    seen.set(s, k + 1)
                    const dy = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 6
                    const tone = outcomeTone(c)
                    return (
                      <g
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => onOpen(c.id)}
                        onPointerEnter={() => setTip({ x: x(s), y: cy + dy - 6, content: <TipBody c={c} extra={`${tone.label} · ${s}`} /> })}
                      >
                        <circle cx={x(s)} cy={cy + dy} r={10} fill="transparent" />
                        <circle cx={x(s)} cy={cy + dy} r={4} fill={tone.color} stroke={SURFACE} strokeWidth={2} pointerEvents="none" />
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        )}
        <ChartTip tip={tip} width={w} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <LegendItem swatch={<span className="h-2.5 w-4 rounded-[3px] border-[1.5px] border-indigo-300 bg-indigo-50" />}>Middle half</LegendItem>
        <LegendItem swatch={<span className="h-3 w-0.5 rounded-full bg-ink" />}>Median</LegendItem>
        <LegendItem swatch={<span className="h-px w-4 bg-n-400" />}>Range</LegendItem>
        <LegendItem swatch={<Dot color={OUTCOME_COLOR.held} />}>Held</LegendItem>
        <LegendItem swatch={<Dot color={OUTCOME_COLOR.violated} />}>Violated</LegendItem>
        <LegendItem swatch={<Dot color={OUTCOME_COLOR.breached} />}>Breached</LegendItem>
      </div>
    </div>
  )
}

export function ChartLegendNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-2 text-[11.5px] text-ink-3', className)}>{children}</p>
}
