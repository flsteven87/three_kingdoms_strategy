/**
 * CopperMineRulesCard - Copper mine rules configuration
 *
 * Inline editing with optimistic updates.
 * Collaborators can add/edit/delete rules, members can only view.
 */

import { useState } from 'react'
import { Plus, Trash2, Loader2, Settings2, Check, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useCopperMineRules,
  useCreateCopperMineRule,
  useUpdateCopperMineRule,
  useDeleteCopperMineRule,
} from '@/hooks/use-copper-mines'
import { useCanManageWeights } from '@/hooks/use-user-role'
import type { CopperMineRule, AllowedLevel } from '@/types/copper-mine'

interface CopperMineRulesCardProps {
  readonly allianceId: string
}

const LEVEL_OPTIONS: { value: AllowedLevel; label: string }[] = [
  { value: 'both', label: '9 或 10 級' },
  { value: 'nine', label: '僅 9 級' },
  { value: 'ten', label: '僅 10 級' },
]

function formatMerit(value: number): string {
  return value.toLocaleString('zh-TW')
}

export function CopperMineRulesCard({ allianceId }: CopperMineRulesCardProps) {
  const canManage = useCanManageWeights()
  const { data: rules, isLoading } = useCopperMineRules(allianceId)
  const createMutation = useCreateCopperMineRule()
  const updateMutation = useUpdateCopperMineRule()
  const deleteMutation = useDeleteCopperMineRule()

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMerit, setEditMerit] = useState('')
  const [editLevel, setEditLevel] = useState<AllowedLevel>('both')

  // New row state
  const [isAdding, setIsAdding] = useState(false)
  const [newMerit, setNewMerit] = useState('')
  const [newLevel, setNewLevel] = useState<AllowedLevel>('both')

  const sortedRules = rules ? [...rules].sort((a, b) => a.tier - b.tier) : []
  const nextTier = sortedRules.length > 0 ? sortedRules[sortedRules.length - 1].tier + 1 : 1
  const canAddMore = nextTier <= 10

  // Get minimum merit for validation
  function getMinMerit(tier: number): number {
    const prevRule = sortedRules.find((r) => r.tier === tier - 1)
    return prevRule ? prevRule.required_merit + 1 : 1
  }

  // Start editing a rule
  function startEdit(rule: CopperMineRule) {
    setEditingId(rule.id)
    setEditMerit(rule.required_merit.toString())
    setEditLevel(rule.allowed_level)
  }

  // Cancel editing
  function cancelEdit() {
    setEditingId(null)
    setEditMerit('')
    setEditLevel('both')
  }

  // Save edited rule
  async function saveEdit(rule: CopperMineRule) {
    const meritValue = parseInt(editMerit, 10)
    const minMerit = getMinMerit(rule.tier)

    if (isNaN(meritValue) || meritValue < minMerit) return

    await updateMutation.mutateAsync({
      ruleId: rule.id,
      allianceId,
      data: {
        required_merit: meritValue,
        allowed_level: editLevel,
      },
    })
    cancelEdit()
  }

  // Start adding new rule
  function startAdd() {
    setIsAdding(true)
    setNewMerit('')
    setNewLevel('both')
  }

  // Cancel adding
  function cancelAdd() {
    setIsAdding(false)
    setNewMerit('')
    setNewLevel('both')
  }

  // Save new rule
  async function saveNew() {
    const meritValue = parseInt(newMerit, 10)
    const minMerit = getMinMerit(nextTier)

    if (isNaN(meritValue) || meritValue < minMerit) return

    await createMutation.mutateAsync({
      allianceId,
      data: {
        tier: nextTier,
        required_merit: meritValue,
        allowed_level: newLevel,
      },
    })
    cancelAdd()
  }

  // Delete rule
  async function handleDelete(rule: CopperMineRule) {
    if (!confirm(`確定要刪除第 ${rule.tier} 座的規則嗎？`)) return
    await deleteMutation.mutateAsync({
      ruleId: rule.id,
      allianceId,
    })
  }

  const isAnyLoading =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-lg">銅礦管理規則</CardTitle>
            <CardDescription>設定銅礦申請的戰功門檻與可申請等級</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">座數</TableHead>
                <TableHead>總戰功門檻</TableHead>
                <TableHead>可申請等級</TableHead>
                {canManage && <TableHead className="w-24 text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Existing rules */}
              {sortedRules.map((rule) => {
                const isEditing = editingId === rule.id

                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">第 {rule.tier} 座</TableCell>

                    {/* Merit column */}
                    <TableCell>
                      {isEditing && canManage ? (
                        <Input
                          type="number"
                          value={editMerit}
                          onChange={(e) => setEditMerit(e.target.value)}
                          className="h-8 w-32 font-mono"
                          min={getMinMerit(rule.tier)}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={`font-mono ${canManage ? 'cursor-pointer hover:text-primary' : ''}`}
                          onClick={() => canManage && startEdit(rule)}
                        >
                          {formatMerit(rule.required_merit)}
                        </span>
                      )}
                    </TableCell>

                    {/* Level column */}
                    <TableCell>
                      {isEditing && canManage ? (
                        <Select
                          value={editLevel}
                          onValueChange={(v: AllowedLevel) => setEditLevel(v)}
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEVEL_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span
                          className={`${canManage ? 'cursor-pointer hover:text-primary' : ''}`}
                          onClick={() => canManage && startEdit(rule)}
                        >
                          {LEVEL_OPTIONS.find((o) => o.value === rule.allowed_level)?.label}
                        </span>
                      )}
                    </TableCell>

                    {/* Actions column */}
                    {canManage && (
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700"
                              onClick={() => saveEdit(rule)}
                              disabled={isAnyLoading}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={cancelEdit}
                              disabled={isAnyLoading}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(rule)}
                            disabled={isAnyLoading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}

              {/* New rule row */}
              {isAdding && canManage && (
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">
                    第 {nextTier} 座
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newMerit}
                      onChange={(e) => setNewMerit(e.target.value)}
                      placeholder={`最少 ${formatMerit(getMinMerit(nextTier))}`}
                      className="h-8 w-32 font-mono"
                      min={getMinMerit(nextTier)}
                      autoFocus
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={newLevel} onValueChange={(v: AllowedLevel) => setNewLevel(v)}>
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-600 hover:text-green-700"
                        onClick={saveNew}
                        disabled={isAnyLoading || !newMerit}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelAdd}
                        disabled={isAnyLoading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty state or add button row */}
              {sortedRules.length === 0 && !isAdding && (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-8">
                    尚未設定任何規則
                    {canManage && <span className="block text-sm mt-1">點擊下方按鈕開始設定</span>}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Add button */}
        {canManage && canAddMore && !isAdding && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={startAdd}
            disabled={isAnyLoading || editingId !== null}
          >
            <Plus className="h-4 w-4 mr-1" />
            新增規則
          </Button>
        )}

        {!canManage && sortedRules.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4">僅協作者以上可編輯規則設置</p>
        )}
      </CardContent>
    </Card>
  )
}
