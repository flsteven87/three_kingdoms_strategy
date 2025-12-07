/**
 * SeasonFormDialog Component
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Explicit TypeScript interfaces
 * - React Hook Form + Zod validation
 */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Season, SeasonCreate, SeasonUpdate } from '@/types/season'

const seasonSchema = z
  .object({
    name: z.string().min(1, '賽季名稱不能為空').max(100, '賽季名稱最多 100 字'),
    start_date: z.string().min(1, '起始日期不能為空'),
    end_date: z.string().optional(),
    description: z.string().max(500, '描述最多 500 字').optional(),
    is_active: z.boolean().optional()
  })
  .refine(
    (data) => {
      if (!data.end_date) return true
      return new Date(data.end_date) > new Date(data.start_date)
    },
    {
      message: '結束日期必須晚於起始日期',
      path: ['end_date']
    }
  )

type SeasonFormData = z.infer<typeof seasonSchema>

interface SeasonFormDialogProps {
  readonly open: boolean
  readonly editSeason?: Season | null
  readonly allianceId: string
  readonly onClose: () => void
  readonly onSubmit: (data: SeasonCreate | { seasonId: string; data: SeasonUpdate }) => void
  readonly isSubmitting?: boolean
}

export const SeasonFormDialog: React.FC<SeasonFormDialogProps> = ({
  open,
  editSeason,
  allianceId,
  onClose,
  onSubmit,
  isSubmitting = false
}) => {
  const isEditMode = !!editSeason

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<SeasonFormData>({
    resolver: zodResolver(seasonSchema),
    defaultValues: {
      name: '',
      start_date: '',
      end_date: '',
      description: '',
      is_active: true
    }
  })

  // Reset form when dialog opens/closes or edit season changes
  useEffect(() => {
    if (open && editSeason) {
      reset({
        name: editSeason.name,
        start_date: editSeason.start_date,
        end_date: editSeason.end_date || '',
        description: editSeason.description || '',
        is_active: editSeason.is_active
      })
    } else if (open && !editSeason) {
      reset({
        name: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        description: '',
        is_active: true
      })
    }
  }, [open, editSeason, reset])

  const handleFormSubmit = (data: SeasonFormData) => {
    if (isEditMode && editSeason) {
      // Update mode
      onSubmit({
        seasonId: editSeason.id,
        data: {
          name: data.name,
          start_date: data.start_date,
          end_date: data.end_date || null,
          description: data.description || null,
          is_active: data.is_active
        }
      })
    } else {
      // Create mode
      onSubmit({
        alliance_id: allianceId,
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date || null,
        description: data.description || null,
        is_active: data.is_active ?? true
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? '編輯賽季' : '新增賽季'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? '修改賽季資訊' : '建立新的賽季以追蹤成員表現'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="grid gap-4 py-4">
            {/* 賽季名稱 */}
            <div className="grid gap-2">
              <Label htmlFor="name">賽季名稱 *</Label>
              <Input
                id="name"
                placeholder="例如：2025 春季賽"
                {...register('name')}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* 起始日期 */}
            <div className="grid gap-2">
              <Label htmlFor="start_date">起始日期 *</Label>
              <Input
                id="start_date"
                type="date"
                {...register('start_date')}
                className={errors.start_date ? 'border-destructive' : ''}
              />
              {errors.start_date && (
                <p className="text-sm text-destructive">{errors.start_date.message}</p>
              )}
            </div>

            {/* 結束日期 */}
            <div className="grid gap-2">
              <Label htmlFor="end_date">結束日期 (選填)</Label>
              <Input id="end_date" type="date" {...register('end_date')} />
              {errors.end_date && (
                <p className="text-sm text-destructive">{errors.end_date.message}</p>
              )}
              <p className="text-xs text-gray-500">留空表示賽季進行中</p>
            </div>

            {/* 描述 */}
            <div className="grid gap-2">
              <Label htmlFor="description">描述 (選填)</Label>
              <textarea
                id="description"
                rows={3}
                placeholder="賽季目標、特殊活動等..."
                {...register('description')}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* 是否設為活躍 */}
            {!isEditMode && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  {...register('is_active')}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is_active" className="cursor-pointer font-normal">
                  設為活躍賽季
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '處理中...' : isEditMode ? '更新' : '建立'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
