/**
 * API Client for backend communication
 *
 * 符合 CLAUDE.md 🔴:
 * - Type-safe API calls
 * - Error handling with Type Guards
 * - snake_case field naming
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Alliance, AllianceCreate, AllianceUpdate } from '@/types/alliance'
import type {
  AllianceCollaborator,
  AllianceCollaboratorCreate,
  AllianceCollaboratorsResponse
} from '@/types/alliance-collaborator'
import type { Season, SeasonCreate, SeasonUpdate } from '@/types/season'
import type { CsvUpload, CsvUploadResponse } from '@/types/csv-upload'
import type {
  HegemonyWeight,
  HegemonyWeightCreate,
  HegemonyWeightUpdate,
  HegemonyWeightWithSnapshot,
  HegemonyScorePreview,
  SnapshotWeightsSummary
} from '@/types/hegemony-weight'
import type { RecalculateSeasonPeriodsResponse } from '@/types/period'
import type {
  MemberListItem,
  MemberTrendItem,
  SeasonSummaryResponse,
  AllianceAveragesResponse,
  AllianceTrendItem,
  GroupListItem,
  GroupAnalyticsResponse,
  GroupComparisonItem,
  AllianceAnalyticsResponse
} from '@/types/analytics'
import type {
  BattleEvent,
  EventListItem,
  EventAnalyticsResponse,
  CreateEventRequest,
  EventUploadResponse,
} from '@/types/event'
import type {
  LineBindingCode,
  LineBindingStatusResponse,
  RegisteredMembersResponse
} from '@/types/line-binding'
import type {
  CopperMineRule,
  CreateCopperMineRuleRequest,
  UpdateCopperMineRuleRequest,
  CopperMineOwnership,
  CreateCopperMineOwnershipRequest,
  CopperMineOwnershipListResponse
} from '@/types/copper-mine'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8087'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      withCredentials: true
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        // Handle 401 Unauthorized - clear auth state
        if (error.response?.status === 401) {
          this.setAuthToken(null)
          // Redirect to landing handled by AuthContext
        }

        // Handle network errors
        if (!error.response) {
          console.error('Network error:', error.message)
        }

        return Promise.reject(error)
      }
    )
  }

  /**
   * Set authorization token for authenticated requests
   */
  setAuthToken(token: string | null) {
    if (token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete this.client.defaults.headers.common['Authorization']
    }
  }

  // ==================== Alliance API ====================

  /**
   * Get current user's alliance
   */
  async getAlliance(): Promise<Alliance | null> {
    const response = await this.client.get<Alliance | null>('/api/v1/alliances')
    return response.data
  }

  /**
   * Create new alliance
   */
  async createAlliance(data: AllianceCreate): Promise<Alliance> {
    const response = await this.client.post<Alliance>('/api/v1/alliances', data)
    return response.data
  }

  /**
   * Update alliance
   */
  async updateAlliance(data: AllianceUpdate): Promise<Alliance> {
    const response = await this.client.patch<Alliance>('/api/v1/alliances', data)
    return response.data
  }

  /**
   * Delete alliance
   */
  async deleteAlliance(): Promise<void> {
    await this.client.delete('/api/v1/alliances')
  }

  // ==================== Alliance Collaborator API ====================

  /**
   * Get all collaborators of an alliance
   */
  async getCollaborators(allianceId: string): Promise<AllianceCollaboratorsResponse> {
    const response = await this.client.get<AllianceCollaboratorsResponse>(
      `/api/v1/alliances/${allianceId}/collaborators`
    )
    return response.data
  }

  /**
   * Add collaborator to alliance by email
   */
  async addCollaborator(
    allianceId: string,
    data: AllianceCollaboratorCreate
  ): Promise<AllianceCollaborator> {
    const response = await this.client.post<AllianceCollaborator>(
      `/api/v1/alliances/${allianceId}/collaborators`,
      data
    )
    return response.data
  }

  /**
   * Remove collaborator from alliance
   */
  async removeCollaborator(allianceId: string, userId: string): Promise<void> {
    await this.client.delete(`/api/v1/alliances/${allianceId}/collaborators/${userId}`)
  }

  /**
   * Process pending invitations for current user (after login)
   */
  async processPendingInvitations(): Promise<{ processed_count: number; message: string }> {
    const response = await this.client.post<{ processed_count: number; message: string }>(
      '/api/v1/collaborators/process-invitations'
    )
    return response.data
  }

  /**
   * Update collaborator role in alliance
   */
  async updateCollaboratorRole(
    allianceId: string,
    userId: string,
    newRole: string
  ): Promise<{ id: string; user_id: string; role: string; updated_at: string }> {
    const response = await this.client.patch<{ id: string; user_id: string; role: string; updated_at: string }>(
      `/api/v1/alliances/${allianceId}/collaborators/${userId}/role`,
      null,
      { params: { new_role: newRole } }
    )
    return response.data
  }

  /**
   * Get current user's role in alliance
   */
  async getMyRole(allianceId: string): Promise<{ role: string }> {
    const response = await this.client.get<{ role: string }>(
      `/api/v1/alliances/${allianceId}/my-role`
    )
    return response.data
  }

  // ==================== Season API ====================

  /**
   * Get all seasons for current user's alliance
   */
  async getSeasons(activeOnly: boolean = false): Promise<Season[]> {
    const response = await this.client.get<Season[]>('/api/v1/seasons', {
      params: { active_only: activeOnly }
    })
    return response.data
  }

  /**
   * Get active season for current user's alliance
   */
  async getActiveSeason(): Promise<Season | null> {
    const response = await this.client.get<Season | null>('/api/v1/seasons/active')
    return response.data
  }

  /**
   * Get specific season by ID
   */
  async getSeason(seasonId: string): Promise<Season> {
    const response = await this.client.get<Season>(`/api/v1/seasons/${seasonId}`)
    return response.data
  }

  /**
   * Create new season
   */
  async createSeason(data: SeasonCreate): Promise<Season> {
    const response = await this.client.post<Season>('/api/v1/seasons', data)
    return response.data
  }

  /**
   * Update season
   */
  async updateSeason(seasonId: string, data: SeasonUpdate): Promise<Season> {
    const response = await this.client.patch<Season>(`/api/v1/seasons/${seasonId}`, data)
    return response.data
  }

  /**
   * Delete season
   */
  async deleteSeason(seasonId: string): Promise<void> {
    await this.client.delete(`/api/v1/seasons/${seasonId}`)
  }

  /**
   * Set season as active (deactivates all other seasons)
   */
  async activateSeason(seasonId: string): Promise<Season> {
    const response = await this.client.post<Season>(`/api/v1/seasons/${seasonId}/activate`)
    return response.data
  }

  // ==================== CSV Upload API ====================

  /**
   * Get all CSV uploads for a season
   */
  async getCsvUploads(seasonId: string): Promise<CsvUpload[]> {
    const response = await this.client.get<{ uploads: CsvUpload[]; total: number }>(
      '/api/v1/uploads',
      {
        params: { season_id: seasonId }
      }
    )
    return response.data.uploads
  }

  /**
   * Upload CSV file with optional custom snapshot date
   */
  async uploadCsv(
    seasonId: string,
    file: File,
    snapshotDate?: string
  ): Promise<CsvUploadResponse> {
    const formData = new FormData()
    formData.append('season_id', seasonId)
    formData.append('file', file)
    if (snapshotDate) {
      formData.append('snapshot_date', snapshotDate)
    }

    // IMPORTANT: Must set Content-Type to undefined to let axios automatically
    // set multipart/form-data with correct boundary parameter.
    // Manually setting 'multipart/form-data' without boundary breaks parsing.
    const response = await this.client.post<CsvUploadResponse>('/api/v1/uploads', formData, {
      headers: { 'Content-Type': undefined }
    })
    return response.data
  }

  /**
   * Delete CSV upload
   */
  async deleteCsvUpload(uploadId: string): Promise<void> {
    await this.client.delete(`/api/v1/uploads/${uploadId}`)
  }

  // ==================== Hegemony Weight API ====================

  /**
   * Get all hegemony weight configurations for a season
   */
  async getHegemonyWeights(seasonId: string): Promise<HegemonyWeightWithSnapshot[]> {
    const response = await this.client.get<HegemonyWeightWithSnapshot[]>(
      '/api/v1/hegemony-weights',
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Get summary of all snapshot weights for a season
   */
  async getHegemonyWeightsSummary(seasonId: string): Promise<SnapshotWeightsSummary> {
    const response = await this.client.get<SnapshotWeightsSummary>(
      '/api/v1/hegemony-weights/summary',
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Initialize default hegemony weights for all CSV uploads in a season
   */
  async initializeHegemonyWeights(seasonId: string): Promise<HegemonyWeight[]> {
    const response = await this.client.post<HegemonyWeight[]>(
      '/api/v1/hegemony-weights/initialize',
      null,
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Create a new hegemony weight configuration
   */
  async createHegemonyWeight(
    seasonId: string,
    data: HegemonyWeightCreate
  ): Promise<HegemonyWeight> {
    const response = await this.client.post<HegemonyWeight>(
      '/api/v1/hegemony-weights',
      data,
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Update hegemony weight configuration
   */
  async updateHegemonyWeight(
    weightId: string,
    data: HegemonyWeightUpdate
  ): Promise<HegemonyWeight> {
    const response = await this.client.patch<HegemonyWeight>(
      `/api/v1/hegemony-weights/${weightId}`,
      data
    )
    return response.data
  }

  /**
   * Delete hegemony weight configuration
   */
  async deleteHegemonyWeight(weightId: string): Promise<void> {
    await this.client.delete(`/api/v1/hegemony-weights/${weightId}`)
  }

  /**
   * Calculate and preview hegemony scores for top members
   */
  async previewHegemonyScores(
    seasonId: string,
    limit: number = 10
  ): Promise<HegemonyScorePreview[]> {
    const response = await this.client.get<HegemonyScorePreview[]>(
      '/api/v1/hegemony-weights/preview',
      {
        params: {
          season_id: seasonId,
          limit
        }
      }
    )
    return response.data
  }

  // ==================== Period Metrics API ====================

  /**
   * Recalculate all periods for a specific season
   */
  async recalculateSeasonPeriods(seasonId: string): Promise<RecalculateSeasonPeriodsResponse> {
    const response = await this.client.post<RecalculateSeasonPeriodsResponse>(
      `/api/v1/periods/seasons/${seasonId}/recalculate`
    )
    return response.data
  }

  // ==================== Analytics API ====================

  /**
   * Get all members for analytics member selector
   */
  async getAnalyticsMembers(
    seasonId: string,
    activeOnly: boolean = true
  ): Promise<MemberListItem[]> {
    const response = await this.client.get<MemberListItem[]>('/api/v1/analytics/members', {
      params: { season_id: seasonId, active_only: activeOnly }
    })
    return response.data
  }

  /**
   * Get member's performance trend across all periods in a season
   */
  async getMemberTrend(memberId: string, seasonId: string): Promise<MemberTrendItem[]> {
    const response = await this.client.get<MemberTrendItem[]>(
      `/api/v1/analytics/members/${memberId}/trend`,
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Get member's season-to-date summary
   */
  async getMemberSeasonSummary(
    memberId: string,
    seasonId: string
  ): Promise<SeasonSummaryResponse> {
    const response = await this.client.get<SeasonSummaryResponse>(
      `/api/v1/analytics/members/${memberId}/summary`,
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Get alliance average metrics for a specific period
   */
  async getPeriodAverages(periodId: string): Promise<AllianceAveragesResponse> {
    const response = await this.client.get<AllianceAveragesResponse>(
      `/api/v1/analytics/periods/${periodId}/averages`
    )
    return response.data
  }

  /**
   * Get alliance averages for each period in a season
   */
  async getAllianceTrend(seasonId: string): Promise<AllianceTrendItem[]> {
    const response = await this.client.get<AllianceTrendItem[]>('/api/v1/analytics/alliance/trend', {
      params: { season_id: seasonId }
    })
    return response.data
  }

  /**
   * Get alliance average and median metrics for season-to-date
   * Used for "賽季以來" view mode comparison baseline
   */
  async getSeasonAverages(seasonId: string): Promise<AllianceAveragesResponse> {
    const response = await this.client.get<AllianceAveragesResponse>(
      `/api/v1/analytics/seasons/${seasonId}/averages`
    )
    return response.data
  }

  // ==================== Group Analytics API ====================

  /**
   * Get list of all groups with member counts
   */
  async getGroups(seasonId: string): Promise<GroupListItem[]> {
    const response = await this.client.get<GroupListItem[]>('/api/v1/analytics/groups', {
      params: { season_id: seasonId }
    })
    return response.data
  }

  /**
   * Get complete analytics for a specific group
   * @param view - 'latest' for latest period, 'season' for season average
   */
  async getGroupAnalytics(
    groupName: string,
    seasonId: string,
    view: 'latest' | 'season' = 'latest'
  ): Promise<GroupAnalyticsResponse> {
    const response = await this.client.get<GroupAnalyticsResponse>(
      `/api/v1/analytics/groups/${encodeURIComponent(groupName)}`,
      {
        params: { season_id: seasonId, view }
      }
    )
    return response.data
  }

  /**
   * Get comparison data for all groups
   * @param view - 'latest' for latest period, 'season' for season average
   */
  async getGroupsComparison(seasonId: string, view: 'latest' | 'season' = 'latest'): Promise<GroupComparisonItem[]> {
    const response = await this.client.get<GroupComparisonItem[]>(
      '/api/v1/analytics/groups/comparison',
      {
        params: { season_id: seasonId, view }
      }
    )
    return response.data
  }

  // ==================== Alliance Analytics API ====================

  /**
   * Get complete alliance analytics for AllianceAnalytics page
   * @param view - 'latest' for latest period, 'season' for season average
   */
  async getAllianceAnalytics(
    seasonId: string,
    view: 'latest' | 'season' = 'latest'
  ): Promise<AllianceAnalyticsResponse> {
    const response = await this.client.get<AllianceAnalyticsResponse>(
      '/api/v1/analytics/alliance',
      {
        params: { season_id: seasonId, view }
      }
    )
    return response.data
  }

  // ==================== Event API ====================

  /**
   * Get all events for a season
   */
  async getEvents(seasonId: string): Promise<EventListItem[]> {
    const response = await this.client.get<EventListItem[]>('/api/v1/events', {
      params: { season_id: seasonId }
    })
    return response.data
  }

  /**
   * Get event details by ID
   */
  async getEvent(eventId: string): Promise<BattleEvent> {
    const response = await this.client.get<BattleEvent>(`/api/v1/events/${eventId}`)
    return response.data
  }

  /**
   * Get complete event analytics
   */
  async getEventAnalytics(eventId: string): Promise<EventAnalyticsResponse> {
    const response = await this.client.get<EventAnalyticsResponse>(
      `/api/v1/events/${eventId}/analytics`
    )
    return response.data
  }

  /**
   * Create a new battle event
   */
  async createEvent(seasonId: string, data: CreateEventRequest): Promise<BattleEvent> {
    const response = await this.client.post<BattleEvent>('/api/v1/events', data, {
      params: { season_id: seasonId }
    })
    return response.data
  }

  /**
   * Upload CSV for event analysis (separate from regular data management uploads)
   *
   * Unlike regular uploads, event CSV uploads:
   * - Do NOT trigger period calculation
   * - Can have multiple uploads on the same day
   * - Are stored with upload_type='event'
   */
  async uploadEventCsv(
    seasonId: string,
    file: File,
    snapshotDate?: string
  ): Promise<EventUploadResponse> {
    const formData = new FormData()
    formData.append('season_id', seasonId)
    formData.append('file', file)
    if (snapshotDate) {
      formData.append('snapshot_date', snapshotDate)
    }

    // IMPORTANT: Must explicitly set Content-Type to undefined to let axios
    // automatically set multipart/form-data with correct boundary.
    // The default 'application/json' from client config would break FormData.
    const response = await this.client.post<EventUploadResponse>(
      '/api/v1/events/upload-csv',
      formData,
      { headers: { 'Content-Type': undefined } }
    )
    return response.data
  }

  /**
   * Process event snapshots (calculate metrics from before/after uploads)
   */
  async processEvent(
    eventId: string,
    beforeUploadId: string,
    afterUploadId: string
  ): Promise<BattleEvent> {
    const response = await this.client.post<BattleEvent>(
      `/api/v1/events/${eventId}/process`,
      {
        before_upload_id: beforeUploadId,
        after_upload_id: afterUploadId
      }
    )
    return response.data
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string): Promise<void> {
    await this.client.delete(`/api/v1/events/${eventId}`)
  }

  // ==================== LINE Binding API ====================

  /**
   * Get LINE binding status for current user's alliance
   */
  async getLineBindingStatus(): Promise<LineBindingStatusResponse> {
    const response = await this.client.get<LineBindingStatusResponse>(
      '/api/v1/linebot/binding'
    )
    return response.data
  }

  /**
   * Generate a new binding code for linking LINE group
   */
  async generateLineBindingCode(): Promise<LineBindingCode> {
    const response = await this.client.post<LineBindingCode>(
      '/api/v1/linebot/codes'
    )
    return response.data
  }

  /**
   * Unbind LINE group from alliance
   */
  async unbindLineGroup(): Promise<void> {
    await this.client.delete('/api/v1/linebot/binding')
  }

  /**
   * Get registered members list for LINE binding
   */
  async getRegisteredMembers(): Promise<RegisteredMembersResponse> {
    const response = await this.client.get<RegisteredMembersResponse>(
      '/api/v1/linebot/binding/members'
    )
    return response.data
  }

  // ==================== Copper Mine API ====================

  /**
   * Get all copper mine rules for current user's alliance
   */
  async getCopperMineRules(): Promise<CopperMineRule[]> {
    const response = await this.client.get<CopperMineRule[]>(
      '/api/v1/copper-mines/rules'
    )
    return response.data
  }

  /**
   * Create a new copper mine rule
   */
  async createCopperMineRule(data: CreateCopperMineRuleRequest): Promise<CopperMineRule> {
    const response = await this.client.post<CopperMineRule>(
      '/api/v1/copper-mines/rules',
      data
    )
    return response.data
  }

  /**
   * Update a copper mine rule
   */
  async updateCopperMineRule(
    ruleId: string,
    data: UpdateCopperMineRuleRequest
  ): Promise<CopperMineRule> {
    const response = await this.client.patch<CopperMineRule>(
      `/api/v1/copper-mines/rules/${ruleId}`,
      data
    )
    return response.data
  }

  /**
   * Delete a copper mine rule
   */
  async deleteCopperMineRule(ruleId: string): Promise<void> {
    await this.client.delete(`/api/v1/copper-mines/rules/${ruleId}`)
  }

  /**
   * Get copper mine ownerships for a season
   */
  async getCopperMineOwnerships(seasonId: string): Promise<CopperMineOwnershipListResponse> {
    const response = await this.client.get<CopperMineOwnershipListResponse>(
      '/api/v1/copper-mines/ownerships',
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Create a copper mine ownership
   */
  async createCopperMineOwnership(
    seasonId: string,
    data: CreateCopperMineOwnershipRequest
  ): Promise<CopperMineOwnership> {
    const response = await this.client.post<CopperMineOwnership>(
      '/api/v1/copper-mines/ownerships',
      data,
      {
        params: { season_id: seasonId }
      }
    )
    return response.data
  }

  /**
   * Delete a copper mine ownership
   */
  async deleteCopperMineOwnership(ownershipId: string): Promise<void> {
    await this.client.delete(`/api/v1/copper-mines/ownerships/${ownershipId}`)
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
