/**
 * Season API Types
 *
 * 符合 CLAUDE.md 🟡: snake_case naming matching backend schema
 */

export interface Season {
  readonly id: string
  readonly alliance_id: string
  readonly name: string
  readonly start_date: string
  readonly end_date: string | null
  readonly is_active: boolean
  readonly description: string | null
  readonly created_at: string
  readonly updated_at: string
}

export interface SeasonCreate {
  readonly alliance_id: string
  readonly name: string
  readonly start_date: string
  readonly end_date?: string | null
  readonly is_active?: boolean
  readonly description?: string | null
}

export interface SeasonUpdate {
  readonly name?: string
  readonly start_date?: string
  readonly end_date?: string | null
  readonly is_active?: boolean
  readonly description?: string | null
}
