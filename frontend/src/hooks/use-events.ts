/**
 * Battle Event Query Hooks
 *
 * TanStack Query hooks for battle event analytics.
 * Follows CLAUDE.md:
 * - Query key factory pattern
 * - Type-safe hooks
 * - Proper staleTime configuration
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  BattleEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventAnalyticsResponse,
  EventGroupAnalytics,
  BatchAnalyticsResponse,
} from "@/types/event";

// Query Keys Factory
export const eventKeys = {
  all: ["events"] as const,
  lists: () => [...eventKeys.all, "list"] as const,
  list: (seasonId: string) => [...eventKeys.lists(), { seasonId }] as const,
  details: () => [...eventKeys.all, "detail"] as const,
  detail: (eventId: string) => [...eventKeys.details(), eventId] as const,
  analytics: () => [...eventKeys.all, "analytics"] as const,
  eventAnalytics: (eventId: string) =>
    [...eventKeys.analytics(), eventId] as const,
  batchAnalytics: (eventIds: string[]) =>
    [...eventKeys.analytics(), "batch", eventIds.sort().join(",")] as const,
  groupAnalytics: (eventId: string) =>
    [...eventKeys.all, "group-analytics", eventId] as const,
};

/**
 * Hook to fetch events list for a season
 */
export function useEvents(seasonId: string | undefined) {
  return useQuery({
    queryKey: eventKeys.list(seasonId ?? ""),
    queryFn: () => apiClient.getEvents(seasonId!),
    enabled: !!seasonId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch single event details
 */
export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: eventKeys.detail(eventId ?? ""),
    queryFn: () => apiClient.getEvent(eventId!),
    enabled: !!eventId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch complete event analytics (event + summary + metrics + distribution)
 */
export function useEventAnalytics(eventId: string | undefined) {
  return useQuery({
    queryKey: eventKeys.eventAnalytics(eventId ?? ""),
    queryFn: () => apiClient.getEventAnalytics(eventId!),
    enabled: !!eventId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch analytics for multiple events in a single request
 *
 * Eliminates N+1 problem when loading event list with analytics.
 */
export function useBatchEventAnalytics(eventIds: string[]) {
  return useQuery<BatchAnalyticsResponse>({
    queryKey: eventKeys.batchAnalytics(eventIds),
    queryFn: () => apiClient.getBatchEventAnalytics(eventIds),
    enabled: eventIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch group-level analytics for LINE Bot report preview
 */
export function useEventGroupAnalytics(
  eventId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<EventGroupAnalytics>({
    queryKey: eventKeys.groupAnalytics(eventId ?? ""),
    queryFn: () => apiClient.getEventGroupAnalytics(eventId!),
    enabled: (options?.enabled ?? true) && !!eventId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to create a new event
 */
export function useCreateEvent(seasonId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEventRequest) =>
      apiClient.createEvent(seasonId!, data),
    onSuccess: () => {
      if (seasonId) {
        queryClient.invalidateQueries({ queryKey: eventKeys.list(seasonId) });
      }
    },
  });
}

interface UploadEventCsvVariables {
  readonly seasonId: string;
  readonly file: File;
  readonly snapshotDate?: string;
  /** Idempotency key for retry safety - use useUploadStateMachine to generate */
  readonly idempotencyKey?: string;
}

/**
 * Hook to upload CSV for event analysis
 *
 * Unlike regular uploads (useUploadCsv), this:
 * - Does NOT trigger period calculation
 * - Can have multiple uploads on the same day
 * - Is stored with upload_type='event'
 *
 * Supports idempotency key for retry safety (Stripe-style pattern).
 */
export function useUploadEventCsv() {
  return useMutation({
    mutationFn: ({
      seasonId,
      file,
      snapshotDate,
      idempotencyKey,
    }: UploadEventCsvVariables) =>
      apiClient.uploadEventCsv(seasonId, file, snapshotDate, idempotencyKey),
  });
}

interface ProcessEventVariables {
  readonly eventId: string;
  readonly beforeUploadId: string;
  readonly afterUploadId: string;
  /** Idempotency key for retry safety - prevents duplicate processing */
  readonly idempotencyKey?: string;
}

/**
 * Hook to process event snapshots
 *
 * Uses mutationKey for serialization - prevents concurrent processing
 * of the same event (race condition prevention).
 *
 * Supports idempotency key for retry safety (Stripe-style pattern).
 */
export function useProcessEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    // Mutation scope key: serializes concurrent mutations
    // Prevents race conditions when rapidly clicking process button
    mutationKey: ["processEvent"],
    mutationFn: ({
      eventId,
      beforeUploadId,
      afterUploadId,
      idempotencyKey,
    }: ProcessEventVariables) =>
      apiClient.processEvent(
        eventId,
        beforeUploadId,
        afterUploadId,
        idempotencyKey,
      ),
    onSuccess: (event: BattleEvent) => {
      // Invalidate the event detail and analytics
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(event.id) });
      queryClient.invalidateQueries({
        queryKey: eventKeys.eventAnalytics(event.id),
      });
      // Invalidate the events list
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

/**
 * Hook to update an event's basic information
 *
 * Updates name, event_type, and description.
 * Follows CLAUDE.md: includes onSettled for cache consistency.
 */
export function useUpdateEvent(seasonId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: string;
      data: UpdateEventRequest;
    }) => apiClient.updateEvent(eventId, data),
    onSuccess: (event: BattleEvent) => {
      // Invalidate event detail and analytics
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(event.id) });
      queryClient.invalidateQueries({
        queryKey: eventKeys.eventAnalytics(event.id),
      });
    },
    onSettled: () => {
      // Ensure cache consistency - CLAUDE.md requirement
      if (seasonId) {
        queryClient.invalidateQueries({ queryKey: eventKeys.list(seasonId) });
      }
    },
  });
}

/**
 * Hook to delete an event
 */
export function useDeleteEvent(seasonId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => apiClient.deleteEvent(eventId),
    onMutate: async (eventId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: eventKeys.list(seasonId ?? ""),
      });

      // Snapshot previous values
      const previousEvents = queryClient.getQueryData<EventAnalyticsResponse[]>(
        eventKeys.list(seasonId ?? ""),
      );

      return { previousEvents, eventId };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousEvents && seasonId) {
        queryClient.setQueryData(
          eventKeys.list(seasonId),
          context.previousEvents,
        );
      }
    },
    onSettled: () => {
      if (seasonId) {
        queryClient.invalidateQueries({ queryKey: eventKeys.list(seasonId) });
      }
    },
  });
}
