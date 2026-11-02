import * as RadixSlider from '@radix-ui/react-slider'
import { useState } from 'react'
import { cn } from '../../lib/format'
import { GUARD_CASES, outcomeOf, type Outcome } from './guardCases'

const OUTCOMES: Record<Outcome, { label: string; dot: string; chip: string }> = {
  caught: { label: 'Caught', dot: 'bg-teal-500', chip: 'bg-teal-100 text-teal-700' },
  missed: { label: 'Missed', dot: 'bg-fail', chip: 'bg-fail-soft text-fail' },
  'false-alarm': { label: 'False alarm', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  clear: { label: 'Clear', dot: 'bg-indigo-300', chip: 'bg-indigo-100 text-indigo-700' },
}
const ORDER: Outcome[] = ['caught', 'missed', 'false-alarm', 'clear']

// the slider keeps its thumb inside the track, so a value's x sits half a thumb in from each end
const THUMB = 22
const xOf = (v: number) => `calc(${THUMB / 2}px + ${v} * (100% - ${THUMB}px))`

function Chip({ outcome }: { outcome: Outcome }) {
  const o = OUTCOMES[outcome]
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 font-display text-[12px] font-medium whitespace-nowrap', o.chip)}>{o.label}</span>
}

function Threshold({ value, onChange, selected, onSelect }: { value: number; onChange: (v: number) => void; selected: string; onSelect: (id: string) => void }) {
  // replies with the same score stack instead of hiding each other
  const lanes = new Map<number, number>()
  return (
    <div>
      <div className="relative h-[46px]">
        {GUARD_CASES.map((c) => {
          const lane = lanes.get(c.score) ?? 0
          lanes.set(c.score, lane + 1)
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              aria-label={`${c.title}, score ${c.score.toFixed(2)}`}
              className="absolute grid size-6 -translate-x-1/2 place-items-center"
              style={{ left: xOf(c.score), bottom: lane * 21 }}
            >
              <span className={cn('rounded-full ring-white transition-all duration-200', OUTCOMES[outcomeOf(c, value)].dot, c.id === selected ? 'size-4 ring-3 shadow-[0_0_0_1.5px_#1c1860]' : 'size-3.5 ring-2')} />
            </button>
          )
        })}
      </div>
      <RadixSlider.Root className="relative flex h-6 w-full touch-none items-center select-none" value={[value]} min={0.05} max={0.99} step={0.01} onValueChange={([v]) => onChange(v)}>
        <RadixSlider.Track className="relative h-2 grow overflow-hidden rounded-full bg-[linear-gradient(90deg,#ffb7a3,#ff8a75)]">
          <RadixSlider.Range className="absolute h-full bg-[linear-gradient(90deg,#dcd7ff,#b9b2ff)]" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label="Guard threshold"
          className="block size-[22px] cursor-grab rounded-full border-[3px] border-indigo-500 bg-white shadow-lift transition-transform duration-150 hover:scale-110 focus-visible:shadow-[0_0_0_4px_var(--color-indigo-200)] focus-visible:outline-none active:scale-95 active:cursor-grabbing"
        />
      </RadixSlider.Root>
      <div className="mt-1.5 flex justify-between font-mono text-[11.5px] text-dusk-2">
        <span>Allow</span>
        <span>Threshold {value.toFixed(2)}</span>
        <span>Block</span>
      </div>
    </div>
  )
}

/** Drag a threshold across five replies with their recorded Jev scores and see what it blocks. */
export function GuardLab() {
  const [threshold, setThreshold] = useState(0.8)
  const [selectedId, setSelectedId] = useState(GUARD_CASES[0].id)
  const selected = GUARD_CASES.find((c) => c.id === selectedId) ?? GUARD_CASES[0]
  const counts = ORDER.map((o) => ({ o, n: GUARD_CASES.filter((c) => outcomeOf(c, threshold) === o).length }))

  return (
    <div className="rounded-[22px] border border-white/80 bg-white/90 p-4 shadow-[0_30px_80px_-30px_rgb(80_72_229/0.4)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {counts.map(({ o, n }) => (
          <span key={o} className="flex items-center gap-1.5 text-[13.5px] text-dusk-2">
            <span className={cn('size-2.5 rounded-full', OUTCOMES[o].dot)} />
            {OUTCOMES[o].label} <span className="font-mono font-medium text-dusk tabular">{n}</span>
          </span>
        ))}
      </div>

      <div className="mt-3">
        <Threshold value={threshold} onChange={setThreshold} selected={selected.id} onSelect={setSelectedId} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <ul className="flex flex-col gap-1">
          {GUARD_CASES.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                aria-pressed={c.id === selected.id}
                className={cn('flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors', c.id === selected.id ? 'bg-[linear-gradient(100deg,#fff0e6,#efedff)]' : 'hover:bg-[#f8f6ff]')}
              >
                <span className="font-mono text-[12.5px] font-medium text-dusk tabular">{c.score.toFixed(2)}</span>
                <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-dusk">{c.title}</span>
                <Chip outcome={outcomeOf(c, threshold)} />
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 rounded-2xl bg-[#faf8ff] p-4 sm:p-5 lg:min-h-[430px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-[14px] font-semibold text-dusk">{selected.agent}</span>
            <span className="font-mono text-[11.5px] text-dusk-2">Graded: {selected.violating ? 'violating' : 'clean'}</span>
          </div>

          <p className="mt-3 text-[13.5px] leading-normal text-pretty text-dusk-2">
            <span className="font-medium text-dusk">User: </span>
            {selected.user}
          </p>
          <p className={cn('mt-2 rounded-xl bg-white px-3.5 py-3 text-dusk', selected.mono ? 'font-mono text-[12.5px] leading-normal break-words whitespace-pre-wrap' : 'text-[14px] leading-normal text-pretty')}>{selected.reply}</p>

          <p className="mt-5 font-display text-[13px] font-medium text-dusk-2">Jev’s three highest rules</p>
          <ul className="mt-2 flex flex-col gap-3">
            {selected.rules.map((r) => {
              const over = r.p >= threshold
              return (
                <li key={r.text}>
                  <div className="flex items-start justify-between gap-3 text-[13px] leading-snug text-dusk">
                    <span className="text-pretty">{r.text}</span>
                    <span className={cn('font-mono font-medium tabular', over && 'text-fail')}>{r.p.toFixed(2)}</span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-[#ebe8fb]">
                    <div className={cn('h-full rounded-full transition-colors', over ? 'bg-[linear-gradient(90deg,#ffb19e,#f0565c)]' : 'bg-[linear-gradient(90deg,#c9c3ff,#8c84f2)]')} style={{ width: `${r.p * 100}%` }} />
                    <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-dusk" style={{ left: `${threshold * 100}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-[14px] leading-normal text-pretty text-dusk">{selected.note}</p>
        </div>
      </div>
    </div>
  )
}
