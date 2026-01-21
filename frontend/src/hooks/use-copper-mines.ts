/**
 * Copper Mines TanStack Query Hooks
 *
 * Hooks for copper mine rules (alliance level) and ownership records (season level).
 * Features optimistic updates for seamless UX.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  CopperMineRule,
  CopperMineOwnership,
  CreateCopperMineRuleRequest,
  UpdateCopperMineRuleRequest,
  CreateCopperMineOwnershipRequest,
  MemberCopperMineStatus,
} from '@/types/copper-mine'

// =============================================================================
// Query Keys
// =============================================================================

export const copperMineKeys = {
  all: ['copper-mines'] as const,

  // Rules (alliance level - auto-determined by backend)
  rules: () => [...copperMineKeys.all, 'rules'] as const,

  // Ownerships (season level)
  ownerships: () => [...copperMineKeys.all, 'ownerships'] as const,
  ownershipsBySeason: (seasonId: string) =>
    [...copperMineKeys.ownerships(), seasonId] as const,

  // Member status (for validation)
  memberStatus: (seasonId: string, memberId: string) =>
    [...copperMineKeys.all, 'member-status', seasonId, memberId] as const,
}

// =============================================================================
// Query Hooks - Rules
// =============================================================================

/**
 * Get all copper mine rules for current user's alliance
 */
export function useCopperMineRules() {
  return useQuery({
    queryKey: copperMineKeys.rules(),
    queryFn: () => apiClient.getCopperMineRules(),
  })
}

// =============================================================================
// Mutation Hooks - Rules (with Optimistic Updates)
// =============================================================================

/**
 * Create a new copper mine rule with optimistic update
 */
export function useCreateCopperMineRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCopperMineRuleRequest) =>
      apiClient.createCopperMineRule(data),

    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.rules(),
      })

      // Snapshot current data
      const previousRules = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rules()
      )

      // Optimistically add the new rule
      const optimisticRule: CopperMineRule = {
        id: `temp-${Date.now()}`,
        alliance_id: 'temp',
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      queryClient.setQueryData<CopperMineRule[]>(
        copperMineKeys.rules(),
        (old) => [...(old || []), optimisticRule].sort((a, b) => a.tier - b.tier)
      )

      return { previousRules }
    },

    onError: (_err, _data, context) => {
      // Rollback on error
      if (context?.previousRules) {
        queryClient.setQueryData(copperMineKeys.rules(), context.previousRules)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.rules(),
      })
    },
  })
}

/**
 * Update a copper mine rule with optimistic update
 */
export function useUpdateCopperMineRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ruleId,
      data,
    }: {
      ruleId: string
      data: UpdateCopperMineRuleRequest
    }) => apiClient.updateCopperMineRule(ruleId, data),

    onMutate: async ({ ruleId, data }) => {
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.rules(),
      })

      const previousRules = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rules()
      )

      // Optimistically update the rule
      queryClient.setQueryData<CopperMineRule[]>(copperMineKeys.rules(), (old) =>
        old?.map((rule) =>
          rule.id === ruleId
            ? { ...rule, ...data, updated_at: new Date().toISOString() }
            : rule
        )
      )

      return { previousRules }
    },

    onError: (_err, _data, context) => {
      if (context?.previousRules) {
        queryClient.setQueryData(copperMineKeys.rules(), context.previousRules)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.rules(),
      })
    },
  })
}

/**
 * Delete a copper mine rule with optimistic update
 */
export function useDeleteCopperMineRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ruleId: string) => apiClient.deleteCopperMineRule(ruleId),

    onMutate: async (ruleId) => {
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.rules(),
      })

      const previousRules = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rules()
      )

      // Optimistically remove the rule
      queryClient.setQueryData<CopperMineRule[]>(copperMineKeys.rules(), (old) =>
        old?.filter((rule) => rule.id !== ruleId)
      )

      return { previousRules }
    },

    onError: (_err, _data, context) => {
      if (context?.previousRules) {
        queryClient.setQueryData(copperMineKeys.rules(), context.previousRules)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.rules(),
      })
    },
  })
}

// =============================================================================
// Query Hooks - Ownerships
// =============================================================================

/**
 * Get all copper mine ownerships for a season
 */
export function useCopperMineOwnerships(seasonId: string | null) {
  return useQuery({
    queryKey: copperMineKeys.ownershipsBySeason(seasonId || ''),
    queryFn: async () => {
      const response = await apiClient.getCopperMineOwnerships(seasonId!)
      return response.ownerships
    },
    enabled: !!seasonId,
  })
}

