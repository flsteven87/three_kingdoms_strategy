import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { RoleGuard } from '@/components/alliance/RoleGuard'
import { useSeasons } from '@/hooks/use-seasons'
import { useAlliance } from '@/hooks/use-alliance'
import { useContributions, useContributionDetail, useCreateContribution, useUpsertMemberTargetOverride, useDeleteMemberTargetOverride, useDeleteContribution, contributionKeys } from '@/hooks/use-contributions'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Plus, Trash2 } from 'lucide-react'
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { StatusType } from '@/components/contributions/StatusBadge'
import { MemberListItem } from '@/types/analytics'

type ContributionType = 'alliance' | 'punishment'

function ContributionDetailTable({ contributionId, type, perPersonTarget }: { contributionId: string, type: ContributionType, perPersonTarget: number }) {
    const { data: detail } = useContributionDetail(contributionId)
    const deleteOverride = useDeleteMemberTargetOverride()

    if (!detail) {
        return <div className="py-2 text-center text-muted-foreground text-sm">載入中...</div>
    }

    const members = detail.contribution_info
    const sorted = [...members].sort((a, b) => b.contribution_made - a.contribution_made)

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>成員</TableHead>
                    <TableHead className="text-right">已捐獻 / 目標</TableHead>
                    <TableHead className="text-right">進度</TableHead>
                    {type === 'punishment' && <TableHead className="text-right">操作</TableHead>}
                </TableRow>
            </TableHeader>
            <TableBody>
                {sorted.map((m) => {
                    const amount = m.contribution_made
                    const target = type === 'alliance' ? perPersonTarget : m.contribution_target
                    const pct = target > 0 ? Math.min(100, Math.round((amount / target) * 100)) : 0
                    return (
                        <TableRow key={m.member_id}>
                            <TableCell className="font-medium">{m.member_name}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                                {amount.toLocaleString('zh-TW')} / {target.toLocaleString('zh-TW')}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <div className="h-1.5 w-24 rounded-full bg-muted">
                                        <div
                                            className={pct >= 100 ? 'h-1.5 rounded-full bg-emerald-500 transition-all' : 'h-1.5 rounded-full bg-primary/70 transition-all'}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="w-7 text-right text-xs font-medium tabular-nums">{pct}%</span>
                                </div>
                            </TableCell>
                            {type === 'punishment' && (
                                <TableCell className="text-right">
                                    <button onClick={() => deleteOverride.mutate({ contributionId, memberId: m.member_id })} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                                </TableCell>
                            )}
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}

function ContributionAnalytics() {
    const { data: seasons } = useSeasons()
    const { data: alliance } = useAlliance()
    const activeSeason = seasons?.find((s) => s.is_active)
    const allianceId = alliance?.id
    const seasonId = activeSeason?.id

    const queryClient = useQueryClient()
    const { data: contributions } = useContributions(allianceId, seasonId)
    const createMutation = useCreateContribution(allianceId, seasonId)
    const upsertOverride = useUpsertMemberTargetOverride()
    const deleteContributionMutation = useDeleteContribution()
    const deleteOverride = useDeleteMemberTargetOverride()

    // Members list (used to show who's completed)
    const { data: members } = useAnalyticsMembers(activeSeason?.id, true)

    // Local UI state
    const [dialogOpen, setDialogOpen] = useState(false)

    const [newTitle, setNewTitle] = useState('')
    const [newType, setNewType] = useState<'alliance' | 'punish'>('alliance')
    const [newAmount, setNewAmount] = useState('')
    const [newDeadline, setNewDeadline] = useState('')

    // Punishment editing state
    const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null)
    const [selectedMemberId, setSelectedMemberId] = useState('')
    const [punishmentAmount, setPunishmentAmount] = useState('')


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

    const handleAdd = useCallback(async () => {
        if (!newTitle) return alert('請輸入活動標題')
        const amount = Number(newAmount)
        if (newType === 'alliance' && (Number.isNaN(amount) || amount <= 0)) return alert('請輸入每名成員的捐獻金額（大於 0）')
        if (!allianceId || !seasonId) return

        await createMutation.mutateAsync({
            title: newTitle,
            type: newType === 'punish' ? 'punishment' : 'alliance',
            deadline: newDeadline,
            target_contribution: newType === 'alliance' ? amount : 0,
        })
        handleCloseDialog()
    }, [newTitle, newType, newAmount, newDeadline, allianceId, seasonId, createMutation, handleCloseDialog])



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

                {/* Contributions List */}
                {(contributions?.length ?? 0) === 0 ? (
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
                        {contributions?.map((c) => {
                            const detail = queryClient.getQueryData<any>(contributionKeys.detail(c.id))
                            const isExpired = new Date(c.deadline).getTime() < Date.now()
                            const status: StatusType = isExpired ? 'expired' : 'in-progress';
                            const tags = c.type === 'punishment'
                                ? [{ id: 'punish', label: '懲罰' }]
                                : [{ id: 'alliance', label: '捐獻' }]
                            const total = detail ? detail.contribution_info.reduce((sum: number, m: any) => sum + m.contribution_made, 0) : 0
                            const targetTotal = detail
                                ? (c.type === 'alliance'
                                    ? c.target_contribution * detail.contribution_info.length
                                    : detail.contribution_info.reduce((sum: number, m: any) => sum + (m.contribution_target || 0), 0))
                                : 0
                            const perMemberTarget = c.type === 'alliance' ? c.target_contribution : 0

                            return (
                                <ContributionCard
                                    key={c.id}
                                    title={c.title || `${new Date(c.deadline).toLocaleDateString()}捐獻`}
                                    tags={tags}
                                    deadline={new Date(c.deadline).toLocaleDateString()}
                                    currentAmount={total}
                                    targetAmount={targetTotal}
                                    status={status}
                                    perPersonTarget={perMemberTarget}
                                    onOpen={() => queryClient.prefetchQuery({ queryKey: contributionKeys.detail(c.id), queryFn: () => apiClient.getContributionDetail(c.id) })}
                                >
                                    <div className="space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                {c.type === 'alliance' && <p className="text-sm font-medium">成員捐獻進度</p>}
                                                <RoleGuard requiredRoles={["owner", "collaborator"]}>
                                                    <Button size="sm" variant="destructive" onClick={() => deleteContributionMutation.mutate(c.id)}>刪除活動</Button>
                                                </RoleGuard>
                                            </div>

                                            {c.type === 'punishment' && (
                                                <>
                                                    <div className="flex items-center justify-between">
                                                        {editingDeadlineId !== c.id && (
                                                            <Button size="sm" onClick={() => setEditingDeadlineId(c.id)}>
                                                                <Plus className="h-3.5 w-3.5 mr-1" />
                                                                新增懲罰
                                                            </Button>
                                                        )}
                                                    </div>
                                                    {editingDeadlineId === c.id && (
                                                        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                                                            <p className="text-sm font-medium">新增懲罰</p>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm">
                                                                    <option value="">選擇成員</option>
                                                                    {members?.map((m: any) => (
                                                                        <option key={m.id} value={m.id}>{m.display_name || m.name || m.id}</option>
                                                                    ))}
                                                                </select>
                                                                <input type="number" value={punishmentAmount} onChange={(e) => setPunishmentAmount(e.target.value)} placeholder="總資源量" className="rounded-md border px-2 py-1.5 text-sm" />
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={async () => {
                                                                            const amount = Number(punishmentAmount)
                                                                            if (!selectedMemberId || Number.isNaN(amount) || amount <= 0) return
                                                                            await upsertOverride.mutateAsync({ contributionId: c.id, payload: { member_id: selectedMemberId, target_contribution: amount } })
                                                                            setSelectedMemberId('')
                                                                            setPunishmentAmount('')
                                                                        }}
                                                                    >
                                                                        新增
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => {
                                                                            setEditingDeadlineId(null)
                                                                            setSelectedMemberId('')
                                                                            setPunishmentAmount('')
                                                                        }}
                                                                    >
                                                                        取消
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {members == null ? (
                                                <div className="py-2 text-center text-muted-foreground text-sm">載入中...</div>
                                            ) : (
                                                <ContributionDetailTable contributionId={c.id} type={c.type} perPersonTarget={perMemberTarget} />
                                            )}
                                        </div>
                                    </div>
                                </ContributionCard>
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
                                        <option value="punish">懲罰</option>
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
