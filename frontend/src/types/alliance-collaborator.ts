/**
 * Alliance Collaborator Types
 *
 * 符合 CLAUDE.md 🟡: snake_case for ALL API fields
 */

export interface AllianceCollaborator {
  readonly id: string
  readonly alliance_id: string
  readonly user_id: string
  readonly role: string
  readonly invited_by: string | null
  readonly joined_at: string
  readonly created_at: string
  readonly user_email?: string
  readonly user_name?: string
}

export interface AllianceCollaboratorCreate {
  readonly email: string
  readonly role?: string
}

export interface AllianceCollaboratorsResponse {
  readonly collaborators: AllianceCollaborator[]
  readonly total: number
}
