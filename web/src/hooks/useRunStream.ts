import { useEffect, useReducer } from 'react'
import { api } from '../lib/api'
import type {
  ConversationStatus,
  ConversationSummary,
  EndReason,
  Evaluation,
  GeneratorCall,
  GuardDecision,
  RunDetail,
  RunEvent,
  RunStats,
  RunStatus,
  Scenario,
  ScenarioProgress,
  Taxonomy,
  TranscriptMessage,
} from '../lib/types'

/** One conversation as the UI sees it, built up from stream events (or a snapshot + REST). */
export interface LiveConversation {
  id: string
  index: number
  agent_name: string
  scenario: Scenario | null
  status: ConversationStatus
  messages: TranscriptMessage[]
  evaluation: Evaluation | null
  end_reason: EndReason | null
  error: string | null
  /** Every guard model's call on every agent reply so far. */
  guard_decisions: GuardDecision[]
  /** When grading finished (or the chat failed); orders the score timeline. */
  completedAt: string | null
  /** Present when the run came from a snapshot and details are still loading. */
  summary?: ConversationSummary
}

export interface RunStreamState {
  runId: string
  connection: 'connecting' | 'live' | 'reconnecting' | 'closed'
  lastSeq: number
  status: RunStatus | null
  error: string | null
  progress: ScenarioProgress | null
  phasesSeen: string[]
  /** Every model call Simula made, in start order, with its latest status. */
  calls: GeneratorCall[]
  taxonomy: Taxonomy | null
  order: string[]
  conversations: Record<string, LiveConversation>
  stats: RunStats | null
  /** Set when the stream ended, so callers can refresh REST data once. */
  finishedAt: number | null
}

type Action =
  | { type: 'reset'; runId: string }
  | { type: 'connection'; value: RunStreamState['connection'] }
  | { type: 'event'; event: RunEvent }
  | { type: 'snapshot'; detail: RunDetail }
  | { type: 'conversation.full'; conversation: Omit<LiveConversation, 'summary'> }

const initial = (runId: string): RunStreamState => ({
  runId,
  connection: 'connecting',
  lastSeq: 0,
  status: null,
  error: null,
  progress: null,
  phasesSeen: [],
  calls: [],
  taxonomy: null,
  order: [],
  conversations: {},
  stats: null,
  finishedAt: null,
})

function patch(state: RunStreamState, id: string, fn: (c: LiveConversation) => Partial<LiveConversation>): RunStreamState {
  const current = state.conversations[id]
  if (!current) return state
  return { ...state, conversations: { ...state.conversations, [id]: { ...current, ...fn(current) } } }
}

