import * as RadixSlider from '@radix-ui/react-slider'
import type { ReactNode } from 'react'

/** Labelled range slider with the current value shown at the right. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  suffix,
}: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  hint?: ReactNode
  suffix?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[12.5px] font-medium text-ink-2">{label}</span>
        <span className="font-display text-[15px] font-semibold tabular text-ink">
          {value}
          {suffix && <span className="ml-1 text-[12px] font-normal text-ink-3">{suffix}</span>}
        </span>
      </div>
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      >
        <RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-n-200">
          <RadixSlider.Range className="absolute h-full rounded-full bg-ink" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={typeof label === 'string' ? label : undefined}
          className="block size-[18px] rounded-full border border-line-2 bg-surface shadow-lift transition-[transform,box-shadow] duration-150 hover:scale-110 focus-visible:shadow-[0_0_0_4px_var(--color-indigo-100)] focus-visible:outline-none active:scale-95"
        />
      </RadixSlider.Root>
      {hint && <p className="text-[12px] leading-snug text-ink-3">{hint}</p>}
    </div>
  )
}
