/**
 * Copper Mine API
 *
 * Copper mine rules and ownership management endpoints.
 */

import { axiosInstance } from './base-client'
import type {
  CopperMineRule,
  CreateCopperMineRuleRequest,
  UpdateCopperMineRuleRequest,
  CopperMineOwnership,
  CreateCopperMineOwnershipRequest,
  CopperMineOwnershipListResponse,
  CopperCoordinateSearchResult,
  CopperCoordinateLookupResult,
} from '@/types/copper-mine'

// ==================== Copper Mine Rules API ====================

export async function getCopperMineRules(): Promise<CopperMineRule[]> {
  const response = await axiosInstance.get<CopperMineRule[]>(
    '/api/v1/copper-mines/rules'
  )
  return response.data
}

export async function createCopperMineRule(data: CreateCopperMineRuleRequest): Promise<CopperMineRule> {
  const response = await axiosInstance.post<CopperMineRule>(
    '/api/v1/copper-mines/rules',
    data
  )
  return response.data
}

export async function updateCopperMineRule(
  ruleId: string,
  data: UpdateCopperMineRuleRequest
): Promise<CopperMineRule> {
  const response = await axiosInstance.patch<CopperMineRule>(
    `/api/v1/copper-mines/rules/${ruleId}`,
    data
  )
  return response.data
}

export async function deleteCopperMineRule(ruleId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/copper-mines/rules/${ruleId}`)
}

// ==================== Copper Mine Ownership API ====================

export async function getCopperMineOwnerships(seasonId: string): Promise<CopperMineOwnershipListResponse> {
  const response = await axiosInstance.get<CopperMineOwnershipListResponse>(
    '/api/v1/copper-mines/ownerships',
    {
      params: { season_id: seasonId }
    }
  )
  return response.data
}

export async function createCopperMineOwnership(
  seasonId: string,
  data: CreateCopperMineOwnershipRequest
): Promise<CopperMineOwnership> {
  const response = await axiosInstance.post<CopperMineOwnership>(
    '/api/v1/copper-mines/ownerships',
    data,
    {
      params: { season_id: seasonId }
    }
  )
  return response.data
}

export async function deleteCopperMineOwnership(ownershipId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/copper-mines/ownerships/${ownershipId}`)
}

export async function updateCopperMineOwnership(
  ownershipId: string,
  seasonId: string,
  data: { member_id: string }
): Promise<CopperMineOwnership> {
  const response = await axiosInstance.patch<CopperMineOwnership>(
    `/api/v1/copper-mines/ownerships/${ownershipId}`,
    data,
    {
      params: { season_id: seasonId }
    }
  )
  return response.data
}

// ==================== Copper Mine Coordinate Search API ====================

export async function searchCopperCoordinates(
  seasonId: string,
  query: string
): Promise<CopperCoordinateSearchResult[]> {
  const response = await axiosInstance.get<CopperCoordinateSearchResult[]>(
    '/api/v1/copper-mines/coordinates/search',
    {
      params: { season_id: seasonId, q: query }
    }
  )
  return response.data
}

export async function lookupCopperCoordinate(
  seasonId: string,
  coordX: number,
  coordY: number
): Promise<CopperCoordinateLookupResult> {
  const response = await axiosInstance.get<CopperCoordinateLookupResult>(
    '/api/v1/copper-mines/coordinates/lookup',
    {
      params: { season_id: seasonId, coord_x: coordX, coord_y: coordY }
    }
  )
  return response.data
}
