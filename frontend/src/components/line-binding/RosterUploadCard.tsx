import { useState, type ReactNode } from 'react'
import { AlertCircle, ChevronDown, FileSpreadsheet, Loader2, Upload, UserX } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CsvDropZone } from '@/components/uploads/CsvDropZone'
import { useUploadLineRoster } from '@/hooks/use-line-binding'
import { formatDateTW } from '@/lib/date-utils'
import type { RosterUploadResponse } from '@/types/line-binding'

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'detail' in error.response.data &&
    typeof error.response.data.detail === 'string'
  ) {
    return error.response.data.detail
  }

  return error instanceof Error ? error.message : '上傳失敗'
}

interface RosterUploadCardProps {
  readonly canUpdate: boolean
}

export function RosterUploadCard({ canUpdate }: RosterUploadCardProps) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<RosterUploadResponse | null>(null)
  const uploadRoster = useUploadLineRoster()

  const handleUpload = async () => {
    if (!file) return

    const response = await uploadRoster.mutateAsync(file)
    setResult(response)
    setFile(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>名冊 CSV 上傳</CardTitle>
        <CardDescription>
          每列填入一個遊戲 ID，用正式 LINE 群組成員名單驗證綁定狀態。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canUpdate ? (
          <div className="space-y-4">
            <CsvDropZone
              label="成員名冊"
              file={file}
              onFileChange={setFile}
              disabled={uploadRoster.isPending}
              description="上傳或拖放名冊 CSV"
              helperText="單欄格式，每列一個遊戲 ID"
              compact
            />

            {uploadRoster.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{getErrorMessage(uploadRoster.error)}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploadRoster.isPending}
              className="w-full sm:w-auto"
            >
              {uploadRoster.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploadRoster.isPending ? '上傳中...' : '上傳名冊'}
            </Button>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              需要盟主或協作者權限才能上傳名冊。
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-5 border-t pt-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric
                icon={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                label="已登記且在名冊"
                value={result.summary.verified_on_roster_count}
              />
              <Metric
                icon={<UserX className="h-4 w-4 text-muted-foreground" />}
                label="名冊內未登記"
                value={result.summary.unregistered_game_id_count}
              />
            </div>

            <RosterResultSection
              title="1. 已登記且在名冊內的遊戲 ID"
              count={result.verified_on_roster.length}
              emptyText="沒有已登記且符合名冊的遊戲 ID。"
              defaultOpen={false}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">LINE 名稱</th>
                    <th className="p-3 font-medium">遊戲 ID</th>
                    <th className="p-3 font-medium">狀態</th>
                    <th className="p-3 text-right font-medium">登記日期</th>
                  </tr>
                </thead>
                <tbody>
                  {result.verified_on_roster.map(member => (
                    <tr key={`${member.line_user_id}-${member.game_id}`} className="border-b">
                      <td className="p-3">{member.line_display_name}</td>
                      <td className="p-3 font-medium">{member.game_id}</td>
                      <td className="p-3">
                        <Badge variant={member.newly_verified ? 'default' : 'secondary'}>
                          {member.newly_verified ? '本次驗證' : '已驗證'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatDateTW(member.registered_at, { padded: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RosterResultSection>

            <RosterResultSection
              title="2. 名冊內但尚未登記的遊戲 ID"
              count={result.unregistered_game_ids.length}
              emptyText="名冊內的遊戲 ID 都已完成登記。"
              defaultOpen
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">遊戲 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unregistered_game_ids.map(member => (
                    <tr key={member.game_id} className="border-b">
                      <td className="p-3 font-medium">{member.game_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RosterResultSection>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface MetricProps {
  readonly icon: ReactNode
  readonly label: string
  readonly value: number
}

function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

interface RosterResultSectionProps {
  readonly title: string
  readonly count: number
  readonly emptyText: string
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}

function RosterResultSection({
  title,
  count,
  emptyText,
  defaultOpen = true,
  children
}: RosterResultSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-muted/40"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          <Badge variant="outline">{count}</Badge>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        count > 0 ? (
          <div className="overflow-x-auto rounded-lg border">{children}</div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {emptyText}
          </div>
        )
      )}
    </div>
  )
}
