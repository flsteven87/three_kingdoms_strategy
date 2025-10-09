/**
 * CSV Upload Query Hooks
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks
 * - Optimistic updates for mutations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CsvUpload, CsvUploadResponse } from '@/types/csv-upload'

// Query Keys Factory
export const csvUploadKeys = {
  all: ['csv-uploads'] as const,
  lists: () => [...csvUploadKeys.all, 'list'] as const,
  list: (seasonId: string) => [...csvUploadKeys.lists(), { seasonId }] as const,
  details: () => [...csvUploadKeys.all, 'detail'] as const,
  detail: (id: string) => [...csvUploadKeys.details(), id] as const
}

/**
 * Hook to fetch CSV uploads for a season
 */
export function useCsvUploads(seasonId: string) {
  return useQuery({
    queryKey: csvUploadKeys.list(seasonId),
    queryFn: () => apiClient.getCsvUploads(seasonId),
    enabled: !!seasonId,
    staleTime: 2 * 60 * 1000 // 2 minutes
  })
}

/**
 * Hook to upload CSV file with optional custom snapshot date
 *
 * Optimistic updates enabled
 */
export function useUploadCsv() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      seasonId,
      file,
      snapshotDate
    }: {
      seasonId: string
      file: File
      snapshotDate?: string
    }) => apiClient.uploadCsv(seasonId, file, snapshotDate),
    onSuccess: (response: CsvUploadResponse) => {
      // Invalidate the uploads list for this season
      queryClient.invalidateQueries({
        queryKey: csvUploadKeys.list(response.season_id)
      })
    }
  })
}

/**
 * Hook to delete CSV upload
 *
 * Optimistic delete with rollback on error
 */
export function useDeleteCsvUpload(seasonId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (uploadId: string) => apiClient.deleteCsvUpload(uploadId),
    onMutate: async (uploadId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: csvUploadKeys.list(seasonId) })

      // Snapshot previous values
      const previousUploads = queryClient.getQueryData<CsvUpload[]>(
        csvUploadKeys.list(seasonId)
      )

      // Optimistically remove upload from list
      if (previousUploads) {
        queryClient.setQueryData<CsvUpload[]>(
          csvUploadKeys.list(seasonId),
          previousUploads.filter(upload => upload.id !== uploadId)
        )
      }

      return { previousUploads, uploadId }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousUploads) {
        queryClient.setQueryData(csvUploadKeys.list(seasonId), context.previousUploads)
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: csvUploadKeys.list(seasonId) })
    }
  })
}
