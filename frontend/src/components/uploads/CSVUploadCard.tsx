/**
 * CSVUploadCard - CSV Upload Card with Date Validation
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Date range validation against season dates
 * - Drag & Drop upload zone at top
 */

import React, { useCallback, useState, useRef } from 'react'
import { Upload, FileText, Trash2, AlertCircle, CheckCircle2, FileUp } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import type { CsvUpload } from '@/types/csv-upload'
import type { Season } from '@/types/season'

interface CSVUploadCardProps {
  readonly season: Season
  readonly uploads: CsvUpload[]
  readonly onUpload: (file: File, snapshotDate?: string) => Promise<void>
  readonly onDelete: (uploadId: string) => Promise<void>
  readonly isUploading?: boolean
}

export const CSVUploadCard: React.FC<CSVUploadCardProps> = ({
  season,
  uploads,
  onUpload,
  onDelete,
  isUploading = false
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [parsedDate, setParsedDate] = useState<Date | null>(null)
  const [snapshotDate, setSnapshotDate] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false)
  const [uploadToDelete, setUploadToDelete] = useState<CsvUpload | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Extract date from CSV filename
   * Format: 同盟統計YYYY年MM月DD日HH时MM分SS秒.csv
   */
  const extractDateFromFilename = useCallback((filename: string): Date | null => {
    const match = filename.match(/(\d{4})年(\d{2})月(\d{2})日(\d{2})时(\d{2})分(\d{2})秒/)
    if (!match) return null

    const [, year, month, day, hour, minute, second] = match
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    )
  }, [])

  /**
   * Validate if date is within season range
   */
  const validateDateInSeason = useCallback((fileDate: Date): boolean => {
    const seasonStart = new Date(season.start_date)
    seasonStart.setHours(0, 0, 0, 0)

    const seasonEnd = season.end_date
      ? new Date(season.end_date)
      : new Date()
    seasonEnd.setHours(23, 59, 59, 999)

    return fileDate >= seasonStart && fileDate <= seasonEnd
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
      const seasonStart = new Date(season.start_date).toLocaleDateString('zh-TW')
      const seasonEnd = season.end_date
        ? new Date(season.end_date).toLocaleDateString('zh-TW')
        : '進行中'
      setDateError(
        `檔案日期 (${fileDate.toLocaleDateString('zh-TW')}) 不在賽季範圍內 (${seasonStart} - ${seasonEnd})`
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
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
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

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [selectedFile, snapshotDate, onUpload])

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }, [processFile])

  /**
   * Handle click to upload
   */
  const handleClickUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

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

  const icon = <FileText className="h-4 w-4" />

  const title = `${season.name} - CSV 上傳`

  const badge = season.is_active ? (
    <Badge variant="default" className="text-xs">
      進行中
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
      defaultExpanded={season.is_active}
    >
      <div className="space-y-6">
        {/* Drag & Drop Upload Zone - Top Priority */}
        <div className="space-y-4">

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Drag & Drop Zone */}
          <div
            onClick={handleClickUpload}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative flex flex-col items-center justify-center
              px-6 py-8 rounded-lg border-2 border-dashed
              transition-all duration-200 cursor-pointer
              ${isDragging
                ? 'border-primary bg-primary/5 scale-[1.02]'
                : 'border-muted-foreground/25 bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
              }
              ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <FileUp className={`h-10 w-10 mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm font-medium mb-1">
              {isDragging ? '放開以上傳檔案' : '點擊上傳或拖放 CSV 檔案'}
            </p>
            <p className="text-xs text-muted-foreground text-center">
              檔名格式：同盟統計YYYY年MM月DD日HH时MM分SS秒.csv
            </p>
          </div>

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
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? '上傳中...' : '確認上傳'}
              </Button>
            </div>
          )}

          {/* Upload Guidelines */}
          {!selectedFile && (
            <div className="text-xs text-muted-foreground space-y-1 px-1">
              <p>📌 檔案日期必須在賽季範圍內（{new Date(season.start_date).toLocaleDateString('zh-TW')} - {season.end_date ? new Date(season.end_date).toLocaleDateString('zh-TW') : '進行中'}）</p>
              <p>📌 同一天只能上傳一次，重複上傳會覆蓋舊資料</p>
            </div>
          )}
        </div>

        {/* Uploads List - Sorted by Snapshot Date */}
        {uploads.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">數據快照記錄</h4>
              <span className="text-xs text-muted-foreground">
                共 {uploads.length} 筆
              </span>
            </div>
            <div className="grid gap-3">
              {[...uploads]
                .sort((a, b) =>
                  new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
                )
                .map((upload) => {
                  const snapshotDate = new Date(upload.snapshot_date)
                  const uploadDate = new Date(upload.uploaded_at)
                  const isToday = new Date().toDateString() === snapshotDate.toDateString()

                  return (
                    <div
                      key={upload.id}
                      className="group relative flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all"
                    >
                      {/* Left: Snapshot Date (Primary Info) */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-baseline gap-3">
                          <time className="text-lg font-semibold text-foreground">
                            {snapshotDate.toLocaleDateString('zh-TW', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit'
                            })}
                          </time>
                          <span className="text-sm text-muted-foreground">
                            {snapshotDate.toLocaleTimeString('zh-TW', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
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
                            {uploadDate.toLocaleDateString('zh-TW')}
                          </span>
                        </div>

                        {/* File Name (Tertiary Info) */}
                        <p className="text-xs text-muted-foreground/70 truncate">
                          {upload.file_name}
                        </p>
                      </div>

                      {/* Right: Delete Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteClick(upload)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            ? new Date(uploadToDelete.snapshot_date).toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : undefined
        }
        warningMessage="此操作將永久刪除快照資料及相關的成員記錄，且無法復原。"
      />
    </CollapsibleCard>
  )
}

export default CSVUploadCard
