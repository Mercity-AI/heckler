import { motion } from 'motion/react'
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { LiveConversation } from '../../hooks/useRunStream'
import { violationTurns } from '../../lib/evidence'
import { agentColor, cn, humanize } from '../../lib/format'
import type { Difficulty } from '../../lib/types'

/*
 * Small SVG charts for the Insights tab. Conventions (see the dataviz skill): thin marks, 4px rounded
 * data ends, 2px surface ring on dots, hairline solid gridlines, text in ink tokens (never series
 * colour), status colours only for verdicts, categorical agent colours in fixed A/B/C order.
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

function ChartTip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug whitespace-nowrap text-white shadow-pop"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  )
}

function scoreOf(c: LiveConversation) {
  return c.evaluation?.score ?? c.summary?.score ?? null
}
function verdictTone(c: LiveConversation): { color: string; label: string } {
  const broken = c.evaluation?.broken ?? c.summary?.broken
  const verdict = c.evaluation?.verdict ?? c.summary?.verdict
  if (broken) return { color: 'var(--color-fail)', label: 'Breached' }
  if (verdict === 'pass') return { color: 'var(--color-pass)', label: 'Held' }
  if (verdict === 'partial') return { color: 'var(--color-warn)', label: 'Partial' }
  return { color: 'var(--color-crit)', label: 'Failed' }
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

/* ------------------------------------------------------------------------------------ timeline */

