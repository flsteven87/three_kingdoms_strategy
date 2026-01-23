/**
 * Season Quota API
 *
 * Season quota status endpoint.
 */

import { axiosInstance } from './base-client'
import type { SeasonQuotaStatus } from '@/types/season-quota'

/**
 * Get current user's alliance season quota status
 */
export async function getSeasonQuotaStatus(): Promise<SeasonQuotaStatus> {
  const response = await axiosInstance.get<SeasonQuotaStatus>('/api/v1/season-quota')
  return response.data
}
