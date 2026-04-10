/**
 * Tests for LIFF Battle hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  liffBattleKeys,
  useLiffEventList,
  useLiffEventReport,
} from "../use-liff-battle";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../../__tests__/test-utils";
import type {
  EventListResponse,
  EventReportResponse,
  EventSummary,
} from "../../lib/liff-api-client";

vi.mock("../../lib/liff-api-client", () => ({
  getEventList: vi.fn(),
  getEventReport: vi.fn(),
}));

import { getEventList, getEventReport } from "../../lib/liff-api-client";

const mockContext = {
  lineGroupId: "group-123",
};

const mockEventListResponse: EventListResponse = {
  season_name: "Season 1",
  events: [
    {
      event_id: "event-1",
      event_name: "Battle Alpha",
      event_type: "battle",
      event_start: "2026-01-10T08:00:00Z",
      total_members: 30,
      participated_count: 25,
      participation_rate: 0.83,
      user_participation: {
        participated: true,
        rank: 3,
        score: 5000,
        score_label: "戰功",
        violated: null,
      },
    },
  ],
  has_more: false,
  total_count: 1,
};

const mockEventSummary: EventSummary = {
  total_members: 30,
  participated_count: 25,
  absent_count: 5,
  new_member_count: 0,
  participation_rate: 0.83,
  total_merit: 50000,
  total_assist: 20000,
  total_contribution: 100000,
  avg_merit: 2000,
  avg_assist: 800,
  mvp_member_id: "member-1",
  mvp_member_name: "TopPlayer",
  mvp_merit: 5000,
  mvp_contribution: null,
  mvp_assist: null,
  mvp_combined_score: null,
  violator_count: 0,
};

const mockEventReportResponse: EventReportResponse = {
  event_id: "event-1",
  event_name: "Battle Alpha",
  event_type: "battle",
  event_start: "2026-01-10T08:00:00Z",
  event_end: "2026-01-10T10:00:00Z",
  summary: mockEventSummary,
  group_stats: [],
  top_members: [],
  top_contributors: [],
  top_assisters: [],
  violators: [],
};

// =============================================================================
// liffBattleKeys
// =============================================================================

describe("liffBattleKeys", () => {
  it("builds correct all key", () => {
    expect(liffBattleKeys.all).toEqual(["liff-battle"]);
  });

  it("builds list key with groupId, gameId and default offset", () => {
    expect(liffBattleKeys.list("group-1", "game-1")).toEqual([
      "liff-battle",
      "list",
      "group-1",
      "game-1",
      0,
    ]);
  });

  it("builds list key with explicit offset", () => {
    expect(liffBattleKeys.list("group-1", "game-1", 20)).toEqual([
      "liff-battle",
      "list",
      "group-1",
      "game-1",
      20,
    ]);
  });

  it("builds report key with groupId and eventId", () => {
    expect(liffBattleKeys.report("group-1", "event-1")).toEqual([
      "liff-battle",
      "report",
      "group-1",
      "event-1",
    ]);
  });
});

// =============================================================================
// useLiffEventList
// =============================================================================

describe("useLiffEventList", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches event list when context and gameId are provided", async () => {
    vi.mocked(getEventList).mockResolvedValueOnce(mockEventListResponse);

    const { result } = renderHook(
      () => useLiffEventList(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockEventListResponse);
    expect(getEventList).toHaveBeenCalledWith({
      lineGroupId: "group-123",
      gameId: "game-abc",
      offset: 0,
    });
  });

  it("fetches with custom offset", async () => {
    vi.mocked(getEventList).mockResolvedValueOnce(mockEventListResponse);

    const { result } = renderHook(
      () => useLiffEventList(mockContext, "game-abc", 10),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEventList).toHaveBeenCalledWith({
      lineGroupId: "group-123",
      gameId: "game-abc",
      offset: 10,
    });
  });

  it("does not fetch when context is null", () => {
    const { result } = renderHook(
      () => useLiffEventList(null, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getEventList).not.toHaveBeenCalled();
  });

  it("does not fetch when gameId is null", () => {
    const { result } = renderHook(
      () => useLiffEventList(mockContext, null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getEventList).not.toHaveBeenCalled();
  });

  it("does not fetch when both context and gameId are null", () => {
    const { result } = renderHook(
      () => useLiffEventList(null, null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getEventList).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getEventList).mockRejectedValueOnce(new Error("Unauthorized"));

    const { result } = renderHook(
      () => useLiffEventList(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("returns empty events list when season has no events", async () => {
    vi.mocked(getEventList).mockResolvedValueOnce({
      ...mockEventListResponse,
      events: [],
      total_count: 0,
    });

    const { result } = renderHook(
      () => useLiffEventList(mockContext, "game-abc"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.events).toEqual([]);
  });
});

// =============================================================================
// useLiffEventReport
// =============================================================================

describe("useLiffEventReport", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches event report when context and eventId are provided", async () => {
    vi.mocked(getEventReport).mockResolvedValueOnce(mockEventReportResponse);

    const { result } = renderHook(
      () => useLiffEventReport(mockContext, "event-1"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockEventReportResponse);
    expect(getEventReport).toHaveBeenCalledWith({
      lineGroupId: "group-123",
      eventId: "event-1",
    });
  });

  it("does not fetch when context is null", () => {
    const { result } = renderHook(
      () => useLiffEventReport(null, "event-1"),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getEventReport).not.toHaveBeenCalled();
  });

  it("does not fetch when eventId is null", () => {
    const { result } = renderHook(
      () => useLiffEventReport(mockContext, null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getEventReport).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getEventReport).mockRejectedValueOnce(new Error("Event not found"));

    const { result } = renderHook(
      () => useLiffEventReport(mockContext, "event-missing"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
