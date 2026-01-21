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
  CopperMineOwnershipListResponse
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
