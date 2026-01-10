/**
 * LINE Binding Page - LINE Group Integration Management
 *
 * Manages LINE Bot integration for alliance member binding.
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Hyper-minimalist UI
 */

import { useState } from 'react'
import { MessageSquare, Copy, Check, RefreshCw, Unlink, Users, ExternalLink } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  useCreateLineCustomCommand,
  useDeleteLineCustomCommand,
  useGenerateBindingCode,
  useLineBindingStatus,
  useLineCustomCommands,
  useRegisteredMembers,
  useUnbindLineGroup,
  useUpdateLineCustomCommand,
  useCountdown,
  useCopyToClipboard
} from '@/hooks/use-line-binding'
import { useAlliance } from '@/hooks/use-alliance'
import { useCanUpdateAlliance } from '@/hooks/use-user-role'
import type {
  LineBindingStatusResponse,
  LineCustomCommand,
  LineCustomCommandCreate
} from '@/types/line-binding'

const LINE_BOT_ID = import.meta.env.VITE_LINE_BOT_ID || '@977nncax'
const ADD_FRIEND_URL = `https://line.me/R/ti/p/${LINE_BOT_ID}`
const EMPTY_COMMAND_FORM: LineCustomCommandCreate = {
  command_name: '',
  trigger_keyword: '/',
  response_message: '',
  is_enabled: true
}

// =============================================================================
// BoundState Component
// =============================================================================

interface BoundStateProps {
  readonly binding: NonNullable<LineBindingStatusResponse['binding']>
  readonly canUpdate: boolean
  readonly showUnbindDialog: boolean
  readonly setShowUnbindDialog: (open: boolean) => void
  readonly unbindGroup: {
    readonly mutateAsync: () => Promise<void>
    readonly isPending: boolean
  }
}

