/**
 * CSVUploadCard - CSV Upload Card with Date Validation
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Date range validation against season dates
 * - Drag & Drop upload zone at top
 *
 * Best Practice (2025):
 * - Use <label htmlFor> instead of programmatic input.click()
 * - Chrome has strict "user gesture" requirements that can block input.click()
 * - Native label association is the most reliable cross-browser solution
 */

import { useCallback, useState, useId, type DragEvent, type ChangeEvent } from 'react'
import { Upload, FileText, Trash2, AlertCircle, CheckCircle2, FileUp, RefreshCw, Loader2 } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { useCanUploadData } from '@/hooks/use-user-role'
import { useRecalculateSeasonPeriods } from '@/hooks/use-periods'
import type { CsvUpload } from '@/types/csv-upload'
import type { Season } from '@/types/season'
import {
  parseCsvFilenameDate,
  isDateInRange,
  formatDateTW,
  formatTimeTW,
  formatDateTimeTW,
  GAME_TIMEZONE,
} from '@/lib/date-utils'

interface CSVUploadCardProps {
  readonly season: Season
  readonly uploads: CsvUpload[]
  readonly onUpload: (file: File, snapshotDate?: string) => Promise<void>
  readonly onDelete: (uploadId: string) => Promise<void>
  readonly isUploading?: boolean
}

