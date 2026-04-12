import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecalculateSeasonPeriods } from "../use-periods";
import { analyticsKeys, csvUploadKeys, periodKeys } from "@/lib/query-keys";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type { QueryClient } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    recalculateSeasonPeriods: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const SEASON_ID = "season-123";

describe("periodKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(periodKeys.all).toEqual(["periods"]);
    expect(periodKeys.lists()).toEqual(["periods", "list"]);
    expect(periodKeys.list("s1")).toEqual(["periods", "list", { seasonId: "s1" }]);
    expect(periodKeys.details()).toEqual(["periods", "detail"]);
    expect(periodKeys.detail("p1")).toEqual(["periods", "detail", "p1"]);
    expect(periodKeys.metrics("p1")).toEqual(["periods", "metrics", "p1"]);
  });
});

describe("useRecalculateSeasonPeriods", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls recalculateSeasonPeriods with the season id", async () => {
    vi.mocked(apiClient.recalculateSeasonPeriods).mockResolvedValueOnce({
      success: true,
      season_id: SEASON_ID,
      season_name: "Season 1",
      periods_created: 3,
    });

    const { result } = renderHook(
      () => useRecalculateSeasonPeriods(SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.recalculateSeasonPeriods).toHaveBeenCalledWith(SEASON_ID);
  });

  it("invalidates period + csv-upload + analytics caches on settled", async () => {
    vi.mocked(apiClient.recalculateSeasonPeriods).mockResolvedValueOnce({
      success: true,
      season_id: SEASON_ID,
      season_name: "Season 1",
      periods_created: 1,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useRecalculateSeasonPeriods(SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: periodKeys.list(SEASON_ID),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: csvUploadKeys.list(SEASON_ID),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: analyticsKeys.all,
    });
  });

  it("handles mutation failure gracefully", async () => {
    vi.mocked(apiClient.recalculateSeasonPeriods).mockRejectedValueOnce(
      new Error("Server error")
    );

    const { result } = renderHook(
      () => useRecalculateSeasonPeriods(SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Server error");
  });
});
