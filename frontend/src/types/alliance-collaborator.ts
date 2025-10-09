/**
 * Alliance Collaborator Types
 *
 * 符合 CLAUDE.md 🟡: snake_case for ALL API fields
 */

export interface AllianceCollaborator {
  readonly id: string
  readonly alliance_id?: string
  readonly user_id?: string
  readonly role: string
  readonly invited_by?: string | null
  readonly joined_at?: string
  readonly created_at?: string
  readonly user_email?: string
  readonly user_name?: string
  readonly user_full_name?: string // Google OAuth full name
  readonly user_avatar_url?: string // Google OAuth avatar URL
  // Pending invitation fields (when user not yet registered)
  readonly invited_email?: string
  readonly invited_at?: string
  readonly status?: string
  readonly is_pending_registration?: boolean
  readonly message?: string
}

export interface AllianceCollaboratorCreate {
  readonly email: string
  readonly role?: string
}

export interface AllianceCollaboratorsResponse {
  readonly collaborators: AllianceCollaborator[]
  readonly total: number
}
