import { AlertOctagon, FileWarning, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSpotlight } from '../../hooks/useSpotlight'
import { cn } from '../../lib/format'
import type { RunStats } from '../../lib/types'
import { ScoreRing } from '../status'
import { Meter, Ticker } from '../ui/primitives'

function Tile({ icon, label, children, sub, className, tone }: { icon: ReactNode; label: string; children: ReactNode; sub: ReactNode; className?: string; tone?: 'fail' }) {
  const spot = useSpotlight()
  return (
    <div
      onPointerMove={spot}
      // a quieter glow than the default: the tiles sit on the moving header field
      style={{ '--spot-wash': 0.035, '--spot-edge': 0.28, ...(tone === 'fail' && { '--spot': '210 58 67' }) } as React.CSSProperties}
      // no lift: the tile stays put and only its surface and shadow ease in
      className={cn(
        'spotlight flex flex-col gap-3 rounded-2xl border bg-surface/80 p-4 shadow-card backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 ease-out-soft hover:bg-surface/95 hover:shadow-lift',
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

export function StatTiles({ stats }: { stats: RunStats }) {
  const n = stats.evaluated
  const sub = (text: string) => (n ? text : 'Waiting for the first graded chat')
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Tile
        icon={<FileWarning className="size-3.5 text-fail" />}
        label="Violated policy"
        tone={stats.with_violations > 0 ? 'fail' : undefined}
        sub={sub('At least one violation. One is enough to fail a chat.')}
      >
        <Fraction num={stats.with_violations} den={n} />
        <Meter value={n ? stats.with_violations / n : 0} tone="fail" />
      </Tile>
      <Tile icon={<ShieldCheck className="size-3.5 text-pass" />} label="Held policy" sub={sub('No violation from the first message to the last.')}>
        <Fraction num={stats.passed} den={n} />
        <Meter value={n ? stats.passed / n : 0} tone="pass" />
      </Tile>
      <Tile icon={<AlertOctagon className="size-3.5 text-crit" />} label="Instruction breaches" sub={sub('Set its system prompt aside entirely. Counted within violated.')}>
        <Fraction num={stats.broken} den={n} />
        <Meter value={n ? stats.broken / n : 0} tone="fail" />
      </Tile>
      <Tile icon={<span className="size-3.5 rounded-full border-2 border-ink-3" />} label="Mean score" sub={stats.errored ? `${stats.errored} chat${stats.errored === 1 ? '' : 's'} errored` : '0–100, graded against your policy.'}>
        <div className="flex items-center gap-3">
          <ScoreRing value={stats.mean_score} size={48} stroke={4.5} />
          <div className="text-[12px] leading-snug text-ink-3">
            <span className="font-display font-semibold text-ink tabular">{stats.finished}</span>/{stats.total} finished
          </div>
        </div>
      </Tile>
    </div>
  )
}