function BoundState({
  binding,
  canUpdate,
  showUnbindDialog,
  setShowUnbindDialog,
  unbindGroup
}: BoundStateProps) {
  const { data: membersData, isLoading: membersLoading } = useRegisteredMembers(true)
  const { data: commandsData, isLoading: commandsLoading } = useLineCustomCommands(true)
  const createCommand = useCreateLineCustomCommand()
  const updateCommand = useUpdateLineCustomCommand()
  const deleteCommand = useDeleteLineCustomCommand()

  const [commandDialogOpen, setCommandDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState<LineCustomCommand | null>(null)
  const [commandToDelete, setCommandToDelete] = useState<LineCustomCommand | null>(null)
  const [commandForm, setCommandForm] = useState<LineCustomCommandCreate>({
    ...EMPTY_COMMAND_FORM
  })

  const commandError = createCommand.error ?? updateCommand.error
  const commandErrorMessage = commandError instanceof Error ? commandError.message : '指令操作失敗'

  const trimmedName = commandForm.command_name.trim()
  const trimmedTrigger = commandForm.trigger_keyword.trim()
  const trimmedResponse = commandForm.response_message.trim()
  const isTriggerValid = /^\/\S+$/.test(trimmedTrigger)
  const isFormValid = trimmedName.length > 0 && trimmedResponse.length > 0 && isTriggerValid
  const isSaving = createCommand.isPending || updateCommand.isPending
  const isMutating = isSaving || deleteCommand.isPending
  const commands = commandsData ?? []

  const handleOpenCreate = () => {
    setEditingCommand(null)
    setCommandForm({ ...EMPTY_COMMAND_FORM })
    setCommandDialogOpen(true)
  }

  const handleOpenEdit = (command: LineCustomCommand) => {
    setEditingCommand(command)
    setCommandForm({
      command_name: command.command_name,
      trigger_keyword: command.trigger_keyword,
      response_message: command.response_message,
      is_enabled: command.is_enabled
    })
    setCommandDialogOpen(true)
  }

  const handleCommandDialogChange = (open: boolean) => {
    setCommandDialogOpen(open)
    if (!open) {
      setEditingCommand(null)
      setCommandForm({ ...EMPTY_COMMAND_FORM })
    }
  }

  const handleSaveCommand = () => {
    if (!isFormValid) {
      return
    }

    const payload: LineCustomCommandCreate = {
      command_name: trimmedName,
      trigger_keyword: trimmedTrigger,
      response_message: trimmedResponse,
      is_enabled: commandForm.is_enabled
    }

    if (editingCommand) {
      updateCommand.mutate(
        { commandId: editingCommand.id, data: payload },
        { onSuccess: () => setCommandDialogOpen(false) }
      )
      return
    }

    createCommand.mutate(payload, { onSuccess: () => setCommandDialogOpen(false) })
  }

  const handleToggleCommand = async (command: LineCustomCommand) => {
    await updateCommand.mutateAsync({
      commandId: command.id,
      data: { is_enabled: !command.is_enabled }
    })
  }

  const handleConfirmDelete = async () => {
    if (!commandToDelete) {
      return
    }

    await deleteCommand.mutateAsync(commandToDelete.id)
    setCommandToDelete(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>
        <Badge variant="default" className="bg-green-600">已連結</Badge>
      </div>

      <Tabs defaultValue="binding" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="binding">綁定資訊</TabsTrigger>
          <TabsTrigger value="commands">自定義指令</TabsTrigger>
        </TabsList>

        <TabsContent value="binding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>已綁定群組</CardTitle>
              <CardDescription>你的同盟已連結以下 LINE 群組</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Bound Group Info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {binding.group_picture_url ? (
                    <img
                      src={binding.group_picture_url}
                      alt={binding.group_name || '群組'}
                      className="h-12 w-12 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 shrink-0">
                      <MessageSquare className="h-6 w-6 text-green-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-lg truncate">
                      {binding.group_name || '未命名群組'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      綁定於 {new Date(binding.bound_at).toLocaleDateString('zh-TW', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-5 w-5" />
                    <span className="text-lg font-medium">{binding.member_count}</span>
                  </div>
                </div>
              </div>

              {/* Bot behavior & member usage */}
              <div className="space-y-3">
                <h4 className="font-medium">Bot 運作說明</h4>
                <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
                  {/* When bot shows up */}
                  <div>
                    <p className="text-sm font-medium mb-2">Bot 何時推送功能入口</p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>在群組中 @三國小幫手</li>
                      <li>新成員加入群組時（自動歡迎）</li>
                      <li>未註冊者首次發言時（自動提醒）</li>
                    </ul>
                  </div>
                  {/* Available features */}
                  <div>
                    <p className="text-sm font-medium mb-2">盟友可用功能</p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>註冊遊戲 ID — 綁定角色名稱</li>
                      <li>登記銅礦位置 — 記錄座標與等級</li>
                      <li>查看個人表現 — 排名、趨勢、五維圖</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Unbind button */}
              {canUpdate && (
                <>
                  <Separator />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setShowUnbindDialog(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      解除連結
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Registered Members List */}
          <Card>
            <CardHeader>
              <CardTitle>已註冊成員</CardTitle>
              <CardDescription>透過 LINE 註冊遊戲 ID 的盟友名單</CardDescription>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>載入中...</span>
                  </div>
                </div>
              ) : !membersData?.members.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">尚無成員註冊</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    盟友可透過 LINE 群組註冊遊戲 ID
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="pb-3 font-medium">LINE 名稱</th>
                        <th className="pb-3 font-medium">遊戲 ID</th>
                        <th className="pb-3 font-medium">狀態</th>
                        <th className="pb-3 font-medium text-right">註冊日期</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {membersData.members.map((member) => (
                        <tr key={`${member.line_user_id}-${member.game_id}`} className="border-b last:border-0">
                          <td className="py-3">{member.line_display_name}</td>
                          <td className="py-3 font-medium">{member.game_id}</td>
                          <td className="py-3">
                            {member.is_verified ? (
                              <Badge variant="default" className="bg-green-600 text-xs">已驗證</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">待驗證</Badge>
                            )}
                          </td>
                          <td className="py-3 text-right tabular-nums text-muted-foreground">
                            {new Date(member.registered_at).toLocaleDateString('zh-TW', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit'
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commands" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>自定義指令</CardTitle>
                  <CardDescription>需 @三國小幫手 + /指令 才會回覆</CardDescription>
                </div>
                {canUpdate && commands.length > 0 && (
                  <Button onClick={handleOpenCreate} size="sm">
                    新增指令
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {commandsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>載入中...</span>
                  </div>
                </div>
              ) : commands.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                    <MessageSquare className="h-8 w-8 text-muted-foreground" />
                  </div>
                  {canUpdate ? (
                    <>
                      <p className="text-base font-medium mb-2">尚未建立自定義指令</p>
                      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        建立指令後，盟友可在 LINE 群組透過 @三國小幫手 + /指令 觸發回覆
                      </p>
                      <Button onClick={handleOpenCreate}>新增指令</Button>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-medium mb-2">尚未建立自定義指令</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        僅同盟擁有者或協作者可以建立自定義指令
                      </p>
                      <p className="text-xs text-muted-foreground">
                        如果你是同盟擁有者或協作者，請嘗試重新載入頁面或重新登入
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>指令名稱</TableHead>
                        <TableHead>觸發關鍵字</TableHead>
                        <TableHead className="hidden lg:table-cell">回覆內容</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commands.map((command) => (
                        <TableRow key={command.id}>
                          <TableCell className="font-medium">{command.command_name}</TableCell>
                          <TableCell>
                            <code className="px-2 py-1 bg-muted rounded text-xs font-mono">
                              {command.trigger_keyword}
                            </code>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="block max-w-[360px] truncate text-sm text-muted-foreground">
                              {command.response_message}
                            </span>
                          </TableCell>
                          <TableCell>
                            {command.is_enabled ? (
                              <Badge variant="default" className="bg-green-600 text-xs">啟用</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">停用</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canUpdate ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenEdit(command)}
                                  disabled={isMutating}
                                >
                                  編輯
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleCommand(command)}
                                  disabled={isMutating}
                                >
                                  {command.is_enabled ? '停用' : '啟用'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setCommandToDelete(command)
                                    setDeleteDialogOpen(true)
                                  }}
                                  disabled={isMutating}
                                >
                                  刪除
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={commandDialogOpen} onOpenChange={handleCommandDialogChange}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>{editingCommand ? '編輯指令' : '新增指令'}</DialogTitle>
                <DialogDescription>
                  需 @三國小幫手 並輸入 /指令 才會觸發回覆
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="command-name">指令名稱</Label>
                  <Input
                    id="command-name"
                    value={commandForm.command_name}
                    onChange={(event) =>
                      setCommandForm((prev) => ({
                        ...prev,
                        command_name: event.target.value
                      }))
                    }
                    placeholder="例如：戰役集合"
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trigger-keyword">觸發關鍵字</Label>
                  <Input
                    id="trigger-keyword"
                    value={commandForm.trigger_keyword}
                    onChange={(event) =>
                      setCommandForm((prev) => ({
                        ...prev,
                        trigger_keyword: event.target.value
                      }))
                    }
                    placeholder="/集合"
                    disabled={isSaving}
                  />
                  <p className="text-xs text-muted-foreground">
                    必須以 / 開頭，且不包含空格
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="response-message">回覆內容</Label>
                  <Textarea
                    id="response-message"
                    value={commandForm.response_message}
                    onChange={(event) =>
                      setCommandForm((prev) => ({
                        ...prev,
                        response_message: event.target.value
                      }))
                    }
                    placeholder="輸入回覆訊息內容"
                    rows={4}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="command-status">狀態</Label>
                  <Select
                    value={commandForm.is_enabled ? 'enabled' : 'disabled'}
                    onValueChange={(value) =>
                      setCommandForm((prev) => ({
                        ...prev,
                        is_enabled: value === 'enabled'
                      }))
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger id="command-status">
                      <SelectValue placeholder="選擇狀態" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">啟用</SelectItem>
                      <SelectItem value="disabled">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!isFormValid && (
                  <p className="text-sm text-destructive">
                    請確認欄位已填寫，且觸發關鍵字符合格式
                  </p>
                )}
                {(createCommand.isError || updateCommand.isError) && (
                  <p className="text-sm text-destructive">{commandErrorMessage}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleCommandDialogChange(false)}>
                  取消
                </Button>
                <Button onClick={handleSaveCommand} disabled={!isFormValid || isSaving}>
                  {isSaving ? '處理中...' : editingCommand ? '儲存變更' : '新增指令'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open)
              if (!open) {
                setCommandToDelete(null)
              }
            }}
            onConfirm={handleConfirmDelete}
            title="刪除自定義指令"
            description="確定要刪除此指令嗎？此操作無法復原。"
            itemName={commandToDelete?.command_name}
            warningMessage="刪除後，LINE 群組將不再回覆此指令。"
            isDeleting={deleteCommand.isPending}
            confirmText="確認刪除"
          />
        </TabsContent>
      </Tabs>

      {/* Unbind Confirmation Dialog */}
      <Dialog open={showUnbindDialog} onOpenChange={setShowUnbindDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認解除連結？</DialogTitle>
            <DialogDescription>
              解除連結後，盟友將無法再透過此群組進行新的 ID 綁定。
              已綁定的成員資料會保留。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUnbindDialog(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await unbindGroup.mutateAsync()
                setShowUnbindDialog(false)
              }}
              disabled={unbindGroup.isPending}
            >
              {unbindGroup.isPending ? '處理中...' : '確認解除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function LineBinding() {
  const { data: alliance } = useAlliance()
  const allianceId = alliance?.id
  const canUpdate = useCanUpdateAlliance()
  const { data: status, isLoading } = useLineBindingStatus(allianceId)
  const generateCode = useGenerateBindingCode()
  const unbindGroup = useUnbindLineGroup()
  const { copied, copy } = useCopyToClipboard()
  const { formatted: countdown, isExpired, isUrgent } = useCountdown(
    status?.pending_code?.expires_at
  )

  const [showUnbindDialog, setShowUnbindDialog] = useState(false)

  // No alliance yet
  if (!allianceId) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>尚未建立同盟</CardTitle>
            <CardDescription>請先建立同盟才能進行 LINE 群組綁定</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                請先至「設定」頁面建立你的同盟
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>載入中...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Already bound
  if (status?.is_bound && status.binding) {
    return (
      <BoundState
        binding={status.binding}
        canUpdate={canUpdate}
        showUnbindDialog={showUnbindDialog}
        setShowUnbindDialog={setShowUnbindDialog}
        unbindGroup={unbindGroup}
      />
    )
  }

  // Has pending code (not expired)
  if (status?.pending_code && !isExpired) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>等待綁定</CardTitle>
            <CardDescription>請在 LINE 群組中輸入綁定碼完成連結</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Generated Code Display */}
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-3">您的綁定碼</p>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-5xl font-mono font-bold tracking-widest text-primary">
                    {status.pending_code.code}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copy(status.pending_code!.code)}
                    className="shrink-0 h-12 w-12"
                  >
                    {copied ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className={`text-sm ${isUrgent ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                有效期限：{countdown}
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3">
              <h4 className="font-medium">綁定步驟</h4>
              <ol className="text-sm text-muted-foreground space-y-3 list-decimal list-inside">
                <li>確認已將 LINE 三國小幫手 Bot 加入您的 LINE 群組</li>
                <li>
                  在群組中發送：
                  <code className="ml-2 px-2 py-1 bg-muted rounded text-xs font-mono">
                    /綁定 {status.pending_code.code}
                  </code>
                </li>
                <li>完成！頁面會自動更新，盟友即可開始綁定遊戲 ID</li>
              </ol>
            </div>

            {/* Actions */}
            {canUpdate && (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => generateCode.mutate()}
                  disabled={generateCode.isPending}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${generateCode.isPending ? 'animate-spin' : ''}`} />
                  重新生成
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Unbound state (default)
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
        <p className="text-muted-foreground mt-1">
          連結 LINE 群組，讓盟友直接綁定遊戲 ID
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>連結 LINE 群組</CardTitle>
          <CardDescription>透過 LINE Bot 讓盟友輕鬆綁定遊戲帳號</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Feature Introduction */}
          <div className="rounded-lg border bg-muted/30 p-5 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-lg">為什麼要綁定 LINE 群組？</p>
                <p className="text-sm text-muted-foreground mt-2">
                  透過綁定 LINE 群組，盟友可以直接在群組內註冊遊戲 ID，
                  系統會自動關聯成員資料，方便您追蹤盟友表現，不再需要手動比對。
                </p>
              </div>
            </div>
          </div>

          {/* Bot Invite Info */}
          <div className="space-y-3">
            <h4 className="font-medium">Step 1：加入 Bot 到群組</h4>
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-[#06C755] shrink-0">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">LINE 三國小幫手</p>
                <p className="text-sm text-muted-foreground">Bot ID: {LINE_BOT_ID}</p>
              </div>
              <Button variant="outline" asChild>
                <a
                  href={ADD_FRIEND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  加入好友
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              加入好友後，請將 Bot 邀請到您的 LINE 群組中
            </p>
          </div>

          <Separator />

          {/* Generate Code Section */}
          <div className="space-y-3">
            <h4 className="font-medium">Step 2：生成綁定碼</h4>
            <p className="text-sm text-muted-foreground">
              確認 Bot 已加入群組後，點擊下方按鈕生成綁定碼
            </p>

            {canUpdate ? (
              <Button
                onClick={() => generateCode.mutate()}
                disabled={generateCode.isPending}
                size="lg"
                className="w-full"
              >
                {generateCode.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  '生成綁定碼'
                )}
              </Button>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground rounded-lg border bg-muted/30">
                僅同盟擁有者或協作者可以進行 LINE 群組綁定
              </div>
            )}
          </div>

          {/* Error message */}
          {generateCode.isError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              生成綁定碼失敗，請稍後再試
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
