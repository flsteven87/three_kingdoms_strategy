/**
 * CSV Upload Query Hooks
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks
 * - Optimistic updates for mutations
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CsvUpload } from "@/types/csv-upload";

// Query Keys Factory
export const csvUploadKeys = {
  all: ["csv-uploads"] as const,
  lists: () => [...csvUploadKeys.all, "list"] as const,
  list: (seasonId: string) => [...csvUploadKeys.lists(), { seasonId }] as const,
  details: () => [...csvUploadKeys.all, "detail"] as const,
  detail: (id: string) => [...csvUploadKeys.details(), id] as const,
};

/**
 * Hook to fetch CSV uploads for a season
 */
export function useCsvUploads(seasonId: string) {
  return useQuery({
    queryKey: csvUploadKeys.list(seasonId),
    queryFn: () => apiClient.getCsvUploads(seasonId),
    enabled: !!seasonId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

interface UploadCsvVariables {
  readonly seasonId: string;
  readonly file: File;
  readonly snapshotDate?: string;
  /** Idempotency key for retry safety - use useUploadStateMachine to generate */
  readonly idempotencyKey?: string;
}

/**
 * Hook to upload CSV file with optional custom snapshot date
 *
 * Supports idempotency key for retry safety (Stripe-style pattern).
 * Use with useUploadStateMachine hook for proper state management.
 *
 * @example
 * ```tsx
 * const [uploadState, uploadActions] = useUploadStateMachine();
 * const uploadMutation = useUploadCsv();
 *
 * const handleUpload = async (file: File) => {
 *   const key = uploadActions.start();
 *   uploadMutation.mutate({
 *     seasonId,
 *     file,
 *     idempotencyKey: key,
 *   });
 * };
 * ```
 */
export function useUploadCsv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      seasonId,
      file,
      snapshotDate,
      idempotencyKey,
    }: UploadCsvVariables) =>
      apiClient.uploadCsv(seasonId, file, snapshotDate, idempotencyKey),
    onSettled: (_data, _error, variables) => {
      // Always invalidate to ensure cache consistency
      queryClient.invalidateQueries({
        queryKey: csvUploadKeys.list(variables.seasonId),
      });
    },
  });
}

/**
 * Hook to delete CSV upload
 *
 * Optimistic delete with rollback on error
 */
export function useDeleteCsvUpload(seasonId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uploadId: string) => apiClient.deleteCsvUpload(uploadId),
    onMutate: async (uploadId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: csvUploadKeys.list(seasonId),
      });

      // Snapshot previous values
      const previousUploads = queryClient.getQueryData<CsvUpload[]>(
        csvUploadKeys.list(seasonId),
      );

      // Optimistically remove upload from list
      if (previousUploads) {
        queryClient.setQueryData<CsvUpload[]>(
          csvUploadKeys.list(seasonId),
          previousUploads.filter((upload) => upload.id !== uploadId),
        );
      }

      return { previousUploads, uploadId };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousUploads) {
        queryClient.setQueryData(
          csvUploadKeys.list(seasonId),
          context.previousUploads,
        );
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: csvUploadKeys.list(seasonId) });
    },
  });
}
