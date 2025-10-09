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
import { Scale, Save, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Season } from '@/types/season'
import {
  useHegemonyWeights,
  useInitializeHegemonyWeights,
  useBatchUpdateHegemonyWeights,
  useHegemonyScoresPreview
} from '@/hooks/use-hegemony-weights'

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
  const [showPreview, setShowPreview] = useState(false)
  const [hasAttemptedInit, setHasAttemptedInit] = useState(false)

  // Fetch weights for this season
  const { data: weights, isLoading: isLoadingWeights, refetch } = useHegemonyWeights(season.id)

  // Mutations
  const initializeMutation = useInitializeHegemonyWeights()
  const batchUpdateMutation = useBatchUpdateHegemonyWeights()

  // Preview scores (only fetch when preview is shown)
  const {
    data: previewScores,
    isLoading: isLoadingPreview,
    refetch: refetchPreview
  } = useHegemonyScoresPreview(showPreview ? season.id : null, 10)

  /**
   * Sync server weights to local state
   */
  useEffect(() => {
    if (weights && weights.length > 0) {
      setLocalWeights(
        weights.map((w) => ({
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
      )
      setHasUnsavedChanges(false)
    }
  }, [weights])

  /**
   * Auto-initialize weights if not exists (only once)
   */
  useEffect(() => {
    const shouldAutoInit =
      !isLoadingWeights &&
      (!weights || weights.length === 0) &&
      !initializeMutation.isPending &&
      !hasAttemptedInit

    if (shouldAutoInit) {
      setHasAttemptedInit(true)
      // Auto-initialize on first load
      initializeMutation.mutateAsync(season.id).then(() => {
        refetch()
      }).catch(() => {
        // Silent fail - user can manually retry if needed
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingWeights, weights?.length, initializeMutation.isPending, hasAttemptedInit])

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
   * Save all changes
   */
  const handleSave = useCallback(async () => {
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

    // Refresh preview if shown
    if (showPreview) {
      await refetchPreview()
    }
  }, [localWeights, season.id, batchUpdateMutation, showPreview, refetchPreview])

  /**
   * Toggle preview
   */
  const handleTogglePreview = useCallback(() => {
    setShowPreview((prev) => !prev)
  }, [])

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

        {/* Empty State - Auto-initializing */}
        {!isLoadingWeights && localWeights.length === 0 && (
          <div className="space-y-4">
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                正在自動初始化權重配置...
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Weights Configuration */}
        {!isLoadingWeights && localWeights.length > 0 && (
          <div className="space-y-4">
            {/* Validation Summary */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">快照權重總和：</span>
                <Badge variant={tier2ValidStatus ? 'default' : 'destructive'} className="font-mono">
                  {Math.round(localWeights.reduce((acc, w) => acc + w.snapshot_weight * 100, 0))}%
                </Badge>
              </div>
              <Button size="sm" variant="outline" onClick={handleDistributeEvenly}>
                平均分配快照權重
              </Button>
            </div>

            {/* Snapshots List (sorted by date) */}
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
                      {/* Single Row Layout */}
                      <div className="flex items-center gap-4">
                        {/* Left: Date & Info */}
                        <div className="min-w-[180px]">
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

                        {/* Middle: 4 Indicator Weights */}
                        <div className="flex items-center gap-2 flex-1">
                          {/* Contribution */}
                          <div className="flex items-center gap-1 flex-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">貢獻</Label>
                            <input
                              key={`${weight.id}-contribution-${weight.weight_contribution}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_contribution * 100)}
                              onBlur={(e) => {
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'contribution', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'contribution', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'contribution', 1)
                                }
                              }}
                              className="w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>

                          {/* Merit */}
                          <div className="flex items-center gap-1 flex-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">戰功</Label>
                            <input
                              key={`${weight.id}-merit-${weight.weight_merit}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_merit * 100)}
                              onBlur={(e) => {
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'merit', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'merit', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'merit', 1)
                                }
                              }}
                              className="w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>

                          {/* Assist */}
                          <div className="flex items-center gap-1 flex-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">助攻</Label>
                            <input
                              key={`${weight.id}-assist-${weight.weight_assist}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_assist * 100)}
                              onBlur={(e) => {
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'assist', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'assist', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'assist', 1)
                                }
                              }}
                              className="w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>

                          {/* Donation */}
                          <div className="flex items-center gap-1 flex-1">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">捐獻</Label>
                            <input
                              key={`${weight.id}-donation-${weight.weight_donation}`}
                              type="text"
                              inputMode="numeric"
                              defaultValue={Math.round(weight.weight_donation * 100)}
                              onBlur={(e) => {
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier1Change(originalIndex, 'donation', value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier1Change(originalIndex, 'donation', 0)
                                } else {
                                  handleTier1Change(originalIndex, 'donation', 1)
                                }
                              }}
                              className="w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </div>

                        {/* Right: Snapshot Weight Slider + Input */}
                        <div className="flex items-center gap-3 min-w-[280px]">
                          <div className="flex-1">
                            <Slider
                              value={[weight.snapshot_weight * 100]}
                              onValueChange={([value]) => handleTier2Change(originalIndex, value / 100)}
                              min={0}
                              max={100}
                              step={1}
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
                                const value = parseInt(e.target.value, 10)
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  handleTier2Change(originalIndex, value / 100)
                                } else if (isNaN(value) || value < 0) {
                                  handleTier2Change(originalIndex, 0)
                                } else {
                                  handleTier2Change(originalIndex, 1)
                                }
                              }}
                              className="w-16 h-8 px-2 text-sm rounded-md border border-input bg-background text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || !allValid || batchUpdateMutation.isPending}
                className="flex-1"
              >
                {batchUpdateMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <Save className="h-4 w-4 mr-2" />
                儲存所有變更
              </Button>
              <Button
                variant="outline"
                onClick={handleTogglePreview}
                disabled={!allValid}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    隱藏預覽
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    預覽排名
                  </>
                )}
              </Button>
            </div>

            {/* Validation Warning */}
            {!allValid && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  所有權重配置必須有效（各層總和為 100%）才能儲存或預覽
                </AlertDescription>
              </Alert>
            )}

            {/* Preview Section */}
            {showPreview && (
              <div className="space-y-4 pt-6 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">霸業排名預覽（Top 10）</h4>
                  {isLoadingPreview && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {previewScores && previewScores.length > 0 && (
                  <div className="space-y-2">
                    {previewScores.map((score) => (
                      <div
                        key={score.member_id}
                        className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                      >
                        <Badge
                          variant={score.rank <= 3 ? 'default' : 'outline'}
                          className="w-8 h-8 flex items-center justify-center font-bold"
                        >
                          {score.rank}
                        </Badge>
                        <div className="flex-1">
                          <p className="font-medium">{score.member_name}</p>
                          <p className="text-xs text-muted-foreground">
                            總分：{Number(score.final_score).toLocaleString('zh-TW', {
                              maximumFractionDigits: 2
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {previewScores && previewScores.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    沒有可預覽的成員數據
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleCard>
  )
}
