import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  eventKeys,
  useEvents,
  useEvent,
  useEventAnalytics,
  useBatchEventAnalytics,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from "../use-events";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type {
  BattleEvent,
  EventAnalyticsResponse,
  BatchAnalyticsResponse,
} from "@/types/event";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getEvents: vi.fn(),
    getEvent: vi.fn(),
    getEventAnalytics: vi.fn(),
    getBatchEventAnalytics: vi.fn(),
    getEventGroupAnalytics: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    uploadEventCsv: vi.fn(),
    processEvent: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const mockEvent: BattleEvent = {
  id: "event-1",
  alliance_id: "alliance-1",
  season_id: "season-1",
  name: "Siege Battle",
  event_type: "siege",
  description: null,
  before_upload_id: "upload-before",
  after_upload_id: "upload-after",
  event_start: "2026-01-10T08:00:00Z",
  event_end: "2026-01-10T10:00:00Z",
  status: "completed",
  created_at: "2026-01-10T00:00:00Z",
};

const mockEventAnalytics: EventAnalyticsResponse = {
  event: mockEvent,
  summary: {
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
    avg_contribution: 4000,
    mvp_member_id: "member-1",
    mvp_member_name: "TopPlayer",
    mvp_merit: 5000,
    contribution_mvp_member_id: null,
    contribution_mvp_name: null,
    contribution_mvp_score: null,
    assist_mvp_member_id: null,
    assist_mvp_name: null,
    assist_mvp_score: null,
    mvp_contribution: null,
    mvp_assist: null,
    mvp_combined_score: null,
    violator_count: 0,
  },
  metrics: [],
  merit_distribution: [],
};

// =============================================================================
// eventKeys
// =============================================================================

describe("eventKeys", () => {
  it("builds correct all key", () => {
    expect(eventKeys.all).toEqual(["events"]);
  });

  it("builds list key with seasonId", () => {
    expect(eventKeys.list("season-1")).toEqual([
      "events",
      "list",
      { seasonId: "season-1" },
    ]);
  });

  it("builds detail key with eventId", () => {
    expect(eventKeys.detail("event-1")).toEqual(["events", "detail", "event-1"]);
  });

  it("builds eventAnalytics key", () => {
    expect(eventKeys.eventAnalytics("event-1")).toEqual([
      "events",
      "analytics",
      "event-1",
    ]);
  });

  it("builds batchAnalytics key with sorted ids", () => {
    // IDs should be sorted so order doesn't matter
    const key1 = eventKeys.batchAnalytics(["event-2", "event-1"]);
    const key2 = eventKeys.batchAnalytics(["event-1", "event-2"]);
    expect(key1).toEqual(key2);
  });

  it("builds groupAnalytics key", () => {
    expect(eventKeys.groupAnalytics("event-1")).toEqual([
      "events",
      "group-analytics",
      "event-1",
    ]);
  });
});

// =============================================================================
// useEvents
// =============================================================================

