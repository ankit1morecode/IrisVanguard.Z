import type { Frame, InitPayload, RunMeta, ScenarioInfo, SimEvent } from './types'

const BASE = '/api/v1'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`)
  return body as T
}

export const api = {
  health: () => req<{ ok: boolean; db: boolean; liveRuns: number }>('/health'),
  scenarios: () => req<ScenarioInfo[]>('/scenarios'),
  strategies: () => req<{ id: string; label: string }[]>('/strategies'),
  runs: () => req<RunMeta[]>('/runs'),
  run: (id: string) => req<RunMeta>(`/runs/${id}`),
  init: (id: string) => req<InitPayload>(`/runs/${id}/init`),
  frames: (id: string, from = 0, limit = 1000) => req<Frame[]>(`/runs/${id}/frames?from=${from}&limit=${limit}`),
  group: (id: string) => req<{ groupId: string; runs: RunMeta[] }>(`/groups/${id}`),
  message: (id: string, key: string) => req<{ key: string; events: SimEvent[] }>(`/runs/${id}/messages/${encodeURIComponent(key)}`),
  start: (body: { scenario: string; strategy: string; seed?: number | null; speed: number }) =>
    req<RunMeta>('/runs', { method: 'POST', body: JSON.stringify(body) }),
  compare: (body: { scenario: string; strategies: string[]; seed?: number | null; speed: number }) =>
    req<{ groupId: string; runs: RunMeta[] }>('/runs/compare', { method: 'POST', body: JSON.stringify(body) }),
  control: (id: string, cmd: Record<string, unknown>) =>
    req<{ ok: boolean }>(`/runs/${id}/control`, { method: 'POST', body: JSON.stringify(cmd) }),
  remove: (id: string) => req<{ ok: boolean }>(`/runs/${id}`, { method: 'DELETE' }),
}

export function wsUrl(runId: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/runs/${runId}`
}
