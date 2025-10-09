/**
 * Alliance Collaborators TanStack Query Hooks
 *
 * 符合 CLAUDE.md 🔴:
 * - Use TanStack Query for server state
 * - Query Key Factories
 * - Type-safe hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AllianceCollaboratorCreate } from '@/types/alliance-collaborator'

/**
 * Query key factory for alliance collaborators
 */
export const collaboratorKeys = {
  all: ['alliance-collaborators'] as const,
  byAlliance: (allianceId: string) =>
    [...collaboratorKeys.all, 'alliance', allianceId] as const
}

/**
 * Fetch alliance collaborators
 */
export const useAllianceCollaborators = (allianceId: string | undefined) => {
  return useQuery({
    queryKey: allianceId ? collaboratorKeys.byAlliance(allianceId) : [],
    queryFn: () => apiClient.getCollaborators(allianceId!),
    enabled: !!allianceId
  })
}

/**
 * Add collaborator to alliance
 */
export const useAddAllianceCollaborator = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      allianceId,
      data
    }: {
      allianceId: string
      data: AllianceCollaboratorCreate
    }) => apiClient.addCollaborator(allianceId, data),
    onSuccess: (_, { allianceId }) => {
      // Invalidate collaborators list
      queryClient.invalidateQueries({
        queryKey: collaboratorKeys.byAlliance(allianceId)
      })
    }
  })
}

/**
 * Remove collaborator from alliance
 */
export const useRemoveAllianceCollaborator = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ allianceId, userId }: { allianceId: string; userId: string }) =>
      apiClient.removeCollaborator(allianceId, userId),
    onSuccess: (_, { allianceId }) => {
      // Invalidate collaborators list
      queryClient.invalidateQueries({
        queryKey: collaboratorKeys.byAlliance(allianceId)
      })
    }
  })
}
