/**
 * Tests for LIFF Performance hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  liffPerformanceKeys,
  useLiffPerformance,
} from "../use-liff-performance";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../../__tests__/test-utils";
import type { MemberPerformanceResponse } from "../../lib/liff-api-client";

vi.mock("../../lib/liff-api-client", () => ({
  getMemberPerformance: vi.fn(),
}));

import { getMemberPerformance } from "../../lib/liff-api-client";

const mockContext = {
  lineUserId: "user-123",
  lineGroupId: "group-456",
};

const mockPerformanceResponse: MemberPerformanceResponse = {
  has_data: true,
  game_id: "game-abc",
  season_name: "Season 1",
  rank: {
    current: 5,
    total: 30,
    change: 2,
  },
  latest: {
    daily_contribution: 1000,
    daily_merit: 5000,
    daily_assist: 2000,
    daily_donation: 500,
    power: 100000,
  },
  alliance_avg: {
    daily_contribution: 800,
    daily_merit: 4000,
    daily_assist: 1500,
    daily_donation: 400,
    power: 90000,
  },
  alliance_median: {
    daily_contribution: 750,
    daily_merit: 3800,
    daily_assist: 1400,
    daily_donation: 380,
    power: 88000,
  },
  trend: [
    {
      period_label: "Week 1",
      date: "2026-01-07",
      daily_contribution: 900,
      daily_merit: 4500,
    },
    {
      period_label: "Week 2",
      date: "2026-01-14",
      daily_contribution: 1000,
      daily_merit: 5000,
    },
  ],
  season_total: {
    contribution: 50000,
    donation: 10000,
    power: 100000,
    power_change: 5000,
  },
};

const mockNoDataResponse: MemberPerformanceResponse = {
  has_data: false,
  game_id: null,
  season_name: null,
  rank: null,
  latest: null,
  alliance_avg: null,
  alliance_median: null,
  trend: [],
  season_total: null,
};

// =============================================================================
// liffPerformanceKeys
// =============================================================================

describe("liffPerformanceKeys", () => {
  it("builds correct all key", () => {
    expect(liffPerformanceKeys.all).toEqual(["liff-performance"]);
  });

  it("builds detail key with userId, groupId and gameId", () => {
    expect(liffPerformanceKeys.detail("user-1", "group-1", "game-1")).toEqual([
      "liff-performance",
      "detail",
      "user-1",
      "group-1",
      "game-1",
    ]);
  });
});

// =============================================================================
// useLiffPerformance
// =============================================================================

describe("useLiffPerformance", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches performance data when context and gameId are provided", async () => {
    vi.mocked(getMemberPerformance).mockResolvedValueOnce(mockPerformanceResponse);

    const { result } = renderHook(
      () => useLiffPerformance(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockPerformanceResponse);
    expect(getMemberPerformance).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
      gameId: "game-abc",
    });
  });

  it("does not fetch when context is null", () => {
    const { result } = renderHook(
      () => useLiffPerformance(null, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMemberPerformance).not.toHaveBeenCalled();
  });

  it("does not fetch when gameId is null", () => {
    const { result } = renderHook(
      () => useLiffPerformance(mockContext, null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMemberPerformance).not.toHaveBeenCalled();
  });

  it("does not fetch when both context and gameId are null", () => {
    const { result } = renderHook(
      () => useLiffPerformance(null, null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMemberPerformance).not.toHaveBeenCalled();
  });

  it("returns has_data false when member is not registered", async () => {
    vi.mocked(getMemberPerformance).mockResolvedValueOnce(mockNoDataResponse);

    const { result } = renderHook(
      () => useLiffPerformance(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.has_data).toBe(false);
    expect(result.current.data?.rank).toBeNull();
    expect(result.current.data?.latest).toBeNull();
    expect(result.current.data?.trend).toHaveLength(0);
  });

  it("returns full performance metrics including trend and totals", async () => {
    vi.mocked(getMemberPerformance).mockResolvedValueOnce(mockPerformanceResponse);

    const { result } = renderHook(
      () => useLiffPerformance(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.trend).toHaveLength(2);
    expect(result.current.data?.season_total?.contribution).toBe(50000);
    expect(result.current.data?.rank?.current).toBe(5);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getMemberPerformance).mockRejectedValueOnce(new Error("Unauthorized"));

    const { result } = renderHook(
      () => useLiffPerformance(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("uses correct query key that separates different users and games", () => {
    const keyA = liffPerformanceKeys.detail("user-1", "group-1", "game-1");
    const keyB = liffPerformanceKeys.detail("user-2", "group-1", "game-1");
    const keyC = liffPerformanceKeys.detail("user-1", "group-1", "game-2");

    expect(keyA).not.toEqual(keyB);
    expect(keyA).not.toEqual(keyC);
    expect(keyB).not.toEqual(keyC);
  });
});
