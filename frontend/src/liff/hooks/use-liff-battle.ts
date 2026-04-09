/**
 * LIFF Battle Tab Hooks
 *
 * TanStack Query hooks for battle event list in LIFF.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getEventList,
  getEventReport,
  type EventListResponse,
  type EventReportResponse,
} from "../lib/liff-api-client";

interface LiffContext {
  lineGroupId: string;
}

// Query key factory
export const liffBattleKeys = {
  all: ["liff-battle"] as const,
  list: (groupId: string, gameId: string, offset: number = 0) =>
    [...liffBattleKeys.all, "list", groupId, gameId, offset] as const,
  report: (groupId: string, eventId: string) =>
    [...liffBattleKeys.all, "report", groupId, eventId] as const,
};

export function useLiffEventList(
  context: LiffContext | null,
  gameId: string | null,
  offset: number = 0,
) {
  return useQuery<EventListResponse>({
    queryKey: liffBattleKeys.list(context?.lineGroupId ?? "", gameId ?? "", offset),
    queryFn: () =>
      getEventList({
        lineGroupId: context!.lineGroupId,
        gameId: gameId!,
        offset,
      }),
    enabled: !!context?.lineGroupId && !!gameId,
    staleTime: 30_000,
  });
}

export function useLiffEventReportInline(
  context: LiffContext | null,
  eventId: string | null,
) {
  return useQuery<EventReportResponse>({
    queryKey: liffBattleKeys.report(context?.lineGroupId ?? "", eventId ?? ""),
    queryFn: () =>
      getEventReport({
        lineGroupId: context!.lineGroupId,
        eventId: eventId!,
      }),
    enabled: !!context?.lineGroupId && !!eventId,
  });
}