/** Each graded chat as a dot in the order it finished, with the running mean as a line. */
export function ScoreTimeline({ conversations, onOpen }: { conversations: LiveConversation[]; onOpen: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>(null)
  const points = useMemo(
    () =>
      conversations
        .filter((c) => scoreOf(c) != null)
        .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || a.index - b.index)
        .map((c, i, arr) => {
          const mean = arr.slice(0, i + 1).reduce((s, x) => s + (scoreOf(x) ?? 0), 0) / (i + 1)
          return { c, score: scoreOf(c)!, mean }
        }),
    [conversations],
  )
  const H = 200
  const m = { l: 30, r: 14, t: 12, b: 26 }
  const iw = Math.max(0, w - m.l - m.r)
  const ih = H - m.t - m.b
  const n = points.length
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => m.t + ih - (v / 100) * ih
  const meanPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.mean).toFixed(1)}`).join('')

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
        {w > 0 && (
          <svg width={w} height={H} className="block overflow-visible">
            {/* score bands from the grading guide, as faint washes */}
            {[
              { from: 0, to: 40, fill: 'var(--color-fail)' },
              { from: 40, to: 70, fill: 'var(--color-warn)' },
            ].map((b) => (
              <rect key={b.from} x={m.l} width={iw} y={y(b.to)} height={y(b.from) - y(b.to)} fill={b.fill} opacity={0.035} />
            ))}
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} stroke={GRID} />
                <text x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS} className="font-mono">
                  {v}
                </text>
              </g>
            ))}
            {n > 1 && (
              <motion.path d={meanPath} fill="none" stroke="var(--color-indigo-500)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
            )}
            {points.map((p, i) => {
              const tone = verdictTone(p.c)
              return (
                <g key={p.c.id} className="cursor-pointer" onClick={() => onOpen(p.c.id)}>
                  <circle cx={x(i)} cy={y(p.score)} r={12} fill="transparent" onPointerEnter={() => setTip({ x: x(i), y: y(p.score), content: <TipBody c={p.c} extra={`${tone.label} · ${p.score}`} /> })} />
                  <motion.circle
                    cx={x(i)}
                    cy={y(p.score)}
                    r={5}
                    fill={tone.color}
                    stroke={SURFACE}
                    strokeWidth={2}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.03 * i, type: 'spring', bounce: 0.4, duration: 0.5 }}
                    style={{ transformOrigin: `${x(i)}px ${y(p.score)}px` }}
                    pointerEvents="none"
                  />
                </g>
              )
            })}
            {n > 0 && (
              <text x={x(n - 1)} y={y(points[n - 1].mean) - 10} textAnchor="end" fontSize={11} fill="var(--color-ink-2)" className="font-display font-semibold">
                mean {Math.round(points[n - 1].mean)}
              </text>
            )}
            <text x={m.l} y={H - 6} fontSize={10} fill={AXIS} className="font-mono">
              first finished
            </text>
            <text x={m.l + iw} y={H - 6} fontSize={10} fill={AXIS} textAnchor="end" className="font-mono">
              latest
            </text>
          </svg>
        )}
        <ChartTip tip={tip} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <LegendItem swatch={<span className="h-0.5 w-3.5 rounded-full bg-indigo-500" />}>Running mean</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-pass)" />}>Held</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-warn)" />}>Partial</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-fail)" />}>Breached</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-crit)" />}>Failed</LegendItem>
      </div>
    </div>
  )
}

function TipBody({ c, extra }: { c: LiveConversation; extra: ReactNode }) {
  return (
    <span>
      <span className="font-medium">
        {c.agent_name} #{c.index + 1}
      </span>{' '}
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
      <ChartTip tip={tip} />
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
        <ChartTip tip={tip} />
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

/* ------------------------------------------------------------------------- dimensions by agent */

/** Mean dimension score per attacker on one shared 0–10 axis; the grey bar spans their spread. */
export function AgentDimensionDots({ conversations }: { conversations: LiveConversation[] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>(null)
  const { agents, rows } = useMemo(() => {
    const acc = new Map<string, Map<string, { s: number; n: number }>>()
    for (const c of conversations) {
      const d = c.evaluation?.dimension_scores
      if (!d) continue
      const byDim = acc.get(c.agent_name) ?? new Map()
      for (const [k, v] of Object.entries(d)) {
        const e = byDim.get(k) ?? { s: 0, n: 0 }
        e.s += v
        e.n++
        byDim.set(k, e)
      }
      acc.set(c.agent_name, byDim)
    }
    const agents = [...acc.keys()].sort()
    const dims = [...new Set(agents.flatMap((a) => [...acc.get(a)!.keys()]))]
    const rows = dims
      .map((dim) => ({
        dim,
        values: agents.map((a) => {
          const e = acc.get(a)!.get(dim)
          return { agent: a, v: e ? e.s / e.n : null }
        }),
      }))
      .sort((a, b) => avg(a.values) - avg(b.values))
    return { agents, rows }
  }, [conversations])

  if (!rows.length) return <p className="py-10 text-center text-[13px] text-ink-3">No graded chats yet.</p>

  const label = 132
  const RH = 30
  const m = { t: 6, b: 22 }
  const iw = Math.max(0, w - label - 12)
  const H = m.t + rows.length * RH + m.b
  const x = (v: number) => label + (v / 10) * iw

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
        {w > 0 && (
          <svg width={w} height={H} className="block">
            {[0, 5, 10].map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke={GRID} />
                <text x={x(v)} y={H - 6} fontSize={10} fill={AXIS} textAnchor="middle" className="font-mono">
                  {v}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cy = m.t + i * RH + RH / 2
              const vals = r.values.filter((v) => v.v != null) as { agent: string; v: number }[]
              const lo = Math.min(...vals.map((v) => v.v))
              const hi = Math.max(...vals.map((v) => v.v))
              return (
                <g key={r.dim}>
                  <text x={0} y={cy} dy="0.32em" fontSize={12} fill="var(--color-ink-2)">
                    {humanize(r.dim)}
                  </text>
                  <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke="var(--color-n-200)" strokeWidth={4} strokeLinecap="round" />
                  {vals.map((v) => (
                    <g key={v.agent} onPointerEnter={() => setTip({ x: x(v.v), y: cy - 6, content: `${v.agent} · ${humanize(r.dim)}: ${v.v.toFixed(1)}` })}>
                      <circle cx={x(v.v)} cy={cy} r={11} fill="transparent" />
                      <motion.circle
                        cx={x(v.v)}
                        cy={cy}
                        r={5.5}
                        fill={agentColor(v.agent)}
                        stroke={SURFACE}
                        strokeWidth={2}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: i * 0.05 }}
                        pointerEvents="none"
                      />
                    </g>
                  ))}
                </g>
              )
            })}
          </svg>
        )}
        <ChartTip tip={tip} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {agents.map((a) => (
          <LegendItem key={a} swatch={<Dot color={agentColor(a)} />}>
            {a}
          </LegendItem>
        ))}
      </div>
    </div>
  )
}

function avg(values: { v: number | null }[]) {
  const xs = values.map((v) => v.v).filter((v): v is number => v != null)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

/* ------------------------------------------------------------------------------- difficulty */

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']

/** Scores per scenario difficulty as a strip of dots, with the median marked. */
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

  const label = 64
  const RH = 40
  const m = { t: 4, b: 22 }
  const iw = Math.max(0, w - label - 12)
  const H = m.t + rows.length * RH + m.b
  const x = (v: number) => label + (v / 100) * iw

  return (
    <div>
    <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={H} className="block">
          {[0, 50, 100].map((v) => (
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
            const median = scores.length ? scores[Math.floor((scores.length - 1) / 2)] : null
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
                {median != null && <line x1={x(median)} x2={x(median)} y1={cy - 12} y2={cy + 12} stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" />}
                {r.items.map((c) => {
                  const s = scoreOf(c)!
                  const k = seen.get(s) ?? 0
                  seen.set(s, k + 1)
                  const dy = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 6
                  const tone = verdictTone(c)
                  return (
                    <g key={c.id} className="cursor-pointer" onClick={() => onOpen(c.id)} onPointerEnter={() => setTip({ x: x(s), y: cy + dy - 6, content: <TipBody c={c} extra={`${tone.label} · ${s}`} /> })}>
                      <circle cx={x(s)} cy={cy + dy} r={10} fill="transparent" />
                      <circle cx={x(s)} cy={cy + dy} r={4.5} fill={tone.color} stroke={SURFACE} strokeWidth={2} pointerEvents="none" />
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      )}
      <ChartTip tip={tip} />
    </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <LegendItem swatch={<span className="h-3 w-0.5 rounded-full bg-ink" />}>Median</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-pass)" />}>Held</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-warn)" />}>Partial</LegendItem>
        <LegendItem swatch={<Dot color="var(--color-fail)" />}>Breached</LegendItem>
      </div>
    </div>
  )
}

export function ChartLegendNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-2 text-[11.5px] text-ink-3', className)}>{children}</p>
}
