/**
 * LIFF Member Hooks
 *
 * TanStack Query hooks for member registration in LIFF.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMemberInfo,
  registerMember,
  unregisterMember,
  type MemberInfoResponse,
  type RegisterMemberResponse,
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
