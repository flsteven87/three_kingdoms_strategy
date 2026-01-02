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
  return liffFetch<RegisterMemberResponse>('/linebot/member/register', options, {
    method: 'POST',
    body: JSON.stringify({
      groupId: options.lineGroupId,
      userId: options.lineUserId,
      displayName: options.displayName,
      gameId: options.gameId,
    }),
  })
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
}

export interface RegisterCopperResponse {
  success: boolean
  mine: CopperMine | null
  message: string | null
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
  return liffFetch<RegisterCopperResponse>('/linebot/copper/register', options, {
    method: 'POST',
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
