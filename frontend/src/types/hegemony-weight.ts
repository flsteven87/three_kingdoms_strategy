/**
 * Hegemony Weight Types
 *
 * TypeScript types for hegemony weight configuration and score calculation.
 * Matches backend Pydantic models (snake_case fields per CLAUDE.md 🟡)
 */

export interface HegemonyWeightBase {
  readonly weight_contribution: number
  readonly weight_merit: number
  readonly weight_assist: number
  readonly weight_donation: number
  readonly snapshot_weight: number
}

export interface HegemonyWeightCreate extends HegemonyWeightBase {
  readonly csv_upload_id: string
}

export interface HegemonyWeightUpdate {
  readonly weight_contribution?: number
  readonly weight_merit?: number
  readonly weight_assist?: number
  readonly weight_donation?: number
  readonly snapshot_weight?: number
}

export interface HegemonyWeight extends HegemonyWeightBase {
  readonly id: string
  readonly alliance_id: string
  readonly season_id: string
  readonly csv_upload_id: string
  readonly created_at: string
  readonly updated_at: string
}

export interface HegemonyWeightWithSnapshot extends HegemonyWeight {
  readonly snapshot_date: string
  readonly snapshot_filename: string
  readonly total_members: number
}

export interface HegemonyScorePreview {
  readonly member_id: string
  readonly member_name: string
  readonly final_score: number
  readonly rank: number
  readonly snapshot_scores: Record<string, number>
}

export interface SnapshotWeightsSummary {
  readonly season_id: string
  readonly season_name: string
  readonly total_snapshots: number
  readonly total_weight_sum: number
  readonly is_valid: boolean
  readonly weights: HegemonyWeightWithSnapshot[]
}

/**
 * Form state for editing a single snapshot's weights
 */
export interface SnapshotWeightFormState {
  readonly csv_upload_id: string
  readonly snapshot_date: string
  readonly snapshot_filename: string
  readonly weight_contribution: number
  readonly weight_merit: number
  readonly weight_assist: number
  readonly weight_donation: number
  readonly snapshot_weight: number
}

/**
 * Complete form state for all snapshots in a season
 */
export interface SeasonWeightsFormState {
  readonly season_id: string
  readonly snapshots: SnapshotWeightFormState[]
}
