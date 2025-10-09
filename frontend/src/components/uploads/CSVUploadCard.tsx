/**
 * CSVUploadCard - CSV Upload Card with Date Validation
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Date range validation against season dates
 */

import React, { useCallback, useState } from 'react'
import { Upload, FileText, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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

  /**
   * Extract date from CSV filename
   * Format: 同盟統計YYYY年MM月DD日HH时MM分SS秒.csv
   */
  const extractDateFromFilename = (filename: string): Date | null => {
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
  }

  /**
   * Validate if date is within season range
   */
  const validateDateInSeason = (fileDate: Date): boolean => {
    const seasonStart = new Date(season.start_date)
    seasonStart.setHours(0, 0, 0, 0)

    const seasonEnd = season.end_date
      ? new Date(season.end_date)
      : new Date()
    seasonEnd.setHours(23, 59, 59, 999)

    return fileDate >= seasonStart && fileDate <= seasonEnd
  }

  /**
   * Handle file selection
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

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
    // Set snapshot date (date only, no time)
    setSnapshotDate(fileDate.toISOString().split('T')[0])
  }, [season])

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
    const input = document.getElementById(`csv-upload-${season.id}`) as HTMLInputElement
    if (input) input.value = ''
  }, [selectedFile, snapshotDate, onUpload, season.id])

  /**
   * Handle delete
   */
  const handleDelete = useCallback(async (uploadId: string) => {
    if (window.confirm('確定要刪除此上傳記錄嗎？\n相關的成員快照資料也會被刪除。')) {
      await onDelete(uploadId)
    }
  }, [onDelete])

  const icon = <FileText className="h-4 w-4" />

  const title = `${season.name} - CSV 上傳`

  const description = season.is_active
    ? `活躍賽季 | 已上傳 ${uploads.length} 個檔案`
    : `已上傳 ${uploads.length} 個檔案`

  return (
    <CollapsibleCard
      icon={icon}
      title={title}
      description={description}
      collapsible={true}
      defaultExpanded={season.is_active}
    >
      <div className="space-y-6">
        {/* Upload Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">上傳新 CSV</h4>
            {season.is_active && (
              <Badge variant="default" className="text-xs">
                預設賽季
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`csv-upload-${season.id}`}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex-1 text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              上傳
            </Button>
          </div>

          {dateError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{dateError}</AlertDescription>
            </Alert>
          )}

          {selectedFile && !dateError && parsedDate && (
            <div className="space-y-3">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  已選擇檔案：{selectedFile.name}
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
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  預設為檔名解析的日期，可自行調整
                </p>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• 檔名格式：同盟統計YYYY年MM月DD日HH时MM分SS秒.csv</p>
            <p>• 檔案日期必須在賽季範圍內</p>
            <p>• 同一天只能上傳一次，重複上傳會覆蓋舊資料</p>
          </div>
        </div>

        {/* Uploads List */}
        {uploads.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium">上傳記錄</h4>
            <div className="space-y-2">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{upload.file_name}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>
                        快照時間：{new Date(upload.snapshot_date).toLocaleString('zh-TW')}
                      </span>
                      <span>成員數：{upload.total_members}</span>
                      <span>
                        上傳於：{new Date(upload.uploaded_at).toLocaleDateString('zh-TW')}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(upload.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
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
    </CollapsibleCard>
  )
}

export default CSVUploadCard
