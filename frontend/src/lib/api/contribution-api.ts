import { axiosInstance } from './base-client'

export type ContributionType = 'regular' | 'penalty'
export type ContributionStatus = 'active' | 'completed' | 'cancelled'

export interface ContributionListItem {
  id: string
  season_id: string
  alliance_id: string
  title: string
  type: ContributionType
  deadline: string
  target_amount: number
  description: string | null
  status: ContributionStatus
  created_at: string
  created_by: string | null
  updated_at: string
}

export interface ContributionMemberInfo {
  member_id: string
  member_name: string
  target_amount: number
  contribution_made: number // end snapshot total
}

export interface ContributionDetail extends ContributionListItem {
  contribution_info: ContributionMemberInfo[]
}

export interface CreateContributionPayload {
  title: string
  type: ContributionType
  deadline: string // ISO datetime or date
  target_amount: number
  description?: string
}

export interface TargetOverridePayload {
  member_id: string
  target_amount: number
}

const basePath = '/api/v1/contributions'

export async function getContributions(allianceId: string, seasonId: string): Promise<ContributionListItem[]> {
  const params = new URLSearchParams({ alliance_id: String(allianceId), season_id: String(seasonId) })
  const response = await axiosInstance.get<ContributionListItem[]>(`${basePath}?${params.toString()}`)
  return response.data
}

export async function getContributionDetail(contributionId: string): Promise<ContributionDetail> {
  const response = await axiosInstance.get<ContributionDetail>(`${basePath}/${contributionId}`)
  return response.data
}

export async function createContribution(allianceId: string, seasonId: string, payload: CreateContributionPayload): Promise<ContributionListItem> {
  const params = new URLSearchParams({ alliance_id: String(allianceId), season_id: String(seasonId) })
  const response = await axiosInstance.post<ContributionListItem>(`${basePath}?${params.toString()}`, payload)
  return response.data
}

export async function deleteContribution(contributionId: string): Promise<void> {
  await axiosInstance.delete(`${basePath}/${contributionId}`)
}

export async function upsertMemberTargetOverride(contributionId: string, payload: TargetOverridePayload): Promise<void> {
  await axiosInstance.post(`${basePath}/${contributionId}/targets`, payload)
}

export async function deleteMemberTargetOverride(contributionId: string, memberId: string): Promise<void> {
  await axiosInstance.delete(`${basePath}/${contributionId}/targets/${memberId}`)
}
