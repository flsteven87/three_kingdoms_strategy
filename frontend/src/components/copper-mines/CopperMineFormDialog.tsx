/**
 * CopperMineFormDialog - Dialog for adding new copper mine ownership
 *
 * P0 修復: 使用 Select 組件選擇成員，傳入正確的 member_id (UUID)
 * P1 修復: 添加規則驗證錯誤顯示
 */

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateCopperMineOwnership } from '@/hooks/use-copper-mines'
import { useAnalyticsMembers } from '@/hooks/use-analytics'

interface FormData {
  member_id: string
  coord_x: string
  coord_y: string
  level: '9' | '10'
  applied_at: string
}

interface CopperMineFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly seasonId: string
}

function getTodayString(): string {
  const today = new Date()
  return today.toISOString().split('T')[0]
}

export function CopperMineFormDialog({
  open,
  onOpenChange,
  seasonId,
}: CopperMineFormDialogProps) {
  const createMutation = useCreateCopperMineOwnership()
  const { data: members, isLoading: isLoadingMembers } = useAnalyticsMembers(seasonId, true)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      member_id: '',
      coord_x: '',
      coord_y: '',
      level: '10',
      applied_at: getTodayString(),
    },
  })

  const level = watch('level')
  const memberId = watch('member_id')

  // Sort members by name for better UX
  const sortedMembers = useMemo(() => {
    if (!members) return []
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))

    // Add "reserved" placeholder member at the top
    return [
      { id: 'reserved', name: '【預留獎勵】' },
      ...sorted
    ]
  }, [members])

  // Reset form and error when dialog opens
  useEffect(() => {
    if (open) {
      setSubmitError(null)
      reset({
        member_id: '',
        coord_x: '',
        coord_y: '',
        level: '10',
        applied_at: getTodayString(),
      })
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    if (!data.member_id) return

    setSubmitError(null)

    try {
      await createMutation.mutateAsync({
        seasonId,
        data: {
          member_id: data.member_id,
          coord_x: parseInt(data.coord_x, 10),
          coord_y: parseInt(data.coord_y, 10),
          level: parseInt(data.level, 10) as 9 | 10,
          applied_at: data.applied_at,
        },
      })
      onOpenChange(false)
    } catch (error) {
      // P1 修復: 顯示後端返回的規則驗證錯誤
      const message = error instanceof Error ? error.message : '新增失敗'
      setSubmitError(message)
    }
  }

  const isLoading = createMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>新增銅礦記錄</DialogTitle>
          <DialogDescription>登記成員的銅礦擁有資訊</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* P1 修復: 顯示規則驗證錯誤 */}
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Member Selection - 使用 Select 組件選擇成員 */}
          <div className="space-y-2">
            <Label htmlFor="member_id">成員</Label>
            {isLoadingMembers ? (
              <div className="flex items-center gap-2 h-10 px-3 border rounded-md text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                載入成員列表...
              </div>
            ) : (
              <Select
                value={memberId}
                onValueChange={(value) => setValue('member_id', value)}
              >
                <SelectTrigger id="member_id">
                  <SelectValue placeholder="選擇成員" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {sortedMembers.length === 0 ? (
                    <div className="py-2 px-3 text-sm text-muted-foreground">
                      無可用成員
                    </div>
                  ) : (
                    sortedMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {errors.member_id && (
              <p className="text-sm text-destructive">{errors.member_id.message}</p>
            )}
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coord_x">X 座標</Label>
              <Input
                id="coord_x"
                type="number"
                placeholder="X"
                {...register('coord_x', {
                  required: '請輸入 X 座標',
                  min: { value: 0, message: '座標必須為正數' },
                })}
              />
              {errors.coord_x && (
                <p className="text-sm text-destructive">{errors.coord_x.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="coord_y">Y 座標</Label>
              <Input
                id="coord_y"
                type="number"
                placeholder="Y"
                {...register('coord_y', {
                  required: '請輸入 Y 座標',
                  min: { value: 0, message: '座標必須為正數' },
                })}
              />
              {errors.coord_y && (
                <p className="text-sm text-destructive">{errors.coord_y.message}</p>
              )}
            </div>
          </div>

          {/* Level Selection */}
          <div className="space-y-2">
            <Label htmlFor="level">銅礦等級</Label>
            <Select
              value={level}
              onValueChange={(value: '9' | '10') => setValue('level', value)}
            >
              <SelectTrigger id="level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 級</SelectItem>
                <SelectItem value="9">9 級</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Applied Date */}
          <div className="space-y-2">
            <Label htmlFor="applied_at">申請日期</Label>
            <Input
              id="applied_at"
              type="date"
              {...register('applied_at', {
                required: '請選擇日期',
              })}
            />
            {errors.applied_at && (
              <p className="text-sm text-destructive">{errors.applied_at.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={isLoading || !memberId}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              新增
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
