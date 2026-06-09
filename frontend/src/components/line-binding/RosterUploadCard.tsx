import { useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, UserX } from 'lucide-react'
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

  return error instanceof Error ? error.message : 'Upload failed'
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
        <CardTitle>Roster CSV Upload</CardTitle>
        <CardDescription>
          Upload one game ID per row to verify LINE bindings against the production group.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canUpdate ? (
          <div className="space-y-4">
            <CsvDropZone
              label="Member roster"
              file={file}
              onFileChange={setFile}
              disabled={uploadRoster.isPending}
              description="Upload or drop a roster CSV"
              helperText="Single column, one game ID per row"
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
              {uploadRoster.isPending ? 'Uploading...' : 'Upload roster'}
            </Button>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Owner or collaborator permission is required to upload a roster.
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-5 border-t pt-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric
                icon={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                label="Roster IDs"
                value={result.summary.unique_game_ids}
              />
              <Metric
                icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
                label="On roster"
                value={result.summary.verified_on_roster_count}
              />
              <Metric
                icon={<UserX className="h-4 w-4 text-muted-foreground" />}
                label="No game ID"
                value={result.summary.line_group_unregistered_count}
              />
              <Metric
                icon={<AlertCircle className="h-4 w-4 text-orange-600" />}
                label="Not on roster"
                value={result.summary.bound_not_on_roster_count}
              />
            </div>

            <RosterResultSection
              title="Verified on roster"
              count={result.verified_on_roster.length}
              emptyText="No LINE bindings matched the roster."
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">LINE name</th>
                    <th className="p-3 font-medium">Game ID</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 text-right font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {result.verified_on_roster.map(member => (
                    <tr key={`${member.line_user_id}-${member.game_id}`} className="border-b">
                      <td className="p-3">{member.line_display_name}</td>
                      <td className="p-3 font-medium">{member.game_id}</td>
                      <td className="p-3">
                        <Badge variant={member.newly_verified ? 'default' : 'secondary'}>
                          {member.newly_verified ? 'Newly verified' : 'Already verified'}
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
              title="LINE group members without game ID"
              count={result.line_group_unregistered.length}
              emptyText="Every tracked LINE group member has registered a game ID."
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">LINE name</th>
                    <th className="p-3 text-right font-medium">Tracked</th>
                  </tr>
                </thead>
                <tbody>
                  {result.line_group_unregistered.map(member => (
                    <tr key={member.line_user_id} className="border-b">
                      <td className="p-3">
                        {member.line_display_name ?? (
                          <span className="italic text-muted-foreground">Unknown</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatDateTW(member.tracked_at, { padded: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RosterResultSection>

            <RosterResultSection
              title="Registered game IDs not on roster"
              count={result.bound_not_on_roster.length}
              emptyText="No registered game IDs are missing from the roster."
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">LINE name</th>
                    <th className="p-3 font-medium">Game ID</th>
                    <th className="p-3 font-medium">Current status</th>
                    <th className="p-3 text-right font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bound_not_on_roster.map(member => (
                    <tr key={`${member.line_user_id}-${member.game_id}`} className="border-b">
                      <td className="p-3">{member.line_display_name}</td>
                      <td className="p-3 font-medium">{member.game_id}</td>
                      <td className="p-3">
                        <Badge variant={member.is_verified ? 'default' : 'secondary'}>
                          {member.is_verified ? 'Verified' : 'Pending'}
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
  readonly children: ReactNode
}

function RosterResultSection({
  title,
  count,
  emptyText,
  children
}: RosterResultSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="outline">{count}</Badge>
      </div>
      {count > 0 ? (
        <div className="overflow-x-auto rounded-lg border">{children}</div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  )
}
