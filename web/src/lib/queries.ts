import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { isActive } from './format'
import type { RunSummary } from './types'

export const keys = {
  health: ['health'] as const,
  config: ['config'] as const,
  targets: ['targets'] as const,
  runs: ['runs'] as const,
  allRuns: ['runs', 'all'] as const,
  run: (id: string) => ['runs', id] as const,
  taxonomy: (id: string) => ['runs', id, 'taxonomy'] as const,
  conversation: (runId: string, id: string) => ['runs', runId, 'conversations', id] as const,
}

export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 15_000, retry: false })
export const useConfig = () => useQuery({ queryKey: keys.config, queryFn: api.config, staleTime: 60_000 })
export const useTargets = () => useQuery({ queryKey: keys.targets, queryFn: api.targets })

// poll quickly while anything is in flight so live numbers move
const runsRefetch = (q: { state: { data?: RunSummary[] } }) => (q.state.data?.some((r) => isActive(r.status)) ? 2_500 : 20_000)

/** The latest runs, for the sidebar. */
export const useRuns = () => useQuery({ queryKey: keys.runs, queryFn: () => api.runs(), refetchInterval: runsRefetch })

/** Every run (up to the API's cap), for the runs table. */
export const useAllRuns = () => useQuery({ queryKey: keys.allRuns, queryFn: () => api.runs({ limit: 500 }), refetchInterval: runsRefetch })

export const useRun = (id: string) => useQuery({ queryKey: keys.run(id), queryFn: () => api.run(id) })
