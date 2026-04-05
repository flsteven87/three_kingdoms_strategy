/**
 * Seasons Page - Season Purchase System
 *
 * Supports the Season Purchase System:
 * - Create draft seasons (no quota required)
 * - Activate seasons (consumes season credit or uses trial)
 * - Set activated seasons as current
 * - Complete seasons
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - TanStack Query for server state
 * - Type-safe component
 * - Optimistic updates
 * - No manual memoization (React Compiler handles)
 */

import { useState } from "react";
import { Plus, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeasonCard } from "@/components/seasons/SeasonCard";
import { AllianceGuard } from "@/components/alliance/AllianceGuard";
import { RoleGuard } from "@/components/alliance/RoleGuard";
import { useAlliance } from "@/hooks/use-alliance";
import { useSeasonQuotaDisplay } from "@/hooks/use-season-quota";
import {
  useSeasons,
  useCreateSeason,
  useUpdateSeason,
  useDeleteSeason,
  useActivateSeason,
  useSetCurrentSeason,
  useCompleteSeason,
  useReopenSeason,
} from "@/hooks/use-seasons";
import type { Season } from "@/types/season";

import { GAME_SEASON_TAGS } from "@/constants/game-seasons";

function Seasons() {
  const [isCreating, setIsCreating] = useState(false);
  const [newSeasonData, setNewSeasonData] = useState({
    name: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    description: "",
    game_season_tag: "",
  });

  // Fetch alliance data
  const { data: alliance } = useAlliance();

  // Fetch seasons
  const { data: seasons, isLoading } = useSeasons();

  // Season quota status for display
  const quotaDisplay = useSeasonQuotaDisplay();

  // Mutations
  const createMutation = useCreateSeason();
  const updateMutation = useUpdateSeason();
  const deleteMutation = useDeleteSeason();
  const activateMutation = useActivateSeason();
  const setCurrentMutation = useSetCurrentSeason();
  const completeMutation = useCompleteSeason();
  const reopenMutation = useReopenSeason();

  /**
   * Sort seasons: current first, then activated, then draft, by start_date descending
   */
  const sortedSeasons = seasons
    ? [...seasons].sort((a, b) => {
      // Current season first
      if (a.is_current && !b.is_current) return -1;
      if (!a.is_current && b.is_current) return 1;

      // Then by activation_status: activated > draft > completed
      const statusOrder = { activated: 0, draft: 1, completed: 2 };
      const statusDiff =
        statusOrder[a.activation_status] - statusOrder[b.activation_status];
      if (statusDiff !== 0) return statusDiff;

      // Then by start_date descending
      return (
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );
    })
    : [];

  /**
   * Handle create new season (as draft)
   */
  const handleCreate = async () => {
    if (!alliance || !newSeasonData.name.trim() || !newSeasonData.start_date) {
      return;
    }

    await createMutation.mutateAsync({
      alliance_id: alliance.id,
      name: newSeasonData.name,
      start_date: newSeasonData.start_date,
      end_date: newSeasonData.end_date || null,
      description: newSeasonData.description || null,
      game_season_tag: newSeasonData.game_season_tag || null,
    });

    // Reset form
    setNewSeasonData({
      name: "",
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      description: "",
      game_season_tag: "",
    });
    setIsCreating(false);
  };

  /**
   * Handle update season (optimistic)
   */
  const handleUpdate = async (seasonId: string, data: Partial<Season>) => {
    await updateMutation.mutateAsync({ seasonId, data });
  };

  /**
   * Handle delete season (optimistic)
   */
  const handleDelete = async (seasonId: string) => {
    await deleteMutation.mutateAsync(seasonId);
  };

  /**
   * Handle activate season (consume season credit)
   */
  const handleActivate = async (seasonId: string) => {
    await activateMutation.mutateAsync(seasonId);
  };

  /**
   * Handle set season as current
   */
  const handleSetCurrent = async (seasonId: string) => {
    await setCurrentMutation.mutateAsync(seasonId);
  };

  /**
   * Handle complete season
   */
  const handleComplete = async (seasonId: string) => {
    await completeMutation.mutateAsync(seasonId);
  };

  /**
   * Handle reopen season
   */
  const handleReopen = async (seasonId: string) => {
    await reopenMutation.mutateAsync(seasonId);
  };

  /**
   * Cancel create mode
   */
  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewSeasonData({
      name: "",
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      description: "",
      game_season_tag: "",
    });
  };

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">賽季管理</h2>
            <RoleGuard requiredRoles={["owner", "collaborator"]}>
              <Badge
                variant={
                  quotaDisplay.statusColor === "red"
                    ? "destructive"
                    : "secondary"
                }
                className="text-xs"
              >
                {quotaDisplay.hasTrialAvailable
                  ? "可免費試用"
                  : quotaDisplay.trialDaysRemaining !== null &&
                    quotaDisplay.trialDaysRemaining > 0
                    ? `試用 ${quotaDisplay.trialDaysRemaining} 天`
                    : quotaDisplay.availableSeasons > 0
                      ? `剩餘 ${quotaDisplay.availableSeasons} 季`
                      : "需購買"}
              </Badge>
            </RoleGuard>
          </div>
          <RoleGuard requiredRoles={["owner", "collaborator"]}>
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新增賽季
              </Button>
            )}
          </RoleGuard>
        </div>

        {/* Create New Season Card */}
        <RoleGuard requiredRoles={["owner", "collaborator"]}>
          {isCreating && (
            <Card className="border-primary/50 shadow-sm">
              <CardHeader>
                <CardTitle>建立新賽季</CardTitle>
                <CardDescription>
                  新賽季會先建立為草稿，啟用後才會消耗 1 季（試用期間免費）。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-season-name">賽季名稱 *</Label>
                    <Input
                      id="new-season-name"
                      value={newSeasonData.name}
                      onChange={(e) =>
                        setNewSeasonData({
                          ...newSeasonData,
                          name: e.target.value,
                        })
                      }
                      placeholder="例如：第一賽季、春季賽"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-season-start">開始日期 *</Label>
                      <Input
                        id="new-season-start"
                        type="date"
                        value={newSeasonData.start_date}
                        onChange={(e) =>
                          setNewSeasonData({
                            ...newSeasonData,
                            start_date: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new-season-end">結束日期</Label>
                      <Input
                        id="new-season-end"
                        type="date"
                        value={newSeasonData.end_date}
                        onChange={(e) =>
                          setNewSeasonData({
                            ...newSeasonData,
                            end_date: e.target.value,
                          })
                        }
                        placeholder="選填（留空表示進行中）"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-season-desc">賽季說明</Label>
                    <Input
                      id="new-season-desc"
                      value={newSeasonData.description}
                      onChange={(e) =>
                        setNewSeasonData({
                          ...newSeasonData,
                          description: e.target.value,
                        })
                      }
                      placeholder="選填：補充說明或備註"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-season-tag">遊戲賽季</Label>
                    <Select
                      value={newSeasonData.game_season_tag}
                      onValueChange={(value) =>
                        setNewSeasonData({
                          ...newSeasonData,
                          game_season_tag: value === "none" ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger id="new-season-tag">
                        <SelectValue placeholder="選填：關聯銅礦資料" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="none">不設定</SelectItem>
                        {GAME_SEASON_TAGS.map((tag) => (
                          <SelectItem key={tag.value} value={tag.value}>
                            {tag.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Existing seasons date reference */}
                  {seasons && seasons.length > 0 && (
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        現有賽季日期
                      </p>
                      <div className="space-y-1">
                        {seasons.map((s) => (
                          <div
                            key={s.id}
                            className="flex justify-between text-xs text-muted-foreground"
                          >
                            <span>{s.name}</span>
                            <span>
                              {s.start_date}
                              {s.end_date ? ` ~ ${s.end_date}` : " ~ 進行中"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCancelCreate}
                    disabled={createMutation.isPending}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={
                      createMutation.isPending ||
                      !newSeasonData.name.trim() ||
                      !newSeasonData.start_date
                    }
                  >
                    {createMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    建立賽季
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </RoleGuard>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && sortedSeasons.length === 0 && !isCreating && (
          <RoleGuard
            requiredRoles={["owner", "collaborator"]}
            fallback={
              <EmptyState
                icon={Calendar}
                title="尚無賽季"
                description="目前沒有可用的賽季。請聯繫盟主或管理員建立賽季。"
              />
            }
          >
            <EmptyState
              icon={Calendar}
              title="尚無賽季"
              description="建立第一個賽季以開始追蹤盟友表現數據。每個賽季可以設定時間範圍，方便進行數據分析與比較。"
              action={{
                label: "建立第一個賽季",
                onClick: () => setIsCreating(true),
                icon: Plus,
              }}
            />
          </RoleGuard>
        )}

        {/* Season Cards */}
        {!isLoading && sortedSeasons.length > 0 && (
          <div className="space-y-4">
            {sortedSeasons.map((season) => (
              <SeasonCard
                key={season.id}
                season={season}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onActivate={handleActivate}
                onSetCurrent={handleSetCurrent}
                onComplete={handleComplete}
                onReopen={handleReopen}
              />
            ))}
          </div>
        )}
      </div>
    </AllianceGuard>
  );
}

export { Seasons };
