import type {
  Conversation,
  ConnectionTestResult,
  ExampleRunCreate,
  ProbeResult,
  PublicConfig,
  RunCreate,
  RunDetail,
  RunSummary,
  Target,
  TargetCreate,
  Taxonomy,
} from './types'
import { authHeaders } from './auth'

export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(await authHeaders()), ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Can’t reach the Heckler backend. Is it running?')
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { loc?: string[]; msg: string }) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join('; ')
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; version: string }>('/health'),
  config: () => request<PublicConfig>('/config'),

  targets: () => request<Target[]>('/targets'),
  target: (id: string) => request<Target>(`/targets/${id}`),
  createTarget: (body: TargetCreate) => request<Target>('/targets', { method: 'POST', body: JSON.stringify(body) }),
  updateTarget: (id: string, body: TargetCreate) => request<Target>(`/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  /** Checks unsaved settings: one message to the agent, one to the evaluator. `target_id` fills in stored keys. */
  testConnection: (body: TargetCreate & { target_id?: string | null }) =>
    request<ConnectionTestResult>('/targets/test', { method: 'POST', body: JSON.stringify(body) }),
  deleteTarget: (id: string) => request<void>(`/targets/${id}`, { method: 'DELETE' }),
  probeTarget: (id: string, message?: string) =>
    request<ProbeResult>(`/targets/${id}/probe`, { method: 'POST', body: JSON.stringify(message ? { message } : {}) }),

  runs: (opts: { targetId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (opts.targetId) q.set('target_id', opts.targetId)
    if (opts.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return request<RunSummary[]>(`/runs${qs ? `?${qs}` : ''}`)
  },
  run: (id: string) => request<RunDetail>(`/runs/${id}`),
  createRun: (body: RunCreate) => request<RunDetail>('/runs', { method: 'POST', body: JSON.stringify(body) }),
  /** The home page demo: runs offline against an unsaved agent and stays out of the run list. */
  createExampleRun: (body: ExampleRunCreate) => request<RunDetail>('/runs/example', { method: 'POST', body: JSON.stringify(body) }),
  cancelRun: (id: string) => request<RunDetail>(`/runs/${id}/cancel`, { method: 'POST' }),
  deleteRun: (id: string) => request<void>(`/runs/${id}`, { method: 'DELETE' }),
  taxonomy: (id: string) => request<{ taxonomy: Taxonomy | null }>(`/runs/${id}/taxonomy`),
  conversation: (runId: string, conversationId: string) => request<Conversation>(`/runs/${runId}/conversations/${conversationId}`),

  /** EventSource can't send headers: with Clerk on, the same-origin `__session` cookie authenticates it. */
  eventsUrl: (runId: string) => `${API_BASE}/runs/${runId}/events`,
}
