/**
 * LINE Binding Page - LINE Group Integration Management
 *
 * Manages LINE Bot integration for alliance member binding.
 * Supports both production and test group bindings.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { GroupTab } from '@/components/line-binding/GroupTab'
import { RegisteredMembersCard } from '@/components/line-binding/RegisteredMembersCard'
import { CustomCommandsTab } from '@/components/line-binding/CustomCommandsTab'
import { useAlliance } from '@/hooks/use-alliance'
import { useCanUpdateAlliance } from '@/hooks/use-user-role'
import {
  useLineBindingStatus,
  useGenerateBindingCode,
  useUnbindLineGroup
} from '@/hooks/use-line-binding'

const pageHeader = (
  <div>
    <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
    <p className="text-muted-foreground mt-1">
      連結 LINE 群組，讓盟友直接綁定遊戲 ID
    </p>
  </div>
)

export function LineBinding() {
  const { data: alliance } = useAlliance()
  const allianceId = alliance?.id
  const canUpdate = useCanUpdateAlliance()
  const { data: status, isLoading } = useLineBindingStatus(allianceId)
  const generateCode = useGenerateBindingCode()
  const unbindGroup = useUnbindLineGroup()

  const [showUnbindDialog, setShowUnbindDialog] = useState(false)
  const [unbindIsTest, setUnbindIsTest] = useState(false)

  const productionBinding = status?.bindings.find(b => !b.is_test)
  const testBinding = status?.bindings.find(b => b.is_test)
  const pendingCode = status?.pending_code ?? null
  const isBound = productionBinding !== undefined || testBinding !== undefined

  const handleUnbind = (isTest: boolean) => {
    setUnbindIsTest(isTest)
    setShowUnbindDialog(true)
  }

  const confirmUnbind = async () => {
    await unbindGroup.mutateAsync(unbindIsTest)
    setShowUnbindDialog(false)
  }

  if (!allianceId) {
    return (
      <div className="space-y-6">
        {pageHeader}
        <Card>
          <CardHeader>
            <CardTitle>尚未建立同盟</CardTitle>
            <CardDescription>請先建立同盟才能進行 LINE 群組綁定</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <img
                src="/assets/logo-200.png"
                alt="LINE 三國小幫手"
                className="h-16 w-16 rounded-full mb-4"
              />
              <p className="text-muted-foreground">
                請先至「設定」頁面建立你的同盟
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {pageHeader}
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

  return (
    <div className="space-y-6">
      {pageHeader}

      <Tabs defaultValue="production" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="production">正式群組</TabsTrigger>
          <TabsTrigger value="test" className="flex items-center gap-1.5">
            測試群組
            <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-[10px] px-1 py-0">
              測試
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="commands">自定義指令</TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <div className="space-y-6">
            <GroupTab
              binding={productionBinding}
              pendingCode={pendingCode?.is_test === false ? pendingCode : null}
              isTest={false}
              canUpdate={canUpdate}
              onGenerateCode={() => generateCode.mutate(false)}
              onUnbind={() => handleUnbind(false)}
              isGenerating={generateCode.isPending}
              isUnbinding={unbindGroup.isPending}
              generateError={generateCode.error}
            />
            {productionBinding && <RegisteredMembersCard />}
          </div>
        </TabsContent>

        <TabsContent value="test">
          <GroupTab
            binding={testBinding}
            pendingCode={pendingCode?.is_test === true ? pendingCode : null}
            isTest={true}
            canUpdate={canUpdate}
            onGenerateCode={() => generateCode.mutate(true)}
            onUnbind={() => handleUnbind(true)}
            isGenerating={generateCode.isPending}
            isUnbinding={unbindGroup.isPending}
            generateError={generateCode.error}
          />
        </TabsContent>

        <TabsContent value="commands">
          <CustomCommandsTab canUpdate={canUpdate} isBound={isBound} />
        </TabsContent>
      </Tabs>

      <Dialog open={showUnbindDialog} onOpenChange={setShowUnbindDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認解除連結？</DialogTitle>
            <DialogDescription>
              解除連結後，{unbindIsTest ? '測試' : ''}群組將無法再進行新的 ID 綁定。
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
              onClick={confirmUnbind}
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
