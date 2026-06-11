import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, ChevronDown, FileSpreadsheet, Loader2, Search, Upload, UserX } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CsvDropZone } from '@/components/uploads/CsvDropZone'
import { useUploadLineRoster } from '@/hooks/use-line-binding'
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

interface RosterSearchRow {
  readonly lineName: string
  readonly gameName: string
}

function getRosterSearchRows(result: RosterUploadResponse | null): RosterSearchRow[] {
  if (!result) return []

  const seen = new Set<string>()
  const rows: RosterSearchRow[] = []

  const addRow = (lineName: string, gameName: string) => {
    const key = `${lineName}\u0000${gameName}`
    if (seen.has(key)) return

    seen.add(key)
    rows.push({ lineName, gameName })
  }

  result.verified_on_roster.forEach(member => {
    addRow(member.line_display_name, member.game_id)
  })

  result.unregistered_game_ids.forEach(member => {
    if (member.possible_line_display_name && member.possible_registered_game_id) {
      addRow(member.possible_line_display_name, member.possible_registered_game_id)
    }
  })

  return rows
}

export function RosterUploadCard({ canUpdate }: RosterUploadCardProps) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<RosterUploadResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const uploadRoster = useUploadLineRoster()
  const unmatchedGameIds = result?.unregistered_game_ids.filter(
    member => member.possible_registered_game_id === null
  ) ?? []
  const rosterSearchRows = useMemo(() => getRosterSearchRows(result), [result])
  const filteredRosterRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return rosterSearchRows

    return rosterSearchRows.filter(row =>
      row.lineName.toLowerCase().includes(query) ||
      row.gameName.toLowerCase().includes(query)
    )
  }, [rosterSearchRows, searchQuery])

  const handleUpload = async () => {
    if (!file) return

    const response = await uploadRoster.mutateAsync(file)
    setResult(response)
    setSearchQuery('')
    setFile(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>名冊登記比對</CardTitle>
        <CardDescription>
          上傳遊戲 ID 名冊，檢查哪些玩家已完成 LINE 登記；此功能只顯示比對結果，不更新玩家資料。
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
              description="上傳或拖放比對用 CSV"
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
              {uploadRoster.isPending ? '比對中...' : '開始比對'}
            </Button>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              需要盟主或協作者權限才能執行名冊比對。
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

            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="搜尋 LINE 名稱或遊戲名稱"
                  className="pl-9"
                />
              </div>

              <RosterResultSection
                title="LINE 名稱 / 遊戲名稱"
                count={filteredRosterRows.length}
                emptyText="沒有符合搜尋條件的結果。"
                defaultOpen
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="p-3 font-medium">LINE 名稱</th>
                      <th className="p-3 font-medium">遊戲名稱</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRosterRows.map(row => (
                      <tr key={`${row.lineName}-${row.gameName}`} className="border-b">
                        <td className="p-3">{row.lineName}</td>
                        <td className="p-3 font-medium">{row.gameName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </RosterResultSection>
            </div>

            <RosterResultSection
              title="名冊內但尚未登記的遊戲 ID"
              count={unmatchedGameIds.length}
              emptyText="名冊內的遊戲 ID 都已完成登記或有可能符合。"
              defaultOpen
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">遊戲 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedGameIds.map(member => (
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
