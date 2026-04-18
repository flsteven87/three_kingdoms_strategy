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
import { GAME_SEASON_TAGS } from "@/constants/game-seasons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useLiffCopperCoordinateLookup,
  useLiffCopperMines,
  useLiffCopperSearch,
  useLiffRegisterCopper,
} from "../hooks/use-liff-copper";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type {
  CopperCoordinateLookupResult,
  CopperCoordinateSearchResult,
} from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSessionWithGroup;
  readonly gameId: string;
  readonly onBack: () => void;
}

export function CopperSearchPage({ session, gameId, onBack }: Props) {
  const [locationQuery, setLocationQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [debouncedCoords, setDebouncedCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [manualLookupLevel, setManualLookupLevel] = useState("9");
  const [registeringCoord, setRegisteringCoord] = useState<string | null>(null);

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
    lineIdToken: session.lineIdToken ?? "",
  };

  // Reads from TanStack Query cache (already fetched by CopperTab)
  const { data } = useLiffCopperMines(context);
  const coordLookup = useLiffCopperCoordinateLookup(
    session.lineGroupId,
    debouncedCoords?.x ?? null,
    debouncedCoords?.y ?? null,
  );
  const registerMutation = useLiffRegisterCopper(context);

  const hasSourceData = data?.has_source_data ?? false;
  const sourceDataLabel = data?.current_game_season_tag
    ? (GAME_SEASON_TAGS.find((tag) => tag.value === data.current_game_season_tag)?.label ??
      data.current_game_season_tag)
    : "資料來源";
  const availableCounties = data?.available_counties ?? [];
  const mines = data?.mines ?? [];
  const maxAllowed = data?.max_allowed ?? 0;

  // Count mines for selected game_id
  const myCount = mines.filter((m) => m.game_id === gameId).length;
  const canApply = maxAllowed === 0 || myCount < maxAllowed;

  // County search with debounce
  const hasCountySearch = hasSourceData && availableCounties.length > 0;
  const { data: locationResults } = useLiffCopperSearch(
    hasCountySearch ? session.lineGroupId : null,
    debouncedQuery,
  );
  const coordLookupResult = coordLookup.data;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(locationQuery), 300);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  // Debounce coordinate input → trigger lookup query
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

  // Register from search result
  const handleRegister = async (result: CopperCoordinateSearchResult) => {
    const coordKey = `${result.coord_x}-${result.coord_y}`;
    setRegisteringCoord(coordKey);
    try {
      await registerMutation.mutateAsync({
        gameId,
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

  const handleRegisterLookup = async (result: CopperCoordinateLookupResult) => {
    if (!result.can_register) return;

    const coordKey = `${result.coord_x}-${result.coord_y}`;
    const level = result.level ?? parseInt(manualLookupLevel, 10);
    setRegisteringCoord(coordKey);
    try {
      await registerMutation.mutateAsync({
        gameId,
        coordX: result.coord_x,
        coordY: result.coord_y,
        level,
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
              {sourceDataLabel}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
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
              {gameId}: 已申請 {myCount} / {maxAllowed} 座
            </span>
            {!canApply && (
              <span className="text-destructive font-medium">已達上限</span>
            )}
          </div>
        )}

        {/* Coordinate search (always available) */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">依座標查詢</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-sm text-muted-foreground shrink-0">X</span>
              <Input
                value={coordX}
                onChange={(e) => setCoordX(e.target.value)}
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
                onChange={(e) => setCoordY(e.target.value)}
                placeholder="456"
                className="h-10"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
            <div className="flex h-10 w-10 items-center justify-center shrink-0">
              {coordLookup.isFetching ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Search className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
          {coordLookupResult && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2 text-xs">
                  <span className="font-medium tabular-nums">
                    ({coordLookupResult.coord_x},{coordLookupResult.coord_y})
                  </span>
                  {coordLookupResult.county && (
                    <span className="truncate text-muted-foreground">
                      {coordLookupResult.county}
                      {coordLookupResult.district
                        ? ` · ${coordLookupResult.district}`
                        : ""}
                    </span>
                  )}
                  {coordLookupResult.level != null ? (
                    <span className="shrink-0 text-muted-foreground">
                      Lv.{coordLookupResult.level}
                    </span>
                  ) : coordLookupResult.requires_manual_level ? (
                    <Select
                      value={manualLookupLevel}
                      onValueChange={setManualLookupLevel}
                    >
                      <SelectTrigger className="h-8 w-20 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 級</SelectItem>
                        <SelectItem value="9">9 級</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <div className="shrink-0">
                  {coordLookupResult.is_taken ? (
                    <span className="text-xs text-muted-foreground">已佔</span>
                  ) : coordLookupResult.can_register ? (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleRegisterLookup(coordLookupResult)}
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending &&
                      registeringCoord ===
                        `${coordLookupResult.coord_x}-${coordLookupResult.coord_y}` ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          註冊
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">不可註冊</span>
                  )}
                </div>
              </div>
              {coordLookupResult.message && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {coordLookupResult.message}
                </p>
              )}
            </div>
          )}
          {coordLookup.error && (
            <p className="text-xs text-destructive">
              {coordLookup.error.message}
            </p>
          )}
        </div>

        {/* County search (when source data exists) */}
        {hasCountySearch && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">選擇郡/縣名</p>
            <div className="flex items-center gap-2">
              <Select
                value={locationQuery || ""}
                onValueChange={setLocationQuery}
              >
                <SelectTrigger className="h-10 flex-1">
                  <SelectValue placeholder="選擇郡/縣名" />
                </SelectTrigger>
                <SelectContent>
                  {availableCounties.map((county) => (
                    <SelectItem key={county} value={county}>
                      {county}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 shrink-0 px-3 text-xs"
                onClick={() => setLocationQuery("")}
                disabled={!locationQuery}
              >
                清除
              </Button>
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
                        ) : canApply ? (
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
                          <span className="text-xs text-muted-foreground">已達上限</span>
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
