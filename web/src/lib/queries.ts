import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { isActive } from './format'

export const keys = {
  health: ['health'] as const,
  config: ['config'] as const,
  targets: ['targets'] as const,
  runs: ['runs'] as const,
  run: (id: string) => ['runs', id] as const,
  taxonomy: (id: string) => ['runs', id, 'taxonomy'] as const,
  conversation: (runId: string, id: string) => ['runs', runId, 'conversations', id] as const,
}

export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 15_000, retry: false })
export const useConfig = () => useQuery({ queryKey: keys.config, queryFn: api.config, staleTime: 60_000 })
export const useTargets = () => useQuery({ queryKey: keys.targets, queryFn: api.targets })

export const useRuns = () =>
  useQuery({
    queryKey: keys.runs,
    queryFn: () => api.runs(),
    // poll quickly while anything is in flight so the sidebar's live numbers move
    refetchInterval: (q) => (q.state.data?.some((r) => isActive(r.status)) ? 2_500 : 20_000),
  })

export const useRun = (id: string) => useQuery({ queryKey: keys.run(id), queryFn: () => api.run(id) })
