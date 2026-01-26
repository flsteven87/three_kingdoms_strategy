/**
 * LIFF Event Report Hooks
 *
 * TanStack Query hooks for battle event report analytics in LIFF.
 */

import { useQuery } from '@tanstack/react-query'
import { getEventReport, type EventReportResponse } from '../lib/liff-api-client'

interface LiffContext {
  lineGroupId: string
}

// Query key factory
export const liffEventKeys = {
  all: ['liff-event'] as const,
  report: (groupId: string, eventId: string) =>
    [...liffEventKeys.all, 'report', groupId, eventId] as const,
}

export function useLiffEventReport(context: LiffContext | null, eventId: string | null) {
  return useQuery<EventReportResponse>({
    queryKey: liffEventKeys.report(context?.lineGroupId ?? '', eventId ?? ''),
    queryFn: () =>
      getEventReport({
        lineGroupId: context!.lineGroupId,
        eventId: eventId!,
      }),
    enabled: !!context?.lineGroupId && !!eventId,
  })
}
