import { ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react'
import type { GuardDecision } from './types'

/** Icon, label and colours for a guard's call on one reply; shared by the transcript chips and reason lines. */
export function guardTone(d: GuardDecision) {
  if (d.flagged == null) return { icon: <ShieldQuestion className="size-3" />, label: 'Error', cls: 'border-line bg-n-50 text-ink-3' }
  return d.flagged
    ? { icon: <ShieldX className="size-3" />, label: 'Blocked', cls: 'border-fail/25 bg-fail-soft text-fail' }
    : { icon: <ShieldCheck className="size-3" />, label: 'Allowed', cls: 'border-pass/20 bg-pass-soft/60 text-pass' }
}
