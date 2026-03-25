import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  useCreateLineCustomCommand,
  useDeleteLineCustomCommand,
  useLineCustomCommands,
  useUpdateLineCustomCommand
} from '@/hooks/use-line-binding'
import { EMPTY_COMMAND_FORM } from '@/components/line-binding/constants'
import type { LineCustomCommand, LineCustomCommandCreate } from '@/types/line-binding'

interface CustomCommandsTabProps {
  readonly canUpdate: boolean
  readonly isBound: boolean
}

export function CustomCommandsTab({ canUpdate, isBound }: CustomCommandsTabProps) {
  const { data: commandsData, isLoading: commandsLoading } = useLineCustomCommands(isBound)
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
    if (!isFormValid) return

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
    if (!commandToDelete) return

    await deleteCommand.mutateAsync(commandToDelete.id)
    setCommandToDelete(null)
  }

  if (!isBound) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>自定義指令</CardTitle>
          <CardDescription>需 @三國小幫手 + /指令 才會回覆</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-base font-medium mb-2">請先綁定 LINE 群組</p>
            <p className="text-sm text-muted-foreground">
              綁定群組後即可建立自定義指令
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
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
          if (!open) setCommandToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="刪除自定義指令"
        description="確定要刪除此指令嗎？此操作無法復原。"
        itemName={commandToDelete?.command_name}
        warningMessage="刪除後，LINE 群組將不再回覆此指令。"
        isDeleting={deleteCommand.isPending}
        confirmText="確認刪除"
      />
    </>
  )
}
