/**
 * TransferCopperMineDialog - Dialog for transferring reserved copper mine to a member
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
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useAnalyticsMembers } from '@/hooks/use-analytics'
import type { CopperMineOwnership } from '@/types/copper-mine'

interface FormData {
    member_id: string
}

interface TransferCopperMineDialogProps {
    readonly open: boolean
    readonly onOpenChange: (open: boolean) => void
    readonly seasonId: string
    readonly ownership: CopperMineOwnership | null
    readonly onTransfer: (ownershipId: string, memberId: string) => Promise<void>
    readonly isTransferring: boolean
}

export function TransferCopperMineDialog({
    open,
    onOpenChange,
    seasonId,
    ownership,
    onTransfer,
    isTransferring,
}: TransferCopperMineDialogProps) {
    const { data: members, isLoading: isLoadingMembers } = useAnalyticsMembers(seasonId, true)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const {
        setValue,
        watch,
        reset,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        defaultValues: {
            member_id: '',
        },
    })

    const memberId = watch('member_id')

    // Sort members by name for better UX
    const sortedMembers = useMemo(() => {
        if (!members) return []
        return [...members].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
    }, [members])

    // Reset form and error when dialog opens
    useEffect(() => {
        if (open) {
            setSubmitError(null)
            reset({
                member_id: '',
            })
        }
    }, [open, reset])

    async function onSubmit(data: FormData) {
        if (!data.member_id || !ownership) return

        setSubmitError(null)

        try {
            await onTransfer(ownership.id, data.member_id)
            onOpenChange(false)
        } catch (error) {
            const message = error instanceof Error ? error.message : '轉移失敗'
            setSubmitError(message)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>轉移銅礦</DialogTitle>
                    <DialogDescription>
                        {ownership && `將座標 (${ownership.coord_x}, ${ownership.coord_y}) 的預留銅礦轉移給成員`}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {submitError && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{submitError}</AlertDescription>
                        </Alert>
                    )}

                    {/* Member Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="member_id">選擇成員</Label>
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

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isTransferring}
                        >
                            取消
                        </Button>
                        <Button type="submit" disabled={isTransferring || !memberId}>
                            {isTransferring && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            確認轉移
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
