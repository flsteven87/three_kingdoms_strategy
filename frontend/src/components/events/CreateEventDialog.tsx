/**
 * CreateEventDialog - Multi-step wizard for creating battle events
 *
 * Steps:
 * 1. Basic Info: Event name, type, expected participants
 * 2. Before Snapshot: Upload CSV for pre-event data
 * 3. After Snapshot: Upload CSV for post-event data
 * 4. Confirm: Preview and create
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  Trophy,
  Swords,
} from 'lucide-react'
import type { EventType } from '@/types/event'
import { EVENT_TYPE_CONFIG } from '@/types/event'

// ============================================================================
// Types
// ============================================================================

interface CreateEventDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly seasonId?: string
}

interface FormData {
  name: string
  eventType: EventType
  description: string
  expectedParticipants: string
  beforeFile: File | null
  afterFile: File | null
}

type Step = 'info' | 'before' | 'after' | 'confirm'

const STEPS: Step[] = ['info', 'before', 'after', 'confirm']

// ============================================================================
// Step Indicator
// ============================================================================

interface StepIndicatorProps {
  readonly currentStep: Step
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.indexOf(currentStep)

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = step === currentStep

        return (
          <div key={step} className="flex items-center">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                isCompleted && 'bg-primary text-primary-foreground',
                isCurrent && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2',
                !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
              )}
            >
              {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-8 h-0.5 mx-1',
                  index < currentIndex ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Step 1: Basic Info
// ============================================================================

interface InfoStepProps {
  readonly formData: FormData
  readonly onChange: (updates: Partial<FormData>) => void
}

function InfoStep({ formData, onChange }: InfoStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">
          事件名稱 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          placeholder="例如：徐州爭奪戰"
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="eventType">
          事件類型 <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.eventType}
          onValueChange={(value) => onChange({ eventType: value as EventType })}
        >
          <SelectTrigger id="eventType">
            <SelectValue placeholder="選擇事件類型" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(EVENT_TYPE_CONFIG) as EventType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {EVENT_TYPE_CONFIG[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expectedParticipants">預期參戰人數</Label>
        <Input
          id="expectedParticipants"
          type="number"
          placeholder="用於計算出席率"
          value={formData.expectedParticipants}
          onChange={(e) => onChange({ expectedParticipants: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          如未設定，將使用快照成員數計算出席率
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">描述 (選填)</Label>
        <Textarea
          id="description"
          placeholder="事件描述或備註"
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Step 2 & 3: Snapshot Upload
// ============================================================================

interface SnapshotStepProps {
  readonly label: string
  readonly description: string
  readonly file: File | null
  readonly onFileChange: (file: File | null) => void
}

function SnapshotStep({ label, description, file, onFileChange }: SnapshotStepProps) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile?.type === 'text/csv' || droppedFile?.name.endsWith('.csv')) {
      onFileChange(droppedFile)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      onFileChange(selectedFile)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium">{label}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
            id="csv-upload"
          />
          <label htmlFor="csv-upload" className="cursor-pointer">
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">拖放 CSV 檔案到這裡</p>
            <p className="text-xs text-muted-foreground">或點擊選擇檔案</p>
            <p className="text-xs text-muted-foreground mt-4">
              支援格式: 同盟統計YYYY年MM月DD日HH时MM分SS秒.csv
            </p>
          </label>
        </div>
      ) : (
        <Card className="border-primary/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFileChange(null)}
              >
                移除
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              <span>已選擇檔案 (實際解析將在建立時進行)</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Step 4: Confirm
// ============================================================================

interface ConfirmStepProps {
  readonly formData: FormData
}

function ConfirmStep({ formData }: ConfirmStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-3">事件摘要</h4>
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">名稱</span>
              <span className="font-medium">{formData.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">類型</span>
              <span className="font-medium">{EVENT_TYPE_CONFIG[formData.eventType].label}</span>
            </div>
            {formData.expectedParticipants && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">預期參戰人數</span>
                <span className="font-medium">{formData.expectedParticipants} 人</span>
              </div>
            )}
            {formData.description && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground text-sm">描述</span>
                <p className="mt-1 text-sm">{formData.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h4 className="font-medium mb-3">上傳檔案</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">戰前快照</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {formData.beforeFile?.name || '未選擇'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">戰後快照</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {formData.afterFile?.name || '未選擇'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preview Stats (Mock) */}
      <div>
        <h4 className="font-medium mb-3">預估分析結果</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="py-3 text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-bold">85%</div>
              <div className="text-xs text-muted-foreground">預估參與率</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <Swords className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-bold">1.2M</div>
              <div className="text-xs text-muted-foreground">預估總戰功</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <Trophy className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-bold">8,500</div>
              <div className="text-xs text-muted-foreground">預估平均戰功</div>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          * 實際結果將在建立事件後計算
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function CreateEventDialog({ open, onOpenChange }: CreateEventDialogProps) {
  const [currentStep, setCurrentStep] = useState<Step>('info')
  const [formData, setFormData] = useState<FormData>({
    name: '',
    eventType: 'siege',
    description: '',
    expectedParticipants: '',
    beforeFile: null,
    afterFile: null,
  })

  const currentIndex = STEPS.indexOf(currentStep)
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === STEPS.length - 1

  const handleChange = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1])
    }
  }

  const handleNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1])
    }
  }

  const handleCreate = () => {
    // TODO: Implement actual API call
    onOpenChange(false)
    // Reset form
    setCurrentStep('info')
    setFormData({
      name: '',
      eventType: 'siege',
      description: '',
      expectedParticipants: '',
      beforeFile: null,
      afterFile: null,
    })
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset form after close animation
    setTimeout(() => {
      setCurrentStep('info')
      setFormData({
        name: '',
        eventType: 'siege',
        description: '',
        expectedParticipants: '',
        beforeFile: null,
        afterFile: null,
      })
    }, 300)
  }

  // Validation for next button
  const canProceed = () => {
    switch (currentStep) {
      case 'info':
        return formData.name.trim().length > 0
      case 'before':
        return formData.beforeFile !== null
      case 'after':
        return formData.afterFile !== null
      case 'confirm':
        return true
      default:
        return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新增事件</DialogTitle>
          <DialogDescription>
            建立戰役事件來追蹤成員表現
          </DialogDescription>
        </DialogHeader>

        <StepIndicator currentStep={currentStep} />

        <div className="min-h-[300px]">
          {currentStep === 'info' && (
            <InfoStep formData={formData} onChange={handleChange} />
          )}
          {currentStep === 'before' && (
            <SnapshotStep
              label="上傳戰前數據"
              description="請上傳事件開始前的同盟成員數據"
              file={formData.beforeFile}
              onFileChange={(file) => handleChange({ beforeFile: file })}
            />
          )}
          {currentStep === 'after' && (
            <SnapshotStep
              label="上傳戰後數據"
              description="請上傳事件結束後的同盟成員數據"
              file={formData.afterFile}
              onFileChange={(file) => handleChange({ afterFile: file })}
            />
          )}
          {currentStep === 'confirm' && <ConfirmStep formData={formData} />}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={isFirstStep ? handleClose : handlePrevious}
          >
            {isFirstStep ? (
              '取消'
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                上一步
              </>
            )}
          </Button>
          {isLastStep ? (
            <Button onClick={handleCreate} disabled={!canProceed()}>
              建立事件
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={!canProceed()}>
              下一步
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
