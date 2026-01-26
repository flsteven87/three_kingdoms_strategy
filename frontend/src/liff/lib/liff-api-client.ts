/**
 * LIFF API Client
 *
 * API client for LIFF pages - uses query params for auth instead of JWT.
 * All requests include u (userId) and g (groupId) as query parameters.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8087'

interface LiffApiOptions {
  lineUserId: string
  lineGroupId: string
}

async function liffFetch<T>(
  endpoint: string,
  options: LiffApiOptions,
  init?: RequestInit
): Promise<T> {
  const url = new URL(`${API_BASE_URL}/api/v1${endpoint}`)
  url.searchParams.set('u', options.lineUserId)
  url.searchParams.set('g', options.lineGroupId)

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// Member API

export interface RegisteredAccount {
  game_id: string
  display_name: string | null
  created_at: string
}

export interface MemberInfoResponse {
  has_registered: boolean
  registered_ids: RegisteredAccount[]
  alliance_name: string | null
}

export interface RegisterMemberResponse {
  has_registered: boolean
  registered_ids: RegisteredAccount[]
}

export async function getMemberInfo(options: LiffApiOptions): Promise<MemberInfoResponse> {
  return liffFetch<MemberInfoResponse>('/linebot/member/info', options)
}

export async function registerMember(
  options: LiffApiOptions & {
    displayName: string
    gameId: string
  }
): Promise<RegisterMemberResponse> {
  // P1 修復: POST body 已包含 userId/groupId，不需要 query params
  const response = await fetch(`${API_BASE_URL}/api/v1/linebot/member/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId: options.lineGroupId,
      userId: options.lineUserId,
      displayName: options.displayName,
      gameId: options.gameId,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Register failed')
  }

  return response.json()
}

export async function unregisterMember(
  options: LiffApiOptions & { gameId: string }
): Promise<RegisterMemberResponse> {
  const url = new URL(`${API_BASE_URL}/api/v1/linebot/member/unregister`)
  url.searchParams.set('u', options.lineUserId)
  url.searchParams.set('g', options.lineGroupId)
  url.searchParams.set('game_id', options.gameId)

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Unregister failed')
  }

  return response.json()
}

// Copper Mine API

export interface CopperMine {
  id: string
  game_id: string
  coord_x: number
  coord_y: number
  level: number
  status: string
  notes: string | null
  registered_at: string
}

export interface CopperMineListResponse {
  mines: CopperMine[]
  total: number
  my_count: number
  max_allowed: number
}

export interface RegisterCopperResponse {
  success: boolean
  mine: CopperMine | null
  message: string | null
}

export interface CopperMineRule {
  tier: number
  required_merit: number
  allowed_level: 'nine' | 'ten' | 'both'
}

export async function getCopperRules(
  options: Pick<LiffApiOptions, 'lineGroupId'>
): Promise<CopperMineRule[]> {
  const url = new URL(`${API_BASE_URL}/api/v1/linebot/copper/rules`)
  url.searchParams.set('g', options.lineGroupId)

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Request failed')
  }

  return response.json()
}

export async function getCopperMines(options: LiffApiOptions): Promise<CopperMineListResponse> {
  return liffFetch<CopperMineListResponse>('/linebot/copper/list', options)
}

export async function registerCopperMine(
  options: LiffApiOptions & {
    gameId: string
    coordX: number
    coordY: number
    level: number
    notes?: string
  }
): Promise<RegisterCopperResponse> {
  // P1 修復: POST body 已包含 userId/groupId，不需要 query params
  const response = await fetch(`${API_BASE_URL}/api/v1/linebot/copper/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId: options.lineGroupId,
      userId: options.lineUserId,
      gameId: options.gameId,
      coordX: options.coordX,
      coordY: options.coordY,
      level: options.level,
      notes: options.notes,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Register failed')
  }

  return response.json()
}

export async function deleteCopperMine(
  options: LiffApiOptions & { mineId: string }
): Promise<void> {
  const url = new URL(`${API_BASE_URL}/api/v1/linebot/copper/${options.mineId}`)
  url.searchParams.set('u', options.lineUserId)
  url.searchParams.set('g', options.lineGroupId)

  const response = await fetch(url.toString(), {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Delete failed')
  }
}

// Event Report API

export type EventCategory = 'battle' | 'siege' | 'forbidden'

export interface GroupEventStats {
  group_name: string
  member_count: number
  participated_count: number
  absent_count: number
  participation_rate: number
  total_merit: number
  avg_merit: number
  merit_min: number
  merit_max: number
  total_contribution: number
  avg_contribution: number
  total_assist: number
  avg_assist: number
  combined_min: number
  combined_max: number
  violator_count: number
}

export interface TopMemberItem {
  rank: number
  member_name: string
  group_name: string | null
  score: number
  merit_diff: number | null
  contribution_diff: number | null
  assist_diff: number | null
  line_display_name: string | null
}

export interface ViolatorItem {
  rank: number
  member_name: string
  group_name: string | null
  power_diff: number
  line_display_name: string | null
}

export interface EventSummary {
  total_members: number
  participated_count: number
  absent_count: number
  new_member_count: number
  participation_rate: number
  total_merit: number
  total_assist: number
  total_contribution: number
  avg_merit: number
  avg_assist: number
  mvp_member_id: string | null
  mvp_member_name: string | null
  mvp_merit: number | null
  mvp_contribution: number | null
  mvp_assist: number | null
  mvp_combined_score: number | null
  violator_count: number
}

export interface EventReportResponse {
  event_id: string
  event_name: string
  event_type: EventCategory | null
  event_start: string | null
  event_end: string | null
  summary: EventSummary
  group_stats: GroupEventStats[]
  top_members: TopMemberItem[]
  violators: ViolatorItem[]
}

export async function getEventReport(
  options: Pick<LiffApiOptions, 'lineGroupId'> & { eventId: string }
): Promise<EventReportResponse> {
  const url = new URL(`${API_BASE_URL}/api/v1/linebot/event/report`)
  url.searchParams.set('g', options.lineGroupId)
  url.searchParams.set('e', options.eventId)

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Request failed')
  }

  return response.json()
}

// Performance API

export interface PerformanceRank {
  current: number
  total: number
  change: number | null
}

export interface PerformanceMetrics {
  daily_contribution: number
  daily_merit: number
  daily_assist: number
  daily_donation: number
  power: number
}

export interface PerformanceTrendItem {
  period_label: string
  date: string
  daily_contribution: number
  daily_merit: number
}

export interface PerformanceSeasonTotal {
  contribution: number
  donation: number
  power: number
  power_change: number
}

export interface MemberPerformanceResponse {
  has_data: boolean
  game_id: string | null
  season_name: string | null
  rank: PerformanceRank | null
  latest: PerformanceMetrics | null
  alliance_avg: PerformanceMetrics | null
  alliance_median: PerformanceMetrics | null
  trend: PerformanceTrendItem[]
  season_total: PerformanceSeasonTotal | null
}

export async function getMemberPerformance(
  options: LiffApiOptions & { gameId: string }
): Promise<MemberPerformanceResponse> {
  const url = new URL(`${API_BASE_URL}/api/v1/linebot/member/performance`)
  url.searchParams.set('u', options.lineUserId)
  url.searchParams.set('g', options.lineGroupId)
  url.searchParams.set('game_id', options.gameId)

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Request failed')
  }

  return response.json()
}
