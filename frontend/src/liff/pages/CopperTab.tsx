/**
 * Copper Tab
 * - No manual memoization (React Compiler handles)
 *
 * Compact copper mine registration for LIFF Tall mode.
 */

import { useEffect, useState } from "react";
import {
  Plus,
  MapPin,
  Trash2,
  Info,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GAME_SEASON_TAGS } from "@/constants/game-seasons";
import { liffTypography } from "@/lib/typography";
import {
  useLiffCopperCoordinateLookup,
  useLiffCopperMines,
  useLiffCopperRules,
  useLiffRegisterCopper,
  useLiffDeleteCopper,
} from "../hooks/use-liff-copper";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog";
import { LiffErrorBanner } from "../components/LiffErrorBanner";

interface Props {
  readonly session: LiffSessionWithGroup;
  readonly onNavigateSearch: (gameId: string) => void;
}

export function CopperTab({ session, onNavigateSearch }: Props) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [debouncedCoords, setDebouncedCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [level, setLevel] = useState("9");
  const [formError, setFormError] = useState("");
  const [showOtherMines, setShowOtherMines] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
    lineIdToken: session.lineIdToken ?? "",
  };

  const memberContext = {
    ...context,
    lineDisplayName: session.lineDisplayName,
  };

  // Get registered accounts
  const { data: memberInfo, isLoading: isLoadingMember } =
    useLiffMemberInfo(memberContext);
  const effectiveGameId =
    selectedGameId || memberInfo?.registered_ids?.[0]?.game_id || null;

  const { data, isLoading, error } = useLiffCopperMines(context);
  const { data: rules } = useLiffCopperRules(session.lineGroupId);
  const registerMutation = useLiffRegisterCopper(context);
  const deleteMutation = useLiffDeleteCopper(context);

  const hasSourceData = data?.has_source_data ?? false;
  const sourceDataLabel = data?.current_game_season_tag
    ? (GAME_SEASON_TAGS.find((tag) => tag.value === data.current_game_season_tag)?.label ??
      data.current_game_season_tag)
    : "資料來源";
  const canUseSearch = !!effectiveGameId;

  // Debounced coordinate lookup — only meaningful when source data exists
  useEffect(() => {
    const x = parseInt(coordX, 10);
    const y = parseInt(coordY, 10);
    if (!coordX.trim() || !coordY.trim() || isNaN(x) || x < 0 || isNaN(y) || y < 0) {
      setDebouncedCoords(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedCoords({ x, y }), 300);
    return () => clearTimeout(timer);
  }, [coordX, coordY]);

  const lookup = useLiffCopperCoordinateLookup(
    hasSourceData ? session.lineGroupId : null,
    debouncedCoords?.x ?? null,
    debouncedCoords?.y ?? null,
  );
  const lookupData = lookup.data;
  const coordInSource =
    lookupData?.level != null && !lookupData.requires_manual_level;
  const coordNotInSource =
    lookupData?.requires_manual_level === true && !lookupData.is_taken;
  const coordTaken = lookupData?.is_taken === true;

  // Auto-sync level selector to source-of-truth value when coord is in source
  useEffect(() => {
    if (coordInSource && lookupData?.level != null) {
      setLevel(String(lookupData.level));
    }
  }, [coordInSource, lookupData?.level]);

  // Get all game_ids owned by this user
  const myGameIds = new Set(
    memberInfo?.registered_ids?.map((acc) => acc.game_id) || []
  );

  // Separate mines into: selected account, other accounts (mine), alliance (others)
  const mines = data?.mines || [];
  const selectedMines: typeof mines = [];
  const myOtherMines: typeof mines = [];
  const otherMines: typeof mines = [];
  for (const mine of mines) {
    if (effectiveGameId && mine.game_id === effectiveGameId) {
      selectedMines.push(mine);
    } else if (myGameIds.has(mine.game_id)) {
      myOtherMines.push(mine);
    } else {
      otherMines.push(mine);
    }
  }

  // Count for currently selected game_id
  const myCount = selectedMines.length;
  const maxAllowed = data?.max_allowed ?? 0;
  const canApply = maxAllowed === 0 || myCount < maxAllowed;

  const handleRegister = async () => {
    if (!effectiveGameId || !coordX.trim() || !coordY.trim()) return;

    const x = parseInt(coordX, 10);
    const y = parseInt(coordY, 10);

    if (isNaN(x) || x < 0) {
      setFormError("X 座標格式錯誤");
      return;
    }
    if (isNaN(y) || y < 0) {
      setFormError("Y 座標格式錯誤");
      return;
    }

    setFormError("");
    try {
      await registerMutation.mutateAsync({
        gameId: effectiveGameId,
        coordX: x,
        coordY: y,
        level: parseInt(level, 10),
      });
      setCoordX("");
      setCoordY("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteClick = (mineId: string) => {
    setPendingDeleteId(mineId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteMutation.mutateAsync({ mineId: pendingDeleteId });
    } finally {
      setPendingDeleteId(null);
    }
  };

  if (isLoadingMember || isLoading) {
    return (
      <div className="py-6 text-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  // No registered accounts (edge case - should not reach here with onboarding)
  if (memberInfo?.registered_ids?.length === 0) {
    return (
      <div className="p-3 text-center">
        <p className={liffTypography.body}>請先至「ID 管理」綁定遊戲帳號</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-center text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  // Format level text for display
  const formatLevel = (allowedLevel: "nine" | "ten" | "both") => {
    if (allowedLevel === "nine") return "9 級";
    if (allowedLevel === "ten") return "10 級";
    return "9/10 級";
  };

  // Format merit number with comma separators
  const formatMerit = (merit: number) => merit.toLocaleString("zh-TW");

  return (
    <>
      <div className="mx-auto w-full max-w-4xl space-y-3 p-3 md:grid md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-4 md:space-y-0 md:p-4">
        <div className="space-y-3">
          {/* Quota status */}
          {maxAllowed > 0 && (
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                canApply ? "bg-muted/50" : "bg-destructive/10"
              }`}
            >
              <span
                className={
                  canApply ? "text-muted-foreground" : "text-destructive"
                }
              >
                已申請 {myCount} / {maxAllowed} 座
              </span>
              {!canApply && (
                <span className="font-medium text-destructive">已達上限</span>
              )}
            </div>
          )}

          {/* Compact form */}
          <div className="space-y-2 rounded-xl border bg-card p-3">
            <div className="flex gap-2">
              {memberInfo?.registered_ids?.length === 1 ? (
                <div className="flex h-10 flex-1 items-center rounded-md bg-muted/50 px-3 text-sm">
                  {effectiveGameId}
                </div>
              ) : (
                <Select
                  value={effectiveGameId || ""}
                  onValueChange={setSelectedGameId}
                >
                  <SelectTrigger className="h-10 flex-1">
                    <SelectValue placeholder="選擇帳號" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberInfo?.registered_ids?.map((acc) => (
                      <SelectItem key={acc.game_id} value={acc.game_id}>
                        {acc.game_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                value={level}
                onValueChange={setLevel}
                disabled={!canApply || coordInSource}
              >
                <SelectTrigger className="h-10 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 級</SelectItem>
                  <SelectItem value="9">9 級</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="h-10 w-full"
              onClick={() => effectiveGameId && onNavigateSearch(effectiveGameId)}
              disabled={!canUseSearch}
            >
              <Search className="mr-2 h-4 w-4" />
              搜尋銅礦
              {hasSourceData && (
                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {sourceDataLabel}
                </span>
              )}
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5">
                <span className="shrink-0 text-sm text-muted-foreground">X</span>
                <Input
                  value={coordX}
                  onChange={(e) => setCoordX(e.target.value)}
                  placeholder="123"
                  className="h-10"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </div>
              <div className="flex flex-1 items-center gap-1.5">
                <span className="shrink-0 text-sm text-muted-foreground">Y</span>
                <Input
                  value={coordY}
                  onChange={(e) => setCoordY(e.target.value)}
                  placeholder="456"
                  className="h-10"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onKeyDown={(e) =>
                    e.key === "Enter" && canApply && handleRegister()
                  }
                />
              </div>
            </div>
            {lookupData && (
              <>
                {coordInSource && (
                  <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Lv.{lookupData.level} · {lookupData.county} {lookupData.district}
                  </div>
                )}
                {coordNotInSource && (
                  <div className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                    ⚠ {lookupData.message ?? "座標不在官方資料中，請確認等級"}
                  </div>
                )}
                {coordTaken && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    此座標已被註冊
                  </div>
                )}
              </>
            )}
            <Button
              onClick={handleRegister}
              disabled={
                !canApply ||
                !effectiveGameId ||
                !coordX.trim() ||
                !coordY.trim() ||
                coordTaken ||
                registerMutation.isPending
              }
              className="h-10 w-full"
            >
              {registerMutation.isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  註冊
                </>
              )}
            </Button>
          </div>

          <LiffErrorBanner
            message={formError || registerMutation.error?.message}
          />

          {rules && rules.length > 0 && (
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4" />
                申請條件
              </div>
              <div className="grid gap-1">
                {rules.map((rule) => (
                  <div key={rule.tier} className="flex justify-between text-xs">
                    <span>第 {rule.tier} 座</span>
                    <span>
                      {formatLevel(rule.allowed_level)} · 戰功 ≥{" "}
                      {formatMerit(rule.required_merit)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 md:pt-0">
          <div className="text-xs text-muted-foreground mb-2">
            {effectiveGameId} 的銅礦 ({selectedMines.length})
          </div>
          {selectedMines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              尚未註冊銅礦
            </p>
          ) : (
            <div className="space-y-1">
              {selectedMines.map((mine) => (
                <div
                  key={mine.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-primary/10"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-medium">Lv.{mine.level}</span>
                    <span className="text-xs text-muted-foreground">
                      ({mine.coord_x},{mine.coord_y})
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {mine.game_id}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleDeleteClick(mine.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* My other accounts' mines */}
          {myOtherMines.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs text-muted-foreground mb-2">
                我的其他帳號 ({myOtherMines.length})
              </div>
              {myOtherMines.map((mine) => (
                <div
                  key={mine.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4 shrink-0 text-secondary-foreground" />
                    <span className="text-sm font-medium">Lv.{mine.level}</span>
                    <span className="text-xs text-muted-foreground">
                      ({mine.coord_x},{mine.coord_y})
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {mine.game_id}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleDeleteClick(mine.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Other mines - expandable */}
          {otherMines.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowOtherMines(!showOtherMines)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showOtherMines ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                同盟銅礦 ({otherMines.length})
              </button>
              {showOtherMines && (
                <div className="space-y-1 mt-2">
                  {otherMines.map((mine) => (
                    <div
                      key={mine.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Lv.{mine.level}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({mine.coord_x},{mine.coord_y})
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {mine.game_id}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="確定刪除銅礦？"
        description="刪除後將無法復原。"
        onConfirm={handleConfirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
