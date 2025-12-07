/**
 * API Client for backend communication
 *
 * 符合 CLAUDE.md 🔴:
 * - Type-safe API calls
 * - Error handling with Type Guards
 * - snake_case field naming
 */

import axios, { type AxiosInstance } from 'axios'
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

    const response = await this.client.post<CsvUploadResponse>('/api/v1/uploads', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
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
}

// Export singleton instance
export const apiClient = new ApiClient()
