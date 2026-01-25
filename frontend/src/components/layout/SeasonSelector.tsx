/**
 * SeasonSelector - Global Season Switcher
 *
 * Displays current season and allows quick switching.
 * Placed in Sidebar to ensure visibility across all pages.
 *
 * UX Design:
 * - Shows current season name prominently
 * - Date range as secondary info
 * - Select for switching between activated seasons
 * - Visual indicator for current selection
 */

import { Calendar } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSeasons, useSetCurrentSeason } from '@/hooks/use-seasons'
import { cn } from '@/lib/utils'

export function SeasonSelector() {
  const { data: seasons, isLoading } = useSeasons()
  const setCurrentMutation = useSetCurrentSeason()

  // Get current season and activated seasons for dropdown
  const currentSeason = seasons?.find(s => s.is_current)
  const activatedSeasons = seasons?.filter(s => s.activation_status === 'activated') ?? []

  const handleSeasonChange = async (seasonId: string) => {
    if (seasonId === currentSeason?.id) return
    await setCurrentMutation.mutateAsync(seasonId)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <div className="h-14 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    )
  }

  // No seasons yet or no activated seasons
  if (!seasons || seasons.length === 0 || activatedSeasons.length === 0) {
    return null
  }

  // No current season selected but has activated seasons
  if (!currentSeason && activatedSeasons.length > 0) {
    return (
      <div className="px-3 py-2">
        <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
            請選擇一個賽季
          </p>
        </div>
      </div>
    )
  }

  if (!currentSeason) {
    return null
  }

  return (
    <div className="px-3 py-2">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-1">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">目前賽季</span>
        </div>

        <Select
          value={currentSeason.id}
          onValueChange={handleSeasonChange}
          disabled={setCurrentMutation.isPending}
        >
          <SelectTrigger
            className={cn(
              "w-full h-auto py-2",
              "bg-primary/5 border-primary/20 hover:bg-primary/10",
              "focus:ring-primary/30"
            )}
          >
            <SelectValue>
              <div className="text-left">
                <p className="text-sm font-medium truncate">
                  {currentSeason.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentSeason.start_date}
                  {currentSeason.end_date ? ` ~ ${currentSeason.end_date}` : ' ~ 進行中'}
                </p>
              </div>
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            {activatedSeasons.map((season) => {
              const dateRange = season.end_date
                ? `${season.start_date} ~ ${season.end_date}`
                : `${season.start_date} ~ 進行中`

              return (
                <SelectItem
                  key={season.id}
                  value={season.id}
                  className="py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{season.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {dateRange}
                      </p>
                    </div>
                    {season.is_trial && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        試用
                      </span>
                    )}
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground px-1">
          所有數據將顯示此賽季
        </p>
      </div>
    </div>
  )
}
