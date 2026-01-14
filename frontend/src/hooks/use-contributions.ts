import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ContributionDetail, ContributionListItem, CreateContributionPayload, TargetOverridePayload } from '@/lib/api/contribution-api'

export const contributionKeys = {
    all: ['contributions'] as const,
    list: (allianceId: string | undefined, seasonId: string | undefined) => [...contributionKeys.all, 'list', allianceId, seasonId] as const,
    detail: (id: string | undefined) => [...contributionKeys.all, 'detail', id] as const,
}

export function useContributions(allianceId: string | undefined, seasonId: string | undefined) {
    return useQuery<ContributionListItem[]>({
        queryKey: contributionKeys.list(allianceId, seasonId),
        queryFn: () => {
            if (!allianceId || !seasonId) return Promise.resolve([])
            return apiClient.getContributions(allianceId, seasonId)
        },
        enabled: !!allianceId && !!seasonId,
        staleTime: 60_000,
    })
}

export function useContributionDetail(contributionId: string | undefined) {
    return useQuery<ContributionDetail>({
        queryKey: contributionKeys.detail(contributionId),
        queryFn: () => {
            if (!contributionId) return Promise.reject(new Error('No id'))
            return apiClient.getContributionDetail(contributionId)
        },
        enabled: !!contributionId,
    })
}

export function useCreateContribution(allianceId: string | undefined, seasonId: string | undefined) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (payload: CreateContributionPayload) => {
            if (!allianceId || !seasonId) return Promise.reject(new Error('Missing ids'))
            return apiClient.createContribution(allianceId, seasonId, payload)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: contributionKeys.list(allianceId, seasonId) })
        },
    })
}

export function useDeleteContribution() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => apiClient.deleteContribution(id),
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: contributionKeys.detail(id) })
            queryClient.invalidateQueries({ queryKey: contributionKeys.all })
        },
    })
}

export function useUpsertMemberTargetOverride() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ contributionId, payload }: { contributionId: string, payload: TargetOverridePayload }) => apiClient.upsertMemberTargetOverride(contributionId, payload),
        onSuccess: (_data, { contributionId }) => {
            queryClient.invalidateQueries({ queryKey: contributionKeys.detail(contributionId) })
        },
    })
}

export function useDeleteMemberTargetOverride() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ contributionId, memberId }: { contributionId: string, memberId: string }) => apiClient.deleteMemberTargetOverride(contributionId, memberId),
        onSuccess: (_data, { contributionId }) => {
            queryClient.invalidateQueries({ queryKey: contributionKeys.detail(contributionId) })
        },
    })
}
