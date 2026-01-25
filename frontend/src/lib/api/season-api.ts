/**
 * Season API - Season Purchase System
 *
 * Season CRUD and activation endpoints.
 *
 * Key concepts:
 * - activation_status: draft → activated → completed (payment state)
 * - is_current: Whether this season is selected for display
 */

import { axiosInstance } from './base-client'
import type { Season, SeasonCreate, SeasonUpdate, SeasonActivateResponse } from '@/types/season'

export async function getSeasons(activatedOnly: boolean = false): Promise<Season[]> {
  const response = await axiosInstance.get<Season[]>('/api/v1/seasons', {
    params: { activated_only: activatedOnly }
  })
  return response.data
}

export async function getCurrentSeason(): Promise<Season | null> {
  const response = await axiosInstance.get<Season | null>('/api/v1/seasons/current')
  return response.data
}

export async function getSeason(seasonId: string): Promise<Season> {
  const response = await axiosInstance.get<Season>(`/api/v1/seasons/${seasonId}`)
  return response.data
}

export async function createSeason(data: SeasonCreate): Promise<Season> {
  const response = await axiosInstance.post<Season>('/api/v1/seasons', data)
  return response.data
}

export async function updateSeason(seasonId: string, data: SeasonUpdate): Promise<Season> {
  const response = await axiosInstance.patch<Season>(`/api/v1/seasons/${seasonId}`, data)
  return response.data
}

export async function deleteSeason(seasonId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/seasons/${seasonId}`)
}

/**
 * Activate a draft season (consume season credit or use trial)
 *
 * Changes activation_status from 'draft' to 'activated'.
 * Consumes one season credit (or free if trial is active).
 */
export async function activateSeason(seasonId: string): Promise<SeasonActivateResponse> {
  const response = await axiosInstance.post<SeasonActivateResponse>(
    `/api/v1/seasons/${seasonId}/activate`
  )
  return response.data
}

/**
 * Set an activated season as current (selected for display)
 *
 * Only activated seasons can be set as current.
 * This unsets the current flag on all other seasons.
 */
export async function setCurrentSeason(seasonId: string): Promise<Season> {
  const response = await axiosInstance.post<Season>(`/api/v1/seasons/${seasonId}/set-current`)
  return response.data
}

/**
 * Mark a season as completed
 *
 * Changes activation_status from 'activated' to 'completed'.
 */
export async function completeSeason(seasonId: string): Promise<Season> {
  const response = await axiosInstance.post<Season>(`/api/v1/seasons/${seasonId}/complete`)
  return response.data
}

/**
 * Reopen a completed season back to activated status
 *
 * Changes activation_status from 'completed' to 'activated'.
 */
export async function reopenSeason(seasonId: string): Promise<Season> {
  const response = await axiosInstance.post<Season>(`/api/v1/seasons/${seasonId}/reopen`)
  return response.data
}

// Legacy alias for backward compatibility (will be removed)
export const getActiveSeason = getCurrentSeason
