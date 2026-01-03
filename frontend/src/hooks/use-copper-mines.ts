/**
 * Copper Mines TanStack Query Hooks
 *
 * Hooks for copper mine rules (alliance level) and ownership records (season level).
 * Features optimistic updates for seamless UX.
 *
 * TODO: Connect to real API endpoints when backend is ready
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

  // Rules (alliance level)
  rules: () => [...copperMineKeys.all, 'rules'] as const,
  rulesByAlliance: (allianceId: string) =>
    [...copperMineKeys.rules(), allianceId] as const,

  // Ownerships (season level)
  ownerships: () => [...copperMineKeys.all, 'ownerships'] as const,
  ownershipsBySeason: (seasonId: string) =>
    [...copperMineKeys.ownerships(), seasonId] as const,

  // Member status (for validation)
  memberStatus: (seasonId: string, memberId: string) =>
    [...copperMineKeys.all, 'member-status', seasonId, memberId] as const,
}

// =============================================================================
// Mock Data Storage (Temporary - Replace with API calls)
// =============================================================================

let mockRules: CopperMineRule[] = [
  {
    id: 'rule-1',
    alliance_id: 'mock-alliance',
    tier: 1,
    required_merit: 50000,
    allowed_level: 'both',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'rule-2',
    alliance_id: 'mock-alliance',
    tier: 2,
    required_merit: 100000,
    allowed_level: 'both',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'rule-3',
    alliance_id: 'mock-alliance',
    tier: 3,
    required_merit: 200000,
    allowed_level: 'ten',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
]

let mockOwnerships: CopperMineOwnership[] = [
  {
    id: 'own-1',
    season_id: 'mock-season',
    member_id: 'member-1',
    coord_x: 123,
    coord_y: 456,
    level: 10,
    applied_at: '2025-01-02T00:00:00Z',
    created_at: '2025-01-02T00:00:00Z',
    member_name: '張飛',
    member_group: 'A組',
    line_display_name: '@zhangfei',
  },
  {
    id: 'own-2',
    season_id: 'mock-season',
    member_id: 'member-2',
    coord_x: 789,
    coord_y: 12,
    level: 9,
    applied_at: '2025-01-03T00:00:00Z',
    created_at: '2025-01-03T00:00:00Z',
    member_name: '關羽',
    member_group: 'B組',
    line_display_name: null,
  },
]

// =============================================================================
// Mock API Functions (Temporary)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function mockGetRules(_allianceId?: string): Promise<CopperMineRule[]> {
  await new Promise((r) => setTimeout(r, 300))
  return [...mockRules].sort((a, b) => a.tier - b.tier)
}

async function mockCreateRule(
  _allianceId: string,
  data: CreateCopperMineRuleRequest
): Promise<CopperMineRule> {
  await new Promise((r) => setTimeout(r, 300))
  const newRule: CopperMineRule = {
    id: `rule-${Date.now()}`,
    alliance_id: 'mock-alliance',
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  mockRules.push(newRule)
  return newRule
}

async function mockUpdateRule(
  ruleId: string,
  data: UpdateCopperMineRuleRequest
): Promise<CopperMineRule> {
  await new Promise((r) => setTimeout(r, 300))
  const index = mockRules.findIndex((r) => r.id === ruleId)
  if (index === -1) throw new Error('Rule not found')
  mockRules[index] = {
    ...mockRules[index],
    ...data,
    updated_at: new Date().toISOString(),
  }
  return mockRules[index]
}

async function mockDeleteRule(ruleId: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 300))
  mockRules = mockRules.filter((r) => r.id !== ruleId)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function mockGetOwnerships(_seasonId?: string): Promise<CopperMineOwnership[]> {
  await new Promise((r) => setTimeout(r, 300))
  return [...mockOwnerships].sort(
    (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
  )
}

async function mockCreateOwnership(
  seasonId: string,
  data: CreateCopperMineOwnershipRequest
): Promise<CopperMineOwnership> {
  await new Promise((r) => setTimeout(r, 300))
  const newOwnership: CopperMineOwnership = {
    id: `own-${Date.now()}`,
    season_id: seasonId,
    ...data,
    applied_at: data.applied_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
    member_name: '新成員',
    member_group: null,
    line_display_name: null,
  }
  mockOwnerships.push(newOwnership)
  return newOwnership
}

async function mockDeleteOwnership(ownershipId: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 300))
  mockOwnerships = mockOwnerships.filter((o) => o.id !== ownershipId)
}

// =============================================================================
// Query Hooks - Rules
// =============================================================================

/**
 * Get all copper mine rules for an alliance
 */
