/**
 * LIFF Member Hooks
 *
 * TanStack Query hooks for member registration in LIFF.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  findSimilarMembers,
  getMemberCandidates,
  getMemberInfo,
  registerMember,
  unregisterMember,
  type MemberCandidatesResponse,
  type MemberInfoResponse,
  type RegisterMemberResponse,
  type SimilarMembersResponse,
} from "../lib/liff-api-client";

interface LiffContext {
  lineUserId: string;
  lineGroupId: string;
  lineDisplayName: string;
}

// Query key factory
export const liffMemberKeys = {
  all: ["liff-member"] as const,
  info: (userId: string, groupId: string) =>
    [...liffMemberKeys.all, "info", userId, groupId] as const,
  candidates: (groupId: string) =>
    [...liffMemberKeys.all, "candidates", groupId] as const,
  similar: (groupId: string, name: string) =>
    [...liffMemberKeys.all, "similar", groupId, name] as const,
};

export function useLiffMemberInfo(context: LiffContext | null) {
  return useQuery<MemberInfoResponse>({
    queryKey: liffMemberKeys.info(
      context?.lineUserId ?? "",
      context?.lineGroupId ?? "",
    ),
    queryFn: () =>
      getMemberInfo({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
      }),
    enabled: !!context?.lineUserId && !!context?.lineGroupId,
  });
}

export function useLiffRegisterMember(context: LiffContext | null) {
  const queryClient = useQueryClient();

  return useMutation<RegisterMemberResponse, Error, { gameId: string }>({
    mutationFn: ({ gameId }) =>
      registerMember({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        displayName: context!.lineDisplayName,
        gameId,
      }),
    onSettled: () => {
      // Always invalidate to ensure cache consistency
      if (context) {
        queryClient.invalidateQueries({
          queryKey: liffMemberKeys.info(
            context.lineUserId,
            context.lineGroupId,
          ),
        });
      }
    },
  });
}

export function useLiffUnregisterMember(context: LiffContext | null) {
  const queryClient = useQueryClient();

  return useMutation<RegisterMemberResponse, Error, { gameId: string }>({
    mutationFn: ({ gameId }) =>
      unregisterMember({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        gameId,
      }),
    onSettled: () => {
      // Always invalidate to ensure cache consistency
      if (context) {
        queryClient.invalidateQueries({
          queryKey: liffMemberKeys.info(
            context.lineUserId,
            context.lineGroupId,
          ),
        });
      }
    },
  });
}

/**
 * Hook to fetch member candidates for autocomplete
 *
 * Caches for 5 minutes as member list doesn't change frequently
 */
export function useLiffMemberCandidates(groupId: string | null) {
  return useQuery<MemberCandidatesResponse>({
    queryKey: liffMemberKeys.candidates(groupId ?? ""),
    queryFn: () => getMemberCandidates({ lineGroupId: groupId! }),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to find similar members for post-submit correction
 */
export function useLiffSimilarMembers(groupId: string | null, name: string) {
  return useQuery<SimilarMembersResponse>({
    queryKey: liffMemberKeys.similar(groupId ?? "", name),
    queryFn: () => findSimilarMembers({ lineGroupId: groupId!, name }),
    enabled: !!groupId && name.length > 0,
    staleTime: 30 * 1000, // 30 seconds
  });
}
