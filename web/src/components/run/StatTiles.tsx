import { AlertOctagon, FileWarning, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSpotlight } from '../../hooks/useSpotlight'
import { cn } from '../../lib/format'
import type { RunStats, Severity } from '../../lib/types'
import { ScoreRing } from '../status'
import { Meter, Ticker, Tooltip } from '../ui/primitives'

function Tile({ icon, label, children, sub, className, tone }: { icon: ReactNode; label: string; children: ReactNode; sub: ReactNode; className?: string; tone?: 'fail' }) {
  const spot = useSpotlight()
  return (
    <div
      onPointerMove={spot}
      style={tone === 'fail' ? ({ '--spot': '210 58 67' } as React.CSSProperties) : undefined}
      className={cn(
        'spotlight flex flex-col gap-3 rounded-2xl border bg-surface/80 p-4 shadow-card backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-300 ease-out-soft hover:-translate-y-0.5 hover:bg-surface hover:shadow-lift',
        tone === 'fail' ? 'border-fail/30' : 'border-white/70',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
        {icon}
        {label}
      </div>
      {children}
      <div className="text-[11.5px] leading-snug text-ink-3">{sub}</div>
    </div>
  )
}

function Fraction({ num, den }: { num: number; den: number }) {
  return (
    <div className="flex items-baseline gap-1 font-display tracking-[-0.02em]">
      <Ticker value={num} className="text-[30px] leading-none font-semibold text-ink" />
      <span className="text-[17px] font-medium text-ink-3 tabular">/{den}</span>
    </div>
  )
}

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']
const SEV_COLOR: Record<Severity, string> = { critical: 'bg-crit', high: 'bg-fail', medium: 'bg-warn', low: 'bg-n-400' }

export function StatTiles({ stats }: { stats: RunStats }) {
  const n = stats.evaluated
  const sevTotal = SEV_ORDER.reduce((a, s) => a + (stats.severity_counts[s] ?? 0), 0)
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Tile icon={<AlertOctagon className="size-3.5 text-fail" />} label="Instruction breaches" tone={stats.broken > 0 ? 'fail' : undefined} sub={n ? `Set its system prompt aside in ${stats.broken} of ${n} graded chats` : 'Waiting for the first graded chat'}>
        <Fraction num={stats.broken} den={n} />
        <Meter value={n ? stats.broken / n : 0} tone="fail" />
      </Tile>
      <Tile
        icon={<FileWarning className="size-3.5 text-warn" />}
        label="Policy violations"
        sub={
          sevTotal ? (
            <span className="flex flex-wrap gap-x-2.5">
              {SEV_ORDER.filter((s) => stats.severity_counts[s]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className={cn('size-1.5 rounded-full', SEV_COLOR[s])} />
                  {stats.severity_counts[s]} {s}
                </span>
              ))}
            </span>
          ) : (
            'None recorded'
          )
        }
      >
        <Fraction num={stats.with_violations} den={n} />
        {sevTotal ? (
          <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-n-100">
            {SEV_ORDER.filter((s) => stats.severity_counts[s]).map((s) => (
              <Tooltip key={s} content={`${stats.severity_counts[s]} ${s}-severity violation${stats.severity_counts[s] === 1 ? '' : 's'}`}>
                <div className={cn('h-full transition-[width] duration-700', SEV_COLOR[s])} style={{ width: `${((stats.severity_counts[s] ?? 0) / sevTotal) * (n ? stats.with_violations / n : 0) * 100}%` }} />
              </Tooltip>
            ))}
          </div>
        ) : (
          <Meter value={0} tone="warn" />
        )}
      </Tile>
      <Tile icon={<ShieldCheck className="size-3.5 text-pass" />} label="Held policy" sub={n ? `${stats.partial} partial · ${stats.failed} failed` : 'Kept every rule for the whole chat'}>
        <Fraction num={stats.passed} den={n} />
        <Meter value={n ? stats.passed / n : 0} tone="pass" />
      </Tile>
      <Tile icon={<span className="size-3.5 rounded-full border-2 border-ink-3" />} label="Mean score" sub={stats.errored ? `${stats.errored} chat${stats.errored === 1 ? '' : 's'} errored` : '0–100, against your policy'}>
        <div className="flex items-center gap-3">
          <ScoreRing value={stats.mean_score} size={48} stroke={4.5} />
          <div className="text-[12px] leading-snug text-ink-3">
            <div>
              <span className="font-display font-semibold text-ink tabular">{stats.finished}</span>/{stats.total} finished
            </div>
            <div>{stats.attacker_usage.calls} evaluator calls</div>
          </div>
        </div>
      </Tile>
    </div>
  )
}
