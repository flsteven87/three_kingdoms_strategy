/**
 * DataManagement Page - CSV Upload Management
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - TanStack Query for server state
 * - Type-safe component
 * - Optimistic updates
 */

import { useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CSVUploadCard } from '@/components/uploads/CSVUploadCard'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { useSeasons } from '@/hooks/use-seasons'
import { useCsvUploads, useUploadCsv, useDeleteCsvUpload } from '@/hooks/use-csv-uploads'
import type { Season } from '@/types/season'

function DataManagement() {
  const { data: seasons, isLoading: seasonsLoading } = useSeasons()
  const uploadMutation = useUploadCsv()

  /**
   * Sort seasons: current first, then by start_date descending
   */
  const sortedSeasons = seasons
    ? [...seasons].sort((a, b) => {
        if (a.is_current && !b.is_current) return -1
        if (!a.is_current && b.is_current) return 1
        return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      })
    : []

  /**
   * Handle CSV upload with optional snapshot date
   */
  const handleUpload = useCallback(
    async (seasonId: string, file: File, snapshotDate?: string) => {
      await uploadMutation.mutateAsync({ seasonId, file, snapshotDate })
    },
    [uploadMutation]
  )

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">資料管理</h2>
          <p className="text-muted-foreground mt-1">CSV 數據上傳與管理</p>
        </div>

      {/* Loading State */}
      {seasonsLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!seasonsLoading && sortedSeasons.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            請先在「賽季管理」建立賽季，才能上傳 CSV 數據。
          </AlertDescription>
        </Alert>
      )}

      {/* CSV Upload Cards by Season */}
      {!seasonsLoading && sortedSeasons.length > 0 && (
        <div className="space-y-4">
          {sortedSeasons.map((season) => (
            <SeasonUploadCard
              key={season.id}
              season={season}
              onUpload={handleUpload}
            />
          ))}
        </div>
      )}
      </div>
    </AllianceGuard>
  )
}

/**
 * Season Upload Card - Wrapper for CSV upload with season-specific data
 */
interface SeasonUploadCardProps {
  readonly season: Season
  readonly onUpload: (seasonId: string, file: File, snapshotDate?: string) => Promise<void>
}

function SeasonUploadCard({ season, onUpload }: SeasonUploadCardProps) {
  const { data: uploads = [], isLoading } = useCsvUploads(season.id)
  const deleteMutation = useDeleteCsvUpload(season.id)

  const handleUpload = useCallback(
    async (file: File, snapshotDate?: string) => {
      await onUpload(season.id, file, snapshotDate)
    },
    [season.id, onUpload]
  )

  const handleDelete = useCallback(
    async (uploadId: string) => {
      await deleteMutation.mutateAsync(uploadId)
    },
    [deleteMutation]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <CSVUploadCard
      season={season}
      uploads={uploads}
      onUpload={handleUpload}
      onDelete={handleDelete}
    />
  )
}

export { DataManagement }