// =============================================================================
// Mutation Hooks - Ownerships (with Optimistic Updates)
// =============================================================================

/**
 * Create a new copper mine ownership record with optimistic update
 */
export function useCreateCopperMineOwnership() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      seasonId,
      data,
    }: {
      seasonId: string
      data: CreateCopperMineOwnershipRequest
    }) => apiClient.createCopperMineOwnership(seasonId, data),

    onMutate: async ({ seasonId, data }) => {
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.ownershipsBySeason(seasonId),
      })

      const previousOwnerships = queryClient.getQueryData<CopperMineOwnership[]>(
        copperMineKeys.ownershipsBySeason(seasonId)
      )

      const optimisticOwnership: CopperMineOwnership = {
        id: `temp-${Date.now()}`,
        season_id: seasonId,
        ...data,
        applied_at: data.applied_at || new Date().toISOString(),
        created_at: new Date().toISOString(),
        registered_via: 'dashboard',
        member_name: '載入中...',
        member_group: null,
        line_display_name: null,
      }

      queryClient.setQueryData<CopperMineOwnership[]>(
        copperMineKeys.ownershipsBySeason(seasonId),
        (old) =>
          [optimisticOwnership, ...(old || [])].sort(
            (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
          )
      )

      return { previousOwnerships }
    },

    onError: (_err, { seasonId }, context) => {
      if (context?.previousOwnerships) {
        queryClient.setQueryData(
          copperMineKeys.ownershipsBySeason(seasonId),
          context.previousOwnerships
        )
      }
    },

    onSettled: (_data, _error, { seasonId }) => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.ownershipsBySeason(seasonId),
      })
    },
  })
}

/**
 * Delete a copper mine ownership record with optimistic update
 */
export function useDeleteCopperMineOwnership() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ownershipId }: { ownershipId: string; seasonId: string }) =>
      apiClient.deleteCopperMineOwnership(ownershipId),

    onMutate: async ({ ownershipId, seasonId }) => {
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.ownershipsBySeason(seasonId),
      })

      const previousOwnerships = queryClient.getQueryData<CopperMineOwnership[]>(
        copperMineKeys.ownershipsBySeason(seasonId)
      )

      queryClient.setQueryData<CopperMineOwnership[]>(
        copperMineKeys.ownershipsBySeason(seasonId),
        (old) => old?.filter((o) => o.id !== ownershipId)
      )

      return { previousOwnerships }
    },

    onError: (_err, { seasonId }, context) => {
      if (context?.previousOwnerships) {
        queryClient.setQueryData(
          copperMineKeys.ownershipsBySeason(seasonId),
          context.previousOwnerships
        )
      }
    },

    onSettled: (_data, _error, { seasonId }) => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.ownershipsBySeason(seasonId),
      })
    },
  })
}

/**
 * Update a copper mine ownership record (for transferring reserved mines)
 */
export function useUpdateCopperMineOwnership() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ownershipId,
      seasonId,
      data,
    }: {
      ownershipId: string
      seasonId: string
      data: { member_id: string }
    }) => apiClient.updateCopperMineOwnership(ownershipId, seasonId, data),

    onSettled: (_data, _error, { seasonId }) => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.ownershipsBySeason(seasonId),
      })
    },
  })
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Get member's copper mine status for validation
 * Calculates if member can apply for next copper mine based on rules and current ownership
 */
export function useMemberCopperMineStatus(
  seasonId: string | null,
  memberId: string | null,
  totalMerit: number
) {
  const { data: rules } = useCopperMineRules()
  const { data: ownerships } = useCopperMineOwnerships(seasonId)

  if (!rules || !ownerships || !memberId) {
    return null
  }

  const memberOwnerships = ownerships.filter((o) => o.member_id === memberId)
  const currentCount = memberOwnerships.length
  const sortedRules = [...rules].sort((a, b) => a.tier - b.tier)

  // Find next applicable tier
  const nextTier = currentCount + 1
  const nextRule = sortedRules.find((r) => r.tier === nextTier)

  const status: MemberCopperMineStatus = {
    member_id: memberId,
    member_name: '',
    current_count: currentCount,
    total_merit: totalMerit,
    next_tier: nextRule ? nextRule.tier : null,
    next_required_merit: nextRule ? nextRule.required_merit : null,
    next_allowed_level: nextRule ? nextRule.allowed_level : null,
    can_apply: nextRule ? totalMerit >= nextRule.required_merit : false,
  }

  return status
}