export function CSVUploadCard({
  season,
  uploads,
  onUpload,
  onDelete,
  isUploading = false,
}: CSVUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [parsedDate, setParsedDate] = useState<Date | null>(null)
  const [snapshotDate, setSnapshotDate] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false)
  const [uploadToDelete, setUploadToDelete] = useState<CsvUpload | null>(null)
  const [showRecalculateSuccess, setShowRecalculateSuccess] = useState<boolean>(false)
  const fileInputId = useId()
  const canUploadData = useCanUploadData()
  const recalculateMutation = useRecalculateSeasonPeriods(season.id)

  /**
   * Extract date from CSV filename using centralized date utility.
   * CSV filename contains game server time (UTC+8), converted to UTC Date.
   */
  const extractDateFromFilename = useCallback((filename: string): Date | null => {
    return parseCsvFilenameDate(filename)
  }, [])

  /**
   * Validate if date is within season range using Taiwan timezone comparison.
   * This ensures consistent validation regardless of user's browser timezone.
   */
  const validateDateInSeason = useCallback((fileDate: Date): boolean => {
    return isDateInRange(fileDate, season.start_date, season.end_date)
  }, [season.start_date, season.end_date])

  /**
   * Process file (shared between drag & click)
   */
  const processFile = useCallback((file: File) => {
    // Check file extension
    if (!file.name.endsWith('.csv')) {
      setDateError('請選擇 CSV 檔案')
      setSelectedFile(null)
      setParsedDate(null)
      setSnapshotDate('')
      return
    }

    // Extract date from filename
    const fileDate = extractDateFromFilename(file.name)
    if (!fileDate) {
      setDateError('檔名格式不正確，應為：同盟統計YYYY年MM月DD日HH时MM分SS秒.csv')
      setSelectedFile(null)
      setParsedDate(null)
      setSnapshotDate('')
      return
    }

    // Validate date is within season range
    if (!validateDateInSeason(fileDate)) {
      const seasonStart = formatDateTW(season.start_date)
      const seasonEnd = season.end_date ? formatDateTW(season.end_date) : '進行中'
      const fileDateDisplay = fileDate.toLocaleDateString('zh-TW', {
        timeZone: GAME_TIMEZONE,
      })
      setDateError(
        `檔案日期 (${fileDateDisplay}) 不在賽季範圍內 (${seasonStart} - ${seasonEnd})`
      )
      setSelectedFile(null)
      setParsedDate(null)
      setSnapshotDate('')
      return
    }

    // Success - set file and date
    setDateError(null)
    setSelectedFile(file)
    setParsedDate(fileDate)
    setSnapshotDate(fileDate.toISOString().split('T')[0])
  }, [season, extractDateFromFilename, validateDateInSeason])

  /**
   * Handle file selection from input
   */
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [processFile])

  /**
   * Handle upload
   */
  const handleUpload = useCallback(async () => {
    if (!selectedFile || !snapshotDate) return

    // Convert date to ISO format with time (start of day)
    const dateWithTime = `${snapshotDate}T00:00:00`

    await onUpload(selectedFile, dateWithTime)

    // Reset state
    setSelectedFile(null)
    setDateError(null)
    setParsedDate(null)
    setSnapshotDate('')
  }, [selectedFile, snapshotDate, onUpload])

  /**
   * Handle drag events for the label element
   */
  const handleDragEnter = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }, [processFile])

  /**
   * Open delete confirmation dialog
   */
  const handleDeleteClick = useCallback((upload: CsvUpload) => {
    setUploadToDelete(upload)
    setDeleteDialogOpen(true)
  }, [])

  /**
   * Confirm and execute delete
   */
  const handleConfirmDelete = useCallback(async () => {
    if (uploadToDelete) {
      await onDelete(uploadToDelete.id)
      setUploadToDelete(null)
    }
  }, [uploadToDelete, onDelete])

  /**
   * Handle recalculate periods
   */
  const handleRecalculate = useCallback(async () => {
    setShowRecalculateSuccess(false)
    await recalculateMutation.mutateAsync()
    setShowRecalculateSuccess(true)
    setTimeout(() => setShowRecalculateSuccess(false), 3000)
  }, [recalculateMutation])

  const icon = <FileText className="h-4 w-4" />

  const title = season.name

  const badge = season.is_current ? (
    <Badge variant="default" className="text-xs">
      目前賽季
    </Badge>
  ) : undefined

  const description = `已上傳 ${uploads.length} 個檔案`

  return (
    <CollapsibleCard
      icon={icon}
      title={title}
      badge={badge}
      description={description}
      collapsible={true}
      defaultExpanded={season.is_current}
    >
      <div className="space-y-6">
        {/* Drag & Drop Upload Zone - Only for owners/collaborators */}
        {canUploadData && (
          <div className="space-y-4">
            {/*
              Using <label> with htmlFor provides native file dialog triggering.
              This bypasses Chrome's strict "user gesture" requirements that can
              block programmatic input.click() calls.
            */}
            <label
              htmlFor={fileInputId}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                flex flex-col items-center justify-center
                px-6 py-8 rounded-lg border-2 border-dashed
                transition-all duration-200 cursor-pointer
                ${isDragging
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-muted-foreground/25 bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
                }
                ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {/* Hidden File Input */}
              <input
                id={fileInputId}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="sr-only"
              />

              <FileUp className={`h-10 w-10 mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-sm font-medium mb-1">
                {isDragging ? '放開以上傳檔案' : '點擊上傳或拖放 CSV 檔案'}
              </p>
              <p className="text-xs text-muted-foreground text-center">
                檔名格式：同盟統計YYYY年MM月DD日HH时MM分SS秒.csv
              </p>
            </label>

            {/* Date Error */}
            {dateError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{dateError}</AlertDescription>
              </Alert>
            )}

            {/* File Selected - Show Date Editor & Upload Button */}
            {selectedFile && !dateError && parsedDate && (
              <div className="space-y-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <Alert className="border-primary/30">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm font-medium">
                    已選擇：{selectedFile.name}
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <label className="text-sm font-medium">快照日期</label>
                  <input
                    type="date"
                    value={snapshotDate}
                    onChange={(e) => setSnapshotDate(e.target.value)}
                    min={season.start_date}
                    max={season.end_date || undefined}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    預設為檔名解析的日期，可自行調整
                  </p>
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                  className="w-full"
                  size="lg"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? '上傳中...' : '確認上傳'}
                </Button>
              </div>
            )}

            {/* Upload Guidelines */}
            {!selectedFile && (
              <div className="text-xs text-muted-foreground space-y-1 px-1">
                <p>📌 檔案日期必須在賽季範圍內（{formatDateTW(season.start_date)} - {season.end_date ? formatDateTW(season.end_date) : '進行中'}）</p>
                <p>📌 同一天只能上傳一次，重複上傳會覆蓋舊資料</p>
              </div>
            )}
          </div>
        )}

        {/* Uploads List - Sorted by Snapshot Date */}
        {uploads.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-medium">數據快照記錄</h4>
                <span className="text-xs text-muted-foreground">
                  共 {uploads.length} 筆
                </span>
              </div>
              {canUploadData && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRecalculate}
                  disabled={recalculateMutation.isPending}
                  className="h-7 text-xs"
                >
                  {recalculateMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  重算期間
                </Button>
              )}
            </div>

            {/* Recalculate Success Message */}
            {showRecalculateSuccess && recalculateMutation.data && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs text-primary">
                  重算完成：建立了 {recalculateMutation.data.periods_created} 個期間
                </span>
              </div>
            )}

            {/* Recalculate Error Message */}
            {recalculateMutation.isError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  重算失敗：{recalculateMutation.error?.message || '未知錯誤'}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3">
              {[...uploads]
                .sort((a, b) =>
                  new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
                )
                .map((upload) => {
                  // Check if snapshot is today (compare in game timezone)
                  const todayStr = new Date().toLocaleDateString('en-CA', {
                    timeZone: GAME_TIMEZONE,
                  })
                  const snapshotStr = new Date(upload.snapshot_date).toLocaleDateString(
                    'en-CA',
                    { timeZone: GAME_TIMEZONE }
                  )
                  const isToday = todayStr === snapshotStr

                  return (
                    <div
                      key={upload.id}
                      className="group relative flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all"
                    >
                      {/* Left: Snapshot Date (Primary Info) */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-baseline gap-3">
                          <time className="text-lg font-semibold text-foreground">
                            {formatDateTW(upload.snapshot_date, { padded: true })}
                          </time>
                          <span className="text-sm text-muted-foreground">
                            {formatTimeTW(upload.snapshot_date)}
                          </span>
                          {isToday && (
                            <Badge variant="default" className="text-xs">
                              今日
                            </Badge>
                          )}
                        </div>

                        {/* Secondary Info */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {upload.total_members} 名成員
                          </span>
                          <span className="flex items-center gap-1">
                            <Upload className="h-3 w-3" />
                            {formatDateTW(upload.uploaded_at)}
                          </span>
                        </div>

                        {/* File Name (Tertiary Info) */}
                        <p className="text-xs text-muted-foreground/70 truncate">
                          {upload.file_name}
                        </p>
                      </div>

                      {/* Right: Delete Button - Only for owners/collaborators */}
                      {canUploadData && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteClick(upload)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {uploads.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            尚未上傳任何 CSV 檔案
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="刪除數據快照"
        description="確定要刪除此數據快照嗎？"
        itemName={
          uploadToDelete
            ? formatDateTimeTW(uploadToDelete.snapshot_date)
            : undefined
        }
        warningMessage="此操作將永久刪除快照資料及相關的成員記錄，且無法復原。"
      />
    </CollapsibleCard>
  )
}
