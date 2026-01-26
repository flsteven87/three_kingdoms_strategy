/**
 * LINE Binding TypeScript Types
 *
 * Types for LINE Bot integration feature
 */

// =============================================================================
// Binding Code Types
// =============================================================================

export interface LineBindingCode {
  readonly code: string
  readonly expires_at: string
  readonly is_test: boolean
  readonly created_at: string
}

// =============================================================================
// Group Binding Types
// =============================================================================

export interface LineGroupBinding {
  readonly id: string
  readonly alliance_id: string
  readonly line_group_id: string
  readonly group_name: string | null
  readonly group_picture_url: string | null
  readonly bound_at: string
  readonly is_active: boolean
  readonly is_test: boolean
  readonly member_count: number
}

// =============================================================================
// Member LINE Binding Types
// =============================================================================

export interface MemberLineBinding {
  readonly id: string
  readonly alliance_id: string
  readonly member_id: string | null
  readonly line_user_id: string
  readonly line_display_name: string
  readonly game_id: string
  readonly is_verified: boolean
  readonly bound_at: string
}

// =============================================================================
// Registered Members Types (Admin View)
// =============================================================================

export interface RegisteredMemberItem {
  readonly line_user_id: string
  readonly line_display_name: string
  readonly game_id: string
  readonly is_verified: boolean
  readonly registered_at: string
}

export interface RegisteredMembersResponse {
  readonly members: RegisteredMemberItem[]
  readonly total: number
}

export interface LineCustomCommand {
  readonly id: string
  readonly command_name: string
  readonly trigger_keyword: string
  readonly response_message: string
  readonly is_enabled: boolean
  readonly created_at: string
  readonly updated_at: string
}

export interface LineCustomCommandCreate {
  readonly command_name: string
  readonly trigger_keyword: string
  readonly response_message: string
  readonly is_enabled: boolean
}

export interface LineCustomCommandUpdate {
  readonly command_name?: string
  readonly trigger_keyword?: string
  readonly response_message?: string
  readonly is_enabled?: boolean
}

// =============================================================================
// API Response Types
// =============================================================================

export interface LineBindingStatusResponse {
  readonly is_bound: boolean
  readonly bindings: LineGroupBinding[]
  readonly pending_code: LineBindingCode | null
}
