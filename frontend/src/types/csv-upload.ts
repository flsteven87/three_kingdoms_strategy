/**
 * CSV Upload Types
 *
 * 符合 CLAUDE.md 🟡:
 * - snake_case field naming (matching backend)
 * - Type-safe interfaces
 */

export interface CsvUpload {
  readonly id: string
  readonly season_id: string
  readonly alliance_id: string
  readonly snapshot_date: string
  readonly file_name: string
  readonly total_members: number
  readonly uploaded_at: string
  readonly created_at: string
}

export interface CsvUploadResponse {
  readonly upload_id: string
  readonly season_id: string
  readonly alliance_id: string
  readonly snapshot_date: string
  readonly filename: string
  readonly total_members: number
  readonly total_snapshots: number
  readonly replaced_existing: boolean
}
