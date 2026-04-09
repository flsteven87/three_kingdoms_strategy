/**
 * Copper Search Page
 *
 * Dedicated full-page search for copper mine availability.
 * Supports county-based search (when source data exists) and coordinate lookup.
 * Follows IdManagementPage navigation pattern.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Search, Plus, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useLiffCopperMines,
  useLiffCopperSearch,
  useLiffRegisterCopper,
} from "../hooks/use-liff-copper";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type { CopperCoordinateSearchResult } from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSessionWithGroup;
  readonly onBack: () => void;
}

export function CopperSearchPage({ session, onBack }: Props) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [coordSearchResult, setCoordSearchResult] = useState<string | null>(
    null,
  );
  const [registeringCoord, setRegisteringCoord] = useState<string | null>(null);

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
  };

  const memberContext = {
    ...context,
    lineDisplayName: session.lineDisplayName,
  };

  // Reads from TanStack Query cache (already fetched by CopperTab)
  const { data } = useLiffCopperMines(context);
  const { data: memberInfo } = useLiffMemberInfo(memberContext);
  const registerMutation = useLiffRegisterCopper(context);

  const hasSourceData = data?.has_source_data ?? false;
  const availableCounties = data?.available_counties ?? [];
  const mines = data?.mines ?? [];
  const maxAllowed = data?.max_allowed ?? 0;

  const effectiveGameId =
    selectedGameId || memberInfo?.registered_ids?.[0]?.game_id || null;

  // Count mines for selected game_id
  const myCount = effectiveGameId
    ? mines.filter((m) => m.game_id === effectiveGameId).length
    : 0;
  const canApply = maxAllowed === 0 || myCount < maxAllowed;

  // County search with debounce
  const hasCountySearch = hasSourceData && availableCounties.length > 0;
  const { data: locationResults } = useLiffCopperSearch(
    hasCountySearch ? session.lineGroupId : null,
    debouncedQuery,
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(locationQuery), 300);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  // Coordinate lookup
  const handleCoordSearch = () => {
    if (!coordX.trim() || !coordY.trim()) {
      setCoordSearchResult(null);
      return;
    }

    const x = parseInt(coordX, 10);
    const y = parseInt(coordY, 10);

    if (isNaN(x) || x < 0 || isNaN(y) || y < 0) {
      setCoordSearchResult(null);
      return;
    }

    const existingMine = mines.find(
      (mine) => mine.coord_x === x && mine.coord_y === y,
    );

    if (existingMine) {
      setCoordSearchResult(
        `已被 ${existingMine.game_id} 註冊 (Lv.${existingMine.level})`,
      );
    } else {
      setCoordSearchResult("座標可用");
    }
  };

  // Register from search result
  const handleRegister = async (result: CopperCoordinateSearchResult) => {
    if (!effectiveGameId) return;
    const coordKey = `${result.coord_x}-${result.coord_y}`;
    setRegisteringCoord(coordKey);
    try {
      await registerMutation.mutateAsync({
        gameId: effectiveGameId,
        coordX: result.coord_x,
        coordY: result.coord_y,
        level: result.level,
      });
      onBack();
    } catch {
      // Error handled by mutation
    } finally {
      setRegisteringCoord(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-medium">搜尋銅礦</h1>
          {hasSourceData && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              資料來源
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Account selector (when multiple accounts) */}
        {memberInfo?.registered_ids && memberInfo.registered_ids.length > 1 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">註冊帳號</p>
            <Select
              value={effectiveGameId || ""}
              onValueChange={setSelectedGameId}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="選擇帳號" />
              </SelectTrigger>
              <SelectContent>
                {memberInfo.registered_ids.map((acc) => (
                  <SelectItem key={acc.game_id} value={acc.game_id}>
                    {acc.game_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Quota status */}
        {maxAllowed > 0 && (
          <div
            className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${canApply ? "bg-muted/50" : "bg-destructive/10"}`}
          >
            <span
              className={
                canApply ? "text-muted-foreground" : "text-destructive"
              }
            >
              {effectiveGameId}: 已申請 {myCount} / {maxAllowed} 座
            </span>
            {!canApply && (
              <span className="text-destructive font-medium">已達上限</span>
            )}
          </div>
        )}

        {/* County search (when source data exists) */}
        {hasCountySearch && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                placeholder="搜尋郡/縣名..."
                className="h-10"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableCounties.map((county) => (
                <button
                  key={county}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    locationQuery === county
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  onClick={() => setLocationQuery(county)}
                >
                  {county}
                </button>
              ))}
            </div>

            {/* Search results */}
            {locationResults && locationResults.length > 0 && (
              <div className="border rounded-lg divide-y">
                {locationResults.map((result) => {
                  const coordKey = `${result.coord_x}-${result.coord_y}`;
                  const isRegistering =
                    registerMutation.isPending && registeringCoord === coordKey;

                  return (
                    <div
                      key={coordKey}
                      className="flex items-center justify-between py-2 px-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs tabular-nums shrink-0">
                          ({result.coord_x},{result.coord_y})
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {result.county} · {result.district}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          Lv.{result.level}
                        </span>
                      </div>
                      <div className="shrink-0 ml-2">
                        {result.is_taken ? (
                          <span className="text-xs text-muted-foreground">
                            已佔
                          </span>
                        ) : canApply && effectiveGameId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleRegister(result)}
                            disabled={registerMutation.isPending}
                          >
                            {isRegistering ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" />
                                註冊
                              </>
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {!effectiveGameId ? "未選帳號" : "已達上限"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {debouncedQuery &&
              locationResults &&
              locationResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  無搜尋結果
                </p>
              )}
          </div>
        )}

        {/* Coordinate search (always available) */}
        <div className={`space-y-2 ${hasCountySearch ? "border-t pt-3" : ""}`}>
          <p className="text-xs text-muted-foreground">依座標查詢</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-sm text-muted-foreground shrink-0">X</span>
              <Input
                value={coordX}
                onChange={(e) => {
                  setCoordX(e.target.value);
                  setCoordSearchResult(null);
                }}
                placeholder="123"
                className="h-10"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-sm text-muted-foreground shrink-0">Y</span>
              <Input
                value={coordY}
                onChange={(e) => {
                  setCoordY(e.target.value);
                  setCoordSearchResult(null);
                }}
                placeholder="456"
                className="h-10"
                inputMode="numeric"
                pattern="[0-9]*"
                onKeyDown={(e) => e.key === "Enter" && handleCoordSearch()}
              />
            </div>
            <Button
              onClick={handleCoordSearch}
              disabled={!coordX.trim() || !coordY.trim()}
              variant="outline"
              className="h-10"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {coordSearchResult && (
            <p
              className={`text-xs ${coordSearchResult === "座標可用" ? "text-green-600" : "text-amber-600"}`}
            >
              {coordSearchResult}
            </p>
          )}
        </div>

        {/* Mutation error */}
        {registerMutation.error && (
          <p className="text-xs text-destructive">
            {registerMutation.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
