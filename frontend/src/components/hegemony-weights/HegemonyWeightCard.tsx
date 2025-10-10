/**
 * HegemonyWeightCard - Collapsible Card for Season Weight Configuration
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Auto-load snapshot weights
 * - Two-tier weight system (Tier 1: indicators, Tier 2: snapshots)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Scale, Save, Loader2, AlertCircle, CheckCircle2, RotateCcw, RefreshCw } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCanManageWeights } from '@/hooks/use-user-role'
import type { Season } from '@/types/season'
import {
  useHegemonyWeights,
  useInitializeHegemonyWeights,
  useBatchUpdateHegemonyWeights,
  useHegemonyScoresPreview
} from '@/hooks/use-hegemony-weights'
import { useCsvUploads } from '@/hooks/use-csv-uploads'
import { HegemonyScoreChart, type ChartMemberData } from '@/components/hegemony-weights/HegemonyScoreChart'
import { formatDateUTC, buildChartConfig } from '@/lib/hegemony-helpers'

interface HegemonyWeightCardProps {
  readonly season: Season
}

interface LocalWeight {
  readonly id: string
  readonly csv_upload_id: string
  readonly snapshot_date: string
  readonly snapshot_filename: string
  readonly total_members: number
  readonly weight_contribution: number
  readonly weight_merit: number
  readonly weight_assist: number
  readonly weight_donation: number
  readonly snapshot_weight: number
}

export const HegemonyWeightCard: React.FC<HegemonyWeightCardProps> = ({ season }) => {
  const [localWeights, setLocalWeights] = useState<LocalWeight[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
  const [hasAttemptedInit, setHasAttemptedInit] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [previewLimit, setPreviewLimit] = useState<number>(20)
  const canManageWeights = useCanManageWeights()

  // Fetch CSV uploads first to check if season has data
  const { data: uploads } = useCsvUploads(season.id)

  // Fetch weights for this season
  const { data: weights, isLoading: isLoadingWeights, refetch } = useHegemonyWeights(season.id)

  // Mutations
  const initializeMutation = useInitializeHegemonyWeights()
  const batchUpdateMutation = useBatchUpdateHegemonyWeights()

  // Preview scores (fetch when preview tab is active)
  const {
    data: previewScores,
    isLoading: isLoadingPreview,
    refetch: refetchPreview
  } = useHegemonyScoresPreview(activeTab === 'preview' ? season.id : null, previewLimit)

  /**
   * Convert server weights to local state format
   */
  const syncWeightsToLocal = useCallback((serverWeights: typeof weights) => {
    if (!serverWeights || serverWeights.length === 0) return []

    return serverWeights.map((w) => ({
      id: w.id,
      csv_upload_id: w.csv_upload_id,
      snapshot_date: w.snapshot_date,
      snapshot_filename: w.snapshot_filename,
      total_members: w.total_members,
      weight_contribution: Number(w.weight_contribution),
      weight_merit: Number(w.weight_merit),
      weight_assist: Number(w.weight_assist),
      weight_donation: Number(w.weight_donation),
      snapshot_weight: Number(w.snapshot_weight)
    }))
  }, [])

  /**
   * Sync server weights to local state
   */
  useEffect(() => {
    if (weights && weights.length > 0) {
      setLocalWeights(syncWeightsToLocal(weights))
      setHasUnsavedChanges(false)
    }
  }, [weights, syncWeightsToLocal])

  /**
   * Auto-initialize weights if not exists AND season has CSV uploads (only once)
   */
  useEffect(() => {
    const hasUploads = uploads && uploads.length > 0
    const shouldAutoInit =
      hasUploads &&
      !isLoadingWeights &&
      (!weights || weights.length === 0) &&
      !initializeMutation.isPending &&
      !initializeMutation.isSuccess &&
      !hasAttemptedInit

    if (shouldAutoInit) {
      setHasAttemptedInit(true)
      initializeMutation.mutateAsync(season.id).then(() => {
        refetch()
      }).catch(() => {
        // Silent fail - user can manually retry if needed
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads?.length, isLoadingWeights, weights?.length, initializeMutation.isPending, initializeMutation.isSuccess, hasAttemptedInit])

  /**
   * Update Tier 1 weight (indicator weights)
   */
  const handleTier1Change = useCallback(
    (index: number, field: 'contribution' | 'merit' | 'assist' | 'donation', value: number) => {
      setLocalWeights((prev) => {
        const updated = [...prev]
        updated[index] = {
          ...updated[index],
          [`weight_${field}`]: value
        }
        return updated
      })
      setHasUnsavedChanges(true)
    },
    []
  )

  /**
   * Update Tier 2 weight (snapshot weight)
   */
  const handleTier2Change = useCallback((index: number, value: number) => {
    setLocalWeights((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        snapshot_weight: value
      }
      return updated
    })
    setHasUnsavedChanges(true)
  }, [])

  /**
   * Distribute snapshot weights evenly
   */
  const handleDistributeEvenly = useCallback(() => {
    if (localWeights.length === 0) return

    const evenWeight = 1.0 / localWeights.length

    setLocalWeights((prev) =>
      prev.map((w) => ({
        ...w,
        snapshot_weight: evenWeight
      }))
    )
    setHasUnsavedChanges(true)
  }, [localWeights.length])

  /**
   * Save all changes with status animation
   */
  const handleSave = useCallback(async () => {
    setSaveStatus('loading')

    try {
      const updates = localWeights.map((w) => ({
        weightId: w.id,
        data: {
          weight_contribution: w.weight_contribution,
          weight_merit: w.weight_merit,
          weight_assist: w.weight_assist,
          weight_donation: w.weight_donation,
          snapshot_weight: w.snapshot_weight
        }
      }))

      await batchUpdateMutation.mutateAsync({
        seasonId: season.id,
        updates
      })

      setHasUnsavedChanges(false)
      setSaveStatus('success')

      // Reset status after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle')
      }, 2000)

      // Refresh preview if active tab is preview
      if (activeTab === 'preview') {
        await refetchPreview()
      }
    } catch {
      setSaveStatus('idle')
    }
  }, [localWeights, season.id, batchUpdateMutation, activeTab, refetchPreview])

  /**
   * Discard changes (reset to server state)
   */
  const handleDiscardChanges = useCallback(() => {
    setLocalWeights(syncWeightsToLocal(weights))
    setHasUnsavedChanges(false)
  }, [weights, syncWeightsToLocal])

  /**
   * Validate Tier 1 weights (each snapshot's indicator weights should sum to 100% as integers)
   */
  const tier1ValidStatus = useMemo(() => {
    return localWeights.map((w) => {
      const sum = Math.round(
        w.weight_contribution * 100 +
        w.weight_merit * 100 +
        w.weight_assist * 100 +
        w.weight_donation * 100
      )
      return sum === 100
    })
  }, [localWeights])

  /**
   * Validate Tier 2 weights (all snapshot weights should sum to 100% as integers)
   */
  const tier2ValidStatus = useMemo(() => {
    if (localWeights.length === 0) return false
    const sum = Math.round(localWeights.reduce((acc, w) => acc + w.snapshot_weight * 100, 0))
    return sum === 100
  }, [localWeights])

  /**
   * Overall validation
   */
  const allValid = useMemo(() => {
    return tier1ValidStatus.every((v) => v) && tier2ValidStatus
  }, [tier1ValidStatus, tier2ValidStatus])

  /**
   * Extract snapshot dates from weights (sorted chronologically)
   */
  const snapshotDates = useMemo(() => {
    if (!weights || weights.length === 0) return []

    return [...weights]
      .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())
      .map(w => w.snapshot_date)
  }, [weights])

  /**
   * Transform preview scores to chart data with snapshot breakdown
   */
  const chartData: ChartMemberData[] = useMemo(() => {
    if (!previewScores || !snapshotDates || snapshotDates.length === 0) return []

    return previewScores.map(score => {
      const memberData: ChartMemberData = {
        member_name: score.member_name,
        total_score: Number(score.final_score),
        rank: score.rank
      }

      // Add each snapshot's score as a separate field
      // Backend returns snapshot_scores with keys in format: "YYYY-MM-DD"
      snapshotDates.forEach((date, index) => {
        const snapshotKey = `snapshot_${index}`
        const snapshotScore = score.snapshot_scores[formatDateUTC(date)] || 0
        memberData[snapshotKey] = Number(snapshotScore)
      })

      return memberData
    })
  }, [previewScores, snapshotDates])

  /**
   * Build dynamic chart config based on snapshot dates
   */
  const chartConfig = useMemo(() => {
    return buildChartConfig(snapshotDates)
  }, [snapshotDates])

  /**
   * Calculate dynamic chart height based on number of members
   */
  const chartHeight = useMemo(() => {
    const totalMembers = chartData.length
    return Math.max(400, totalMembers * 40) // 40px per member, minimum 400px
  }, [chartData.length])

  /**
   * Calculate X-axis domain: max value = top score + 10%
   */
  const xAxisMax = useMemo(() => {
    const maxScore = chartData[0]?.total_score || 0
    return Math.ceil(maxScore * 1.1)
  }, [chartData])

  const icon = <Scale className="h-4 w-4" />

  const title = (
    <div className="flex items-center gap-2">
      <span>{season.name}</span>
      {season.is_active && (
        <Badge variant="default" className="ml-2">
          進行中
        </Badge>
      )}
    </div>
  )

  const description =
    localWeights.length > 0
      ? `已配置 ${localWeights.length} 個快照權重${hasUnsavedChanges ? ' | 有未儲存的變更' : ''}`
      : '尚未初始化權重配置'

  return (
    <CollapsibleCard
      icon={icon}
      title={title}
      description={description}
      collapsible={true}
      defaultExpanded={season.is_active}
    >
      <div className="space-y-6">
        {/* Loading State */}
        {isLoadingWeights && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State - No CSV uploads */}
        {!isLoadingWeights && (!uploads || uploads.length === 0) && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                此賽季尚未上傳任何 CSV 數據快照。請先前往「資料管理」頁面上傳數據後，權重配置將自動初始化。
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Empty State - Auto-initializing (has uploads but no weights yet) */}
        {!isLoadingWeights && uploads && uploads.length > 0 && localWeights.length === 0 && initializeMutation.isPending && (
          <div className="space-y-4">
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                正在自動初始化權重配置...
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Weights Configuration with Tabs */}
        {!isLoadingWeights && localWeights.length > 0 && (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'config' | 'preview')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config">權重配置</TabsTrigger>
              <TabsTrigger value="preview" disabled={!allValid}>
                排名預覽
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Weight Configuration */}
            <TabsContent value="config" className="space-y-4 mt-4">
            {/* Validation Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">快照權重總和：</span>
                <Badge variant={tier2ValidStatus ? 'default' : 'destructive'} className="font-mono">
                  {Math.round(localWeights.reduce((acc, w) => acc + w.snapshot_weight * 100, 0))}%
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDistributeEvenly}
                disabled={!canManageWeights}
                className="w-full sm:w-auto"
              >
                平均分配快照權重
              </Button>
            </div>

            {/* Snapshots List - All Roles (disabled for members) */}
            <div className="space-y-3">
              {localWeights
                .map((weight, originalIndex) => ({ weight, originalIndex }))
                .sort((a, b) =>
                  new Date(a.weight.snapshot_date).getTime() - new Date(b.weight.snapshot_date).getTime()
                )
                .map(({ weight, originalIndex }) => {
                  const isValid = tier1ValidStatus[originalIndex]

                  return (
                    <div
                      key={weight.id}
                      className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      {/* Responsive Layout:
                          Mobile (<640px): Full vertical stack
                          Tablet (640-1279px): Date + Indicators in row, Slider in separate row
                          Desktop (≥1280px): Everything in one row
                      */}
                      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                        {/* Top Row: Date + Indicators (flex on tablet+, stack on mobile) */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 xl:flex-1">
                          {/* Date & Info */}
                          <div className="sm:min-w-[160px] xl:min-w-[180px]">
                            <p className="text-sm font-medium">
                              {new Date(weight.snapshot_date).toLocaleString('zh-TW', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {weight.total_members} 名成員
                            </p>
                          </div>

                          {/* Indicator Weights - Grid on mobile, flex on tablet+ */}
                          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-1">
                          {/* Contribution */}
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">貢獻</Label>
                            <input
                              key={`${weight.id}-contribution-${weight.weight_contribution}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_contribution * 100)}
                              onBlur={(e) => {
                                if (!canManageWeights) return
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'contribution', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'contribution', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'contribution', 1)
                                }
                              }}
                              disabled={!canManageWeights}
                              className="w-14 sm:w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>

                          {/* Merit */}
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">戰功</Label>
                            <input
                              key={`${weight.id}-merit-${weight.weight_merit}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_merit * 100)}
                              onBlur={(e) => {
                                if (!canManageWeights) return
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'merit', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'merit', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'merit', 1)
                                }
                              }}
                              disabled={!canManageWeights}
                              className="w-14 sm:w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>

                          {/* Assist */}
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">助攻</Label>
                            <input
                              key={`${weight.id}-assist-${weight.weight_assist}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_assist * 100)}
                              onBlur={(e) => {
                                if (!canManageWeights) return
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'assist', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'assist', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'assist', 1)
                                }
                              }}
                              disabled={!canManageWeights}
                              className="w-14 sm:w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>

                          {/* Donation */}
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">捐獻</Label>
                            <input
                              key={`${weight.id}-donation-${weight.weight_donation}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_donation * 100)}
                              onBlur={(e) => {
                                if (!canManageWeights) return
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'donation', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'donation', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'donation', 1)
                                }
                              }}
                              disabled={!canManageWeights}
                              className="w-14 sm:w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </div>
                        </div>

                        {/* Bottom Row: Snapshot Weight Slider + Input (full width on tablet, fixed width on desktop) */}
                        <div className="flex items-center gap-3 xl:min-w-[300px]">
                          <div className="flex-1 min-w-[100px]">
                            <Slider
                              value={[weight.snapshot_weight * 100]}
                              onValueChange={canManageWeights ? ([value]) => handleTier2Change(originalIndex, value / 100) : undefined}
                              min={0}
                              max={100}
                              step={1}
                              disabled={!canManageWeights}
                              className="w-full"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">快照</Label>
                            <input
                              key={`${weight.id}-snapshot-${weight.snapshot_weight}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.snapshot_weight * 100)}
                              onBlur={(e) => {
                                if (!canManageWeights) return
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier2Change(originalIndex, value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier2Change(originalIndex, 0)
                                } else {
                                  handleTier2Change(originalIndex, 1)
                                }
                              }}
                              disabled={!canManageWeights}
                              className="w-14 sm:w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          {isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>

              {/* Action Bar - Config Tab - Only visible for owners/collaborators */}
              {canManageWeights && (
                <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: Status Information */}
                    <div className="flex items-center gap-2 text-sm">
                      {hasUnsavedChanges ? (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          <span className="text-muted-foreground">
                            有未儲存的變更
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-muted-foreground">已同步</span>
                        </>
                      )}
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-2">
                      {hasUnsavedChanges && (
                        <Button
                          variant="ghost"
                          onClick={handleDiscardChanges}
                          className="h-9"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          捨棄變更
                        </Button>
                      )}
                      <Button
                        onClick={handleSave}
                        disabled={!hasUnsavedChanges || !allValid || saveStatus === 'loading'}
                        className="h-9"
                      >
                        {saveStatus === 'loading' && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        {saveStatus === 'success' && (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        {saveStatus === 'idle' && (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        {saveStatus === 'loading' && '儲存中...'}
                        {saveStatus === 'success' && '已儲存'}
                        {saveStatus === 'idle' && '儲存所有變更'}
                      </Button>
                    </div>
                  </div>

                  {/* Validation Warning */}
                  {!allValid && hasUnsavedChanges && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        所有權重配置必須有效（各層總和為 100%）才能儲存
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Ranking Preview */}
            <TabsContent value="preview" className="space-y-4 mt-4">
              {/* Loading State */}
              {isLoadingPreview && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">載入霸業分數數據中...</span>
                </div>
              )}

              {/* Empty State */}
              {!isLoadingPreview && (!chartData || chartData.length === 0) && (
                <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <AlertDescription className="text-yellow-900 dark:text-yellow-100">
                    <strong className="font-semibold">尚無數據</strong>
                    <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                      請先上傳 CSV 數據。如已上傳，請切換回「權重配置」頁籤儲存變更後再查看預覽。
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {/* Chart */}
              {!isLoadingPreview && chartData && chartData.length > 0 && (
                <div className="space-y-4">
                  {/* Chart Header with Controls */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">成員霸業分數排行榜</h3>
                      <p className="text-sm text-muted-foreground">
                        根據加權計算後的霸業分數排序（從高到低）
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">顯示：</span>
                        <Select
                          value={previewLimit.toString()}
                          onValueChange={(value) => setPreviewLimit(Number(value))}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">前 10 名</SelectItem>
                            <SelectItem value="20">前 20 名</SelectItem>
                            <SelectItem value="30">前 30 名</SelectItem>
                            <SelectItem value="50">前 50 名</SelectItem>
                            <SelectItem value="100">前 100 名</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchPreview()}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        重新整理
                      </Button>
                    </div>
                  </div>

                  {/* Stacked Bar Chart */}
                  <HegemonyScoreChart
                    chartData={chartData}
                    snapshotDates={snapshotDates}
                    chartConfig={chartConfig}
                    chartHeight={chartHeight}
                    xAxisMax={xAxisMax}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </CollapsibleCard>
  )
}
