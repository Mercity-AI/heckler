import type { Target } from '../lib/types'
import { AgentForm } from './AgentForm'
import { Dialog } from './ui/overlay'

/** Edit a connected agent in place. Stored keys stay hidden; leaving a key blank keeps it. */
export function AgentDialog({ target, open, onOpenChange }: { target: Target; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${target.name}`} className="max-w-[720px]" bodyClassName="p-0">
      <AgentForm key={target.id} initial={target} submitLabel="Save changes" onSaved={() => onOpenChange(false)} />
    </Dialog>
  )
}