describe("useEvents", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches events list for a season", async () => {
    vi.mocked(apiClient.getEvents).mockResolvedValueOnce([mockEventAnalytics]);

    const { result } = renderHook(() => useEvents("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockEventAnalytics]);
    expect(apiClient.getEvents).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(() => useEvents(undefined), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getEvents).not.toHaveBeenCalled();
  });

  it("returns empty array when season has no events", async () => {
    vi.mocked(apiClient.getEvents).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useEvents("season-empty"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.getEvents).mockRejectedValueOnce(new Error("Forbidden"));

    const { result } = renderHook(() => useEvents("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useEvent
// =============================================================================

describe("useEvent", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches event by id", async () => {
    vi.mocked(apiClient.getEvent).mockResolvedValueOnce(mockEvent);

    const { result } = renderHook(() => useEvent("event-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockEvent);
    expect(apiClient.getEvent).toHaveBeenCalledWith("event-1");
  });

  it("does not fetch when eventId is undefined", () => {
    const { result } = renderHook(() => useEvent(undefined), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getEvent).not.toHaveBeenCalled();
  });

  it("enters error state when event not found", async () => {
    vi.mocked(apiClient.getEvent).mockRejectedValueOnce(new Error("Not found"));

    const { result } = renderHook(() => useEvent("event-missing"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useEventAnalytics
// =============================================================================

describe("useEventAnalytics", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches event analytics by eventId", async () => {
    vi.mocked(apiClient.getEventAnalytics).mockResolvedValueOnce(
      mockEventAnalytics
    );

    const { result } = renderHook(() => useEventAnalytics("event-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockEventAnalytics);
    expect(apiClient.getEventAnalytics).toHaveBeenCalledWith("event-1");
  });

  it("does not fetch when eventId is undefined", () => {
    const { result } = renderHook(() => useEventAnalytics(undefined), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getEventAnalytics).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.getEventAnalytics).mockRejectedValueOnce(
      new Error("Processing not complete")
    );

    const { result } = renderHook(() => useEventAnalytics("event-draft"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useBatchEventAnalytics
// =============================================================================

describe("useBatchEventAnalytics", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches analytics for multiple events", async () => {
    const batchResponse: BatchAnalyticsResponse = {
      analytics: { "event-1": mockEventAnalytics },
    };
    vi.mocked(apiClient.getBatchEventAnalytics).mockResolvedValueOnce(
      batchResponse
    );

    const { result } = renderHook(
      () => useBatchEventAnalytics(["event-1"]),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(batchResponse);
    expect(apiClient.getBatchEventAnalytics).toHaveBeenCalledWith(["event-1"]);
  });

  it("does not fetch when eventIds is empty", () => {
    const { result } = renderHook(
      () => useBatchEventAnalytics([]),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getBatchEventAnalytics).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useCreateEvent
// =============================================================================

describe("useCreateEvent", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls createEvent and invalidates event list on success", async () => {
    vi.mocked(apiClient.createEvent).mockResolvedValueOnce(mockEvent);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateEvent("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        name: "New Event",
        event_type: "battle",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.createEvent).toHaveBeenCalledWith("season-1", {
      name: "New Event",
      event_type: "battle",
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: eventKeys.list("season-1") })
    );
  });

  it("does not invalidate list when seasonId is undefined", async () => {
    vi.mocked(apiClient.createEvent).mockResolvedValueOnce(mockEvent);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateEvent(undefined), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ name: "Orphan Event", event_type: "siege" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.createEvent).mockRejectedValueOnce(
      new Error("Invalid event type")
    );

    const { result } = renderHook(() => useCreateEvent("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ name: "Bad Event", event_type: "siege" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useDeleteEvent
// =============================================================================

describe("useDeleteEvent", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls deleteEvent and invalidates event list on settled", async () => {
    vi.mocked(apiClient.deleteEvent).mockResolvedValueOnce(undefined);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteEvent("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("event-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.deleteEvent).toHaveBeenCalledWith("event-1");
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: eventKeys.list("season-1") })
    );
  });

  it("rolls back optimistic delete snapshot on error", async () => {
    const previousEvents = [mockEventAnalytics];
    queryClient.setQueryData(eventKeys.list("season-1"), previousEvents);

    vi.mocked(apiClient.deleteEvent).mockRejectedValueOnce(
      new Error("Cannot delete completed event")
    );

    const { result } = renderHook(() => useDeleteEvent("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("event-1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Cache snapshot should be restored after rollback
    const cached = queryClient.getQueryData(eventKeys.list("season-1"));
    expect(cached).toEqual(previousEvents);
  });

  it("does not invalidate list when seasonId is undefined", async () => {
    vi.mocked(apiClient.deleteEvent).mockResolvedValueOnce(undefined);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteEvent(undefined), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("event-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useUpdateEvent
// =============================================================================

describe("useUpdateEvent", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls updateEvent and invalidates event detail and list on settled", async () => {
    const updatedEvent: BattleEvent = { ...mockEvent, name: "Renamed Battle" };
    vi.mocked(apiClient.updateEvent).mockResolvedValueOnce(updatedEvent);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateEvent("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ eventId: "event-1", data: { name: "Renamed Battle" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.updateEvent).toHaveBeenCalledWith("event-1", {
      name: "Renamed Battle",
    });
    // onSuccess invalidates detail and analytics
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: eventKeys.detail("event-1") })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: eventKeys.eventAnalytics("event-1") })
    );
    // onSettled invalidates list
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: eventKeys.list("season-1") })
    );
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.updateEvent).mockRejectedValueOnce(
      new Error("Event locked")
    );

    const { result } = renderHook(() => useUpdateEvent("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ eventId: "event-1", data: { name: "Fail" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
