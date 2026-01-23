/**
 * EventAnalytics - Battle Event Performance Analytics
 *
 * Track and analyze member performance during specific battles/events.
 * Uses inline Card creation pattern consistent with Seasons page.
 *
 * Features:
 * - Event list with expandable quick preview
 * - Inline event creation with before/after CSV uploads
 * - Event detail sheet with full member rankings
 */

import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { RoleGuard } from '@/components/alliance/RoleGuard'
import { CsvDropZone } from '@/components/uploads/CsvDropZone'
import { useSeasons } from '@/hooks/use-seasons'
import { useEvents, useEventAnalytics, useCreateEvent, useProcessEvent, useUploadEventCsv } from '@/hooks/use-events'
import {
  Plus,
  Swords,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { EventCard } from '@/components/events/EventCard'
import type { EventListItem } from '@/types/event'

// ============================================================================
// Types
// ============================================================================

interface CreateFormData {
  name: string
  eventType: string
  beforeFile: File | null
  afterFile: File | null
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  readonly onCreateEvent: () => void
}

function EmptyState({ onCreateEvent }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Swords className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground mb-4">尚無事件記錄</p>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        建立戰役事件來追蹤成員在特定戰鬥中的表現，分析出席率和戰功貢獻。
      </p>
      <RoleGuard requiredRoles={['owner', 'collaborator']}>
        <Button onClick={onCreateEvent}>
          <Plus className="h-4 w-4 mr-2" />
          新增事件
        </Button>
      </RoleGuard>
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <div className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}


// ============================================================================
// Event Card with Data Fetching
// ============================================================================

interface EventCardWithDataProps {
  readonly eventId: string
  readonly event: EventListItem
}

function EventCardWithData({ eventId, event }: EventCardWithDataProps) {
  const shouldFetch = event.status === 'completed'
  const { data: eventAnalytics } = useEventAnalytics(shouldFetch ? eventId : undefined)

  const eventDetail = eventAnalytics
    ? {
        summary: eventAnalytics.summary,
        metrics: eventAnalytics.metrics,
        merit_distribution: eventAnalytics.merit_distribution,
      }
    : null

  return <EventCard event={event} eventDetail={eventDetail} />
}

// ============================================================================
// Main Component
// ============================================================================

function EventAnalytics() {
  // UI State
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState<CreateFormData>({
    name: '',
    eventType: '',
    beforeFile: null,
    afterFile: null,
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data fetching
  const { data: seasons, isLoading: seasonsLoading } = useSeasons()
  const currentSeason = seasons?.find((s) => s.is_current)
  const { data: events, isLoading: eventsLoading } = useEvents(currentSeason?.id)

  // Mutations
  const uploadEventCsv = useUploadEventCsv()
  const createEvent = useCreateEvent(currentSeason?.id)
  const processEvent = useProcessEvent()

  const isLoading = seasonsLoading || eventsLoading

  // Sort events by date (newest first)
  const sortedEvents = useMemo(() => {
    if (!events) return []
    return [...events].sort((a, b) => {
      const aDate = a.event_start ? new Date(a.event_start).getTime() : 0
      const bDate = b.event_start ? new Date(b.event_start).getTime() : 0
      return bDate - aDate
    })
  }, [events])

  // Validation
  const canSubmit = formData.name.trim().length > 0 &&
    formData.beforeFile !== null &&
    formData.afterFile !== null &&
    !isProcessing

  // Handlers
  const handleStartCreate = useCallback(() => {
    setIsCreating(true)
    setError(null)
  }, [])

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false)
    setFormData({
      name: '',
      eventType: '',
      beforeFile: null,
      afterFile: null,
    })
    setError(null)
  }, [])

  const handleFormChange = useCallback((updates: Partial<CreateFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleCreate = useCallback(async () => {
    if (!currentSeason?.id || !formData.beforeFile || !formData.afterFile) {
      setError('缺少必要資料')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      // 1. Upload before CSV (uses event-specific endpoint, no period calculation)
      const beforeUpload = await uploadEventCsv.mutateAsync({
        seasonId: currentSeason.id,
        file: formData.beforeFile,
      })

      // 2. Upload after CSV (uses event-specific endpoint, no period calculation)
      const afterUpload = await uploadEventCsv.mutateAsync({
        seasonId: currentSeason.id,
        file: formData.afterFile,
      })

      // 3. Create event
      const event = await createEvent.mutateAsync({
        name: formData.name,
        event_type: formData.eventType.trim() || undefined,
      })

      // 4. Process event with both upload IDs
      await processEvent.mutateAsync({
        eventId: event.id,
        beforeUploadId: beforeUpload.upload_id,
        afterUploadId: afterUpload.upload_id,
      })

      // Success - reset form
      handleCancelCreate()
    } catch (err) {
      const message = err instanceof Error ? err.message : '建立事件時發生錯誤'
      setError(message)
    } finally {
      setIsProcessing(false)
    }
  }, [currentSeason?.id, formData, uploadEventCsv, createEvent, processEvent, handleCancelCreate])

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">事件分析</h2>
            <p className="text-muted-foreground mt-1">
              追蹤特定戰役或事件的成員表現
              {currentSeason && (
                <span className="ml-2">
                  · 賽季: <span className="font-medium text-foreground">{currentSeason.name}</span>
                </span>
              )}
            </p>
          </div>
          <RoleGuard requiredRoles={['owner', 'collaborator']}>
            {!isCreating && (
              <Button onClick={handleStartCreate}>
                <Plus className="h-4 w-4 mr-2" />
                新增事件
              </Button>
            )}
          </RoleGuard>
        </div>

        {/* Create New Event Card (Inline) */}
        <RoleGuard requiredRoles={['owner', 'collaborator']}>
          {isCreating && (
            <Card className="border-primary/50 shadow-sm">
              <CardHeader>
                <CardTitle>建立新事件</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Error Message */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {/* Form Fields */}
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-name">事件名稱 *</Label>
                    <Input
                      id="event-name"
                      value={formData.name}
                      onChange={(e) => handleFormChange({ name: e.target.value })}
                      placeholder="例如：徐州爭奪戰"
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-type">
                      事件類型 <span className="text-muted-foreground text-xs">(選填)</span>
                    </Label>
                    <Input
                      id="event-type"
                      value={formData.eventType}
                      onChange={(e) => handleFormChange({ eventType: e.target.value })}
                      placeholder="例如：攻城戰、領土戰"
                      disabled={isProcessing}
                    />
                  </div>

                  {/* CSV Upload Areas - Side by Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <CsvDropZone
                      label="戰前快照 *"
                      description="事件開始前的數據"
                      helperText="拖放或點擊選擇 CSV"
                      file={formData.beforeFile}
                      onFileChange={(file) => handleFormChange({ beforeFile: file })}
                      disabled={isProcessing}
                      compact
                    />
                    <CsvDropZone
                      label="戰後快照 *"
                      description="事件結束後的數據"
                      helperText="拖放或點擊選擇 CSV"
                      file={formData.afterFile}
                      onFileChange={(file) => handleFormChange({ afterFile: file })}
                      disabled={isProcessing}
                      compact
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCancelCreate}
                    disabled={isProcessing}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!canSubmit}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        處理中...
                      </>
                    ) : (
                      '建立事件'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </RoleGuard>

        {/* Loading State */}
        {isLoading && <LoadingSkeleton />}

        {/* Empty State */}
        {!isLoading && sortedEvents.length === 0 && !isCreating && (
          <EmptyState onCreateEvent={handleStartCreate} />
        )}

        {/* Event List */}
        {!isLoading && sortedEvents.length > 0 && (
          <div className="space-y-4">
            {sortedEvents.map((event) => (
              <EventCardWithData key={event.id} eventId={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </AllianceGuard>
  )
}

export { EventAnalytics }