function reducer(state: RunStreamState, action: Action): RunStreamState {
  switch (action.type) {
    case 'reset':
      return initial(action.runId)
    case 'connection':
      return { ...state, connection: action.value }
    case 'snapshot': {
      const d = action.detail
      const conversations: Record<string, LiveConversation> = {}
      for (const c of d.conversations) {
        conversations[c.id] = {
          id: c.id,
          index: c.index,
          agent_name: c.agent_name,
          scenario: null,
          status: c.status,
          messages: [],
          evaluation: null,
          end_reason: c.end_reason,
          error: c.error,
          guard_decisions: [],
          completedAt: null,
          summary: c,
        }
      }
      return {
        ...state,
        status: d.status,
        error: d.error,
        stats: d.stats,
        order: [...d.conversations].sort((a, b) => a.index - b.index).map((c) => c.id),
        conversations,
        connection: 'closed',
        finishedAt: Date.now(),
      }
    }
    case 'conversation.full': {
      const c = action.conversation
      return { ...state, conversations: { ...state.conversations, [c.id]: { ...c } } }
    }
    case 'event': {
      const e = action.event
      if (e.seq <= state.lastSeq) return state
      const s = { ...state, lastSeq: e.seq }
      const d = e.data as Record<string, never>
      switch (e.type) {
        case 'run.status':
          return { ...s, status: d.status, error: d.error ?? s.error }
        case 'scenarios.progress': {
          const progress = e.data as unknown as ScenarioProgress
          const phasesSeen = s.phasesSeen.includes(progress.phase) ? s.phasesSeen : [...s.phasesSeen, progress.phase]
          let calls = s.calls
          const call = progress.call
          if (call) {
            const at = calls.findIndex((x) => x.id === call.id)
            calls = at < 0 ? [...calls, call] : calls.map((x, i) => (i === at ? call : x))
          }
          return { ...s, progress, phasesSeen, calls }
        }
        case 'scenarios.ready': {
          const list = (d.conversations as unknown as { conversation_id: string; index: number; agent_name: string; scenario: Scenario }[]) ?? []
          const conversations: Record<string, LiveConversation> = {}
          for (const c of list) {
            conversations[c.conversation_id] = {
              id: c.conversation_id,
              index: c.index,
              agent_name: c.agent_name,
              scenario: c.scenario,
              status: 'pending',
              messages: [],
              evaluation: null,
              end_reason: null,
              error: null,
              guard_decisions: [],
              completedAt: null,
            }
          }
          return {
            ...s,
            taxonomy: (d.taxonomy as Taxonomy | null) ?? null,
            conversations,
            order: [...list].sort((a, b) => a.index - b.index).map((c) => c.conversation_id),
          }
        }
        case 'conversation.started':
          return patch(s, d.conversation_id, () => ({ status: 'running' }))
        case 'conversation.message': {
          const message = d.message as unknown as TranscriptMessage
          return patch(s, d.conversation_id, (c) => ({ status: c.status === 'pending' ? 'running' : c.status, messages: [...c.messages, message] }))
        }
        case 'conversation.guard': {
          const decision = d.decision as unknown as GuardDecision
          return patch(s, d.conversation_id, (c) => ({ guard_decisions: [...c.guard_decisions, decision] }))
        }
        case 'conversation.evaluating':
          return patch(s, d.conversation_id, () => ({ status: 'evaluating' }))
        case 'conversation.completed':
          return patch(s, d.conversation_id, () => ({
            status: 'completed',
            evaluation: (d.evaluation as Evaluation | null) ?? null,
            end_reason: d.end_reason ?? null,
            error: d.error ?? null,
            completedAt: e.created_at,
          }))
        case 'conversation.failed':
          return patch(s, d.conversation_id, () => ({ status: 'failed', error: d.error ?? 'Conversation failed', completedAt: e.created_at }))
        case 'run.stats':
          return { ...s, stats: e.data as unknown as RunStats }
        case 'run.finished': {
          // A cancelled run leaves unfinished conversations behind; reflect that.
          const terminal: RunStatus = d.status
          let conversations = s.conversations
          if (terminal !== 'completed') {
            conversations = Object.fromEntries(
              Object.entries(s.conversations).map(([id, c]) => [
                id,
                ['pending', 'running', 'evaluating'].includes(c.status) ? { ...c, status: 'cancelled' as const } : c,
              ]),
            )
          }
          return { ...s, status: terminal, stats: (d.stats as RunStats) ?? s.stats, error: d.error ?? s.error, conversations, finishedAt: Date.now() }
        }
        default:
          return s
      }
    }
  }
}

const EVENT_TYPES = [
  'run.status',
  'scenarios.progress',
  'scenarios.ready',
  'conversation.started',
  'conversation.message',
  'conversation.guard',
  'conversation.evaluating',
  'conversation.completed',
  'conversation.failed',
  'run.stats',
  'run.finished',
]

/**
 * Follows `GET /runs/{id}/events`. The server replays the whole run first, so this alone rebuilds
 * the page after a refresh. Runs from an earlier server process arrive as one `run.snapshot`; their
 * transcripts are then fetched over REST.
 */
export function useRunStream(runId: string): RunStreamState {
  const [state, dispatch] = useReducer(reducer, runId, initial)

  useEffect(() => {
    dispatch({ type: 'reset', runId })
    let disposed = false
    const es = new EventSource(api.eventsUrl(runId))

    const close = () => {
      es.close()
      if (!disposed) dispatch({ type: 'connection', value: 'closed' })
    }

    es.onopen = () => dispatch({ type: 'connection', value: 'live' })
    es.onerror = () => {
      if (disposed) return
      // EventSource retries on its own (sending Last-Event-ID); CLOSED means it gave up.
      dispatch({ type: 'connection', value: es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting' })
    }

    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (raw) => {
        const event = JSON.parse((raw as MessageEvent).data) as RunEvent
        dispatch({ type: 'event', event })
        if (type === 'run.finished') close()
      })
    }

    es.addEventListener('run.snapshot', async (raw) => {
      const detail = JSON.parse((raw as MessageEvent).data) as RunDetail
      close()
      dispatch({ type: 'snapshot', detail })
      // Pull full transcripts, a few at a time.
      const ids = [...detail.conversations].sort((a, b) => a.index - b.index).map((c) => c.id)
      let cursor = 0
      const worker = async () => {
        while (!disposed && cursor < ids.length) {
          const id = ids[cursor++]
          try {
            const c = await api.conversation(runId, id)
            if (disposed) return
            dispatch({
              type: 'conversation.full',
              conversation: {
                id: c.id,
                index: c.index,
                agent_name: c.agent_name,
                scenario: c.scenario,
                status: c.status,
                messages: c.messages,
                evaluation: c.evaluation,
                end_reason: c.end_reason,
                error: c.error,
                guard_decisions: c.guard_decisions ?? [],
                completedAt: c.finished_at,
              },
            })
          } catch {
            /* keep the summary-only card */
          }
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
    })

    return () => {
      disposed = true
      es.close()
    }
  }, [runId])

  return state
}
