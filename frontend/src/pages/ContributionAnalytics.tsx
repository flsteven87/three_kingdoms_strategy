import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { RoleGuard } from '@/components/alliance/RoleGuard'
import { useSeasons } from '@/hooks/use-seasons'
import { Plus } from 'lucide-react'
import { nanoid } from 'nanoid'

import { useAnalyticsMembers } from '@/hooks/use-analytics'
import { ContributionCard } from '@/components/contributions/ContributionCard'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface ContributionDeadline {
    id: string
    title?: string
    type?: 'alliance' | 'punish'
    amount: number // per-member target
    deadline: string // ISO date
    contributions: Record<string, number> // member_id -> contributed amount
}

function ContributionAnalytics() {
    const { data: seasons } = useSeasons()
    const activeSeason = seasons?.find((s) => s.is_active)

    // Members list (used to show who's completed)
    const { data: members } = useAnalyticsMembers(activeSeason?.id, true) as any

    // Local state for contribution deadlines (stored in-memory for skeleton)
    const [deadlines, setDeadlines] = useState<ContributionDeadline[]>([])

    // Dialog form state
    const [dialogOpen, setDialogOpen] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newType, setNewType] = useState<'alliance' | 'punish'>('alliance')
    const [newAmount, setNewAmount] = useState('')
    const [newDeadline, setNewDeadline] = useState('')


    // Handlers
    const handleOpenDialog = useCallback(() => {
        const today = new Date().toISOString().slice(0, 10)
        setDialogOpen(true)
        setNewTitle('')
        setNewType('alliance')
        setNewAmount('')
        setNewDeadline(today)
    }, [])

    const handleCloseDialog = useCallback(() => {
        setDialogOpen(false)
        setNewTitle('')
        setNewType('alliance')
        setNewAmount('')
        setNewDeadline('')
    }, [])

    const handleAdd = useCallback(() => {
        if (!newTitle) return alert('請輸入活動標題')
        const amount = Number(newAmount)
        if (newType === 'alliance' && (Number.isNaN(amount) || amount <= 0)) return alert('請輸入每名成員的捐獻金額（大於 0）')

        const payload = {
            id: nanoid(),
            title: newTitle,
            type: newType,
            amount: newType === 'alliance' ? Number(newAmount) : 0,
            deadline: newDeadline,
            contributions: {},
        }

        setDeadlines((prev) => [
            ...prev,
            payload
        ].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()))

        handleCloseDialog()
    }, [newTitle, newType, newAmount, newDeadline, handleCloseDialog])



    return (
        <AllianceGuard>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">捐獻管理</h2>
                        <p className="text-muted-foreground mt-1">
                            設定成員捐獻目標與截止日
                            {activeSeason && (
                                <span className="ml-2">· 賽季: <span className="font-medium text-foreground">{activeSeason.name}</span></span>
                            )}
                        </p>
                    </div>

                    <RoleGuard requiredRoles={["owner", "collaborator"]}>
                        <Button onClick={handleOpenDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            新增捐獻
                        </Button>
                    </RoleGuard>
                </div>

                {/* Deadlines List */}
                {deadlines.length === 0 ? (
                    <Card>
                        <CardHeader className="flex items-center justify-between">
                            <div>
                                <CardTitle>捐獻活動列表</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground">尚無設定的捐獻活動。</div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {deadlines.map((d) => {
                            const total = Object.values(d.contributions || {}).reduce((a, b) => a + b, 0)
                            const memberCount = (members && members.length) || 1
                            const targetTotal = d.amount * memberCount
                            const isExpired = new Date(d.deadline).getTime() < Date.now()
                            const status: any = isExpired ? (total >= targetTotal ? 'completed' : 'expired') : (total >= targetTotal ? 'completed' : 'in-progress')

                            const tags = d.type === 'punish'
                                ? [{ id: 'punish', label: '惩罚' }]
                                : [{ id: 'alliance', label: '同盟捐献' }]

                            return (
                                <ContributionCard
                                    key={d.id}
                                    title={d.title || `${new Date(d.deadline).toLocaleDateString()}捐獻`}
                                    tags={tags}
                                    deadline={new Date(d.deadline).toLocaleDateString()}
                                    currentAmount={total}
                                    targetAmount={targetTotal}
                                    status={status}
                                    perPersonTarget={d.amount}
                                />
                            )
                        })}
                    </div>
                )}

                {/* Add Deadline Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>新增捐獻</DialogTitle>
                            <DialogDescription>輸入每名成員的捐獻資源總量與截止日</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="dialog-title">活動標題</Label>
                                <Input id="dialog-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例如：年度捐獻活動" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="dialog-type">活動類型</Label>
                                <div>
                                    <select id="dialog-type" value={newType} onChange={(e) => setNewType(e.target.value as any)} className="w-full rounded-md border px-3 py-2">
                                        <option value="alliance">同盟捐献</option>
                                        <option value="punish">惩罚</option>
                                    </select>
                                </div>
                            </div>

                            {newType === 'alliance' ? (
                                <div className="space-y-2">
                                    <Label htmlFor="dialog-amount">每名成員捐獻資源總量</Label>
                                    <Input id="dialog-amount" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="例如：20000" type="number" />
                                </div>
                            ) : (
                                <div className="p-3 rounded bg-muted text-sm text-muted-foreground">您可以在建立活動後為輸入成員個別的懲罰金額。</div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="dialog-deadline">截止日</Label>
                                <Input id="dialog-deadline" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} type="date" />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleCloseDialog}>取消</Button>
                            <Button onClick={handleAdd}>新增</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </AllianceGuard >
    )
}

export { ContributionAnalytics }