export function useCopperMineRules(allianceId: string | null) {
  return useQuery({
    queryKey: copperMineKeys.rulesByAlliance(allianceId || ''),
    queryFn: () => mockGetRules(allianceId!),
    enabled: !!allianceId,
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
    mutationFn: ({
      allianceId,
      data,
    }: {
      allianceId: string
      data: CreateCopperMineRuleRequest
    }) => mockCreateRule(allianceId, data),

    onMutate: async ({ allianceId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.rulesByAlliance(allianceId),
      })

      // Snapshot current data
      const previousRules = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rulesByAlliance(allianceId)
      )

      // Optimistically add the new rule
      const optimisticRule: CopperMineRule = {
        id: `temp-${Date.now()}`,
        alliance_id: allianceId,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      queryClient.setQueryData<CopperMineRule[]>(
        copperMineKeys.rulesByAlliance(allianceId),
        (old) => [...(old || []), optimisticRule].sort((a, b) => a.tier - b.tier)
      )

      return { previousRules }
    },

    onError: (_err, { allianceId }, context) => {
      // Rollback on error
      if (context?.previousRules) {
        queryClient.setQueryData(
          copperMineKeys.rulesByAlliance(allianceId),
          context.previousRules
        )
      }
    },

    onSettled: (_data, _error, { allianceId }) => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.rulesByAlliance(allianceId),
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
      allianceId: string
      data: UpdateCopperMineRuleRequest
    }) => mockUpdateRule(ruleId, data),

    onMutate: async ({ ruleId, allianceId, data }) => {
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.rulesByAlliance(allianceId),
      })

      const previousRules = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rulesByAlliance(allianceId)
      )

      // Optimistically update the rule
      queryClient.setQueryData<CopperMineRule[]>(
        copperMineKeys.rulesByAlliance(allianceId),
        (old) =>
          old?.map((rule) =>
            rule.id === ruleId
              ? { ...rule, ...data, updated_at: new Date().toISOString() }
              : rule
          )
      )

      return { previousRules }
    },

    onError: (_err, { allianceId }, context) => {
      if (context?.previousRules) {
        queryClient.setQueryData(
          copperMineKeys.rulesByAlliance(allianceId),
          context.previousRules
        )
      }
    },

    onSettled: (_data, _error, { allianceId }) => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.rulesByAlliance(allianceId),
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
    mutationFn: ({ ruleId }: { ruleId: string; allianceId: string }) =>
      mockDeleteRule(ruleId),

    onMutate: async ({ ruleId, allianceId }) => {
      await queryClient.cancelQueries({
        queryKey: copperMineKeys.rulesByAlliance(allianceId),
      })

      const previousRules = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rulesByAlliance(allianceId)
      )

      // Optimistically remove the rule
      queryClient.setQueryData<CopperMineRule[]>(
        copperMineKeys.rulesByAlliance(allianceId),
        (old) => old?.filter((rule) => rule.id !== ruleId)
      )

      return { previousRules }
    },

    onError: (_err, { allianceId }, context) => {
      if (context?.previousRules) {
        queryClient.setQueryData(
          copperMineKeys.rulesByAlliance(allianceId),
          context.previousRules
        )
      }
    },

    onSettled: (_data, _error, { allianceId }) => {
      queryClient.invalidateQueries({
        queryKey: copperMineKeys.rulesByAlliance(allianceId),
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
    queryFn: () => mockGetOwnerships(seasonId!),
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
    }) => mockCreateOwnership(seasonId, data),

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
      mockDeleteOwnership(ownershipId),

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
  const { data: rules } = useCopperMineRules(seasonId ? 'mock-alliance' : null)
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
