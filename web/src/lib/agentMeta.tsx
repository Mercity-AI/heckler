import { Cloud, FlaskConical, Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { shortModel } from './format'
import type { Target } from './types'

/** Icon + short label for how an agent is reached; shared by the agents list and the design screen. */
export function connectionSummary(t: Target): { icon: ReactNode; label: string; detail: string } {
  const c = t.connection
  if (c.kind === 'openai_chat') {
    let host = c.base_url
    try {
      host = new URL(c.base_url).host
    } catch {
      /* keep raw */
    }
    return { icon: <Cloud className="size-3.5" />, label: c.model, detail: host }
  }
  if (c.kind === 'http') return { icon: <Globe className="size-3.5" />, label: 'HTTP endpoint', detail: c.url }
  return { icon: <FlaskConical className="size-3.5" />, label: 'Offline demo', detail: c.behavior === 'leaky' ? 'scripted, leaky' : 'scripted, compliant' }
}

/** Who plays the users and grades: the agent's own evaluator, the offline script, or the server default. */
export function evaluatorLabel(t: Target): string {
  if (t.evaluator) return shortModel(t.evaluator.model)
  if (t.connection.kind === 'fake') return 'Offline scripted evaluator'
  return 'Server default'
}
