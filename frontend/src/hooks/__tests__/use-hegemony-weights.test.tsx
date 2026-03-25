import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hegemonyWeightKeys,
  useHegemonyWeights,
  useHegemonyWeightsSummary,
  useHegemonyScoresPreview,
  useInitializeHegemonyWeights,
  useUpdateHegemonyWeight,
  useCreateHegemonyWeight,
} from "../use-hegemony-weights";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type {
  HegemonyWeightWithSnapshot,
  SnapshotWeightsSummary,
  HegemonyScorePreview,
} from "@/types/hegemony-weight";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getHegemonyWeights: vi.fn(),
    getHegemonyWeightsSummary: vi.fn(),
    previewHegemonyScores: vi.fn(),
    initializeHegemonyWeights: vi.fn(),
    createHegemonyWeight: vi.fn(),
    updateHegemonyWeight: vi.fn(),
    deleteHegemonyWeight: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const mockWeight: HegemonyWeightWithSnapshot = {
  id: "weight-1",
  alliance_id: "alliance-1",
  season_id: "season-1",
  csv_upload_id: "upload-1",
  weight_contribution: 0.3,
  weight_merit: 0.3,
  weight_assist: 0.2,
  weight_donation: 0.1,
  snapshot_weight: 1.0,
  snapshot_date: "2026-01-01",
  snapshot_filename: "stats_2026-01-01.csv",
  total_members: 30,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockSummary: SnapshotWeightsSummary = {
  season_id: "season-1",
  season_name: "Season One",
  total_snapshots: 1,
  total_weight_sum: 1.0,
  is_valid: true,
  weights: [mockWeight],
};

const mockPreview: HegemonyScorePreview = {
  member_id: "member-1",
  member_name: "Player One",
  final_score: 1500,
  rank: 1,
  snapshot_scores: { "upload-1": 1500 },
};

// =============================================================================
// hegemonyWeightKeys
// =============================================================================

describe("hegemonyWeightKeys", () => {
  it("builds correct all key", () => {
    expect(hegemonyWeightKeys.all).toEqual(["hegemony-weights"]);
  });

  it("builds list key with seasonId", () => {
    expect(hegemonyWeightKeys.list("season-1")).toEqual([
      "hegemony-weights",
      "list",
      "season-1",
    ]);
  });

  it("builds summary key with seasonId", () => {
    expect(hegemonyWeightKeys.summary("season-1")).toEqual([
      "hegemony-weights",
      "summary",
      "season-1",
    ]);
  });

  it("builds preview key with seasonId and limit", () => {
    expect(hegemonyWeightKeys.preview("season-1", 10)).toEqual([
      "hegemony-weights",
      "preview",
      "season-1",
      10,
    ]);
  });

  it("builds previews key", () => {
    expect(hegemonyWeightKeys.previews()).toEqual(["hegemony-weights", "preview"]);
  });
});

// =============================================================================
// useHegemonyWeights
// =============================================================================

describe("useHegemonyWeights", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches hegemony weights for a season", async () => {
    vi.mocked(apiClient.getHegemonyWeights).mockResolvedValueOnce([mockWeight]);

    const { result } = renderHook(() => useHegemonyWeights("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockWeight]);
    expect(apiClient.getHegemonyWeights).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is null", () => {
    const { result } = renderHook(() => useHegemonyWeights(null), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getHegemonyWeights).not.toHaveBeenCalled();
  });

  it("returns empty array when no weights configured", async () => {
    vi.mocked(apiClient.getHegemonyWeights).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useHegemonyWeights("season-new"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.getHegemonyWeights).mockRejectedValueOnce(
      new Error("Season not found")
    );

    const { result } = renderHook(() => useHegemonyWeights("season-missing"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useHegemonyWeightsSummary
// =============================================================================

describe("useHegemonyWeightsSummary", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches weights summary for a season", async () => {
    vi.mocked(apiClient.getHegemonyWeightsSummary).mockResolvedValueOnce(
      mockSummary
    );

    const { result } = renderHook(() => useHegemonyWeightsSummary("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSummary);
    expect(apiClient.getHegemonyWeightsSummary).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is null", () => {
    const { result } = renderHook(() => useHegemonyWeightsSummary(null), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getHegemonyWeightsSummary).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.getHegemonyWeightsSummary).mockRejectedValueOnce(
      new Error("Unauthorized")
    );

    const { result } = renderHook(() => useHegemonyWeightsSummary("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useHegemonyScoresPreview
// =============================================================================

describe("useHegemonyScoresPreview", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches score preview with default limit 10", async () => {
    vi.mocked(apiClient.previewHegemonyScores).mockResolvedValueOnce([
      mockPreview,
    ]);

    const { result } = renderHook(
      () => useHegemonyScoresPreview("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockPreview]);
    expect(apiClient.previewHegemonyScores).toHaveBeenCalledWith("season-1", 10);
  });

  it("passes custom limit to api", async () => {
    vi.mocked(apiClient.previewHegemonyScores).mockResolvedValueOnce([
      mockPreview,
    ]);

    const { result } = renderHook(
      () => useHegemonyScoresPreview("season-1", 5),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.previewHegemonyScores).toHaveBeenCalledWith("season-1", 5);
  });

  it("does not fetch when seasonId is null", () => {
    const { result } = renderHook(
      () => useHegemonyScoresPreview(null),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.previewHegemonyScores).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useInitializeHegemonyWeights
// =============================================================================

describe("useInitializeHegemonyWeights", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls initializeHegemonyWeights and invalidates related queries", async () => {
    vi.mocked(apiClient.initializeHegemonyWeights).mockResolvedValueOnce([
      mockWeight,
    ]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useInitializeHegemonyWeights(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.initializeHegemonyWeights).toHaveBeenCalledWith("season-1");

    // Verifies list, summary, and previews are all invalidated
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.list("season-1") })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.summary("season-1") })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.previews() })
    );
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.initializeHegemonyWeights).mockRejectedValueOnce(
      new Error("Already initialized")
    );

    const { result } = renderHook(() => useInitializeHegemonyWeights(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useCreateHegemonyWeight
// =============================================================================

describe("useCreateHegemonyWeight", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls createHegemonyWeight and invalidates related queries", async () => {
    vi.mocked(apiClient.createHegemonyWeight).mockResolvedValueOnce(mockWeight);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateHegemonyWeight(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        seasonId: "season-1",
        data: {
          csv_upload_id: "upload-1",
          weight_contribution: 0.3,
          weight_merit: 0.3,
          weight_assist: 0.2,
          weight_donation: 0.1,
          snapshot_weight: 1.0,
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.list("season-1") })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.previews() })
    );
  });
});

// =============================================================================
// useUpdateHegemonyWeight
// =============================================================================

describe("useUpdateHegemonyWeight", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("optimistically updates weight in cache", async () => {
    queryClient.setQueryData(hegemonyWeightKeys.list("season-1"), [mockWeight]);

    vi.mocked(apiClient.updateHegemonyWeight).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ ...mockWeight, weight_merit: 0.5 }),
            50
          )
        )
    );

    const { result } = renderHook(() => useUpdateHegemonyWeight(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        weightId: "weight-1",
        seasonId: "season-1",
        data: { weight_merit: 0.5 },
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<HegemonyWeightWithSnapshot[]>(
        hegemonyWeightKeys.list("season-1")
      );
      expect(cached?.[0].weight_merit).toBe(0.5);
    });
  });

  it("rolls back optimistic update on error", async () => {
    queryClient.setQueryData(hegemonyWeightKeys.list("season-1"), [mockWeight]);

    vi.mocked(apiClient.updateHegemonyWeight).mockRejectedValueOnce(
      new Error("Validation failed")
    );

    const { result } = renderHook(() => useUpdateHegemonyWeight(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        weightId: "weight-1",
        seasonId: "season-1",
        data: { weight_merit: 99 },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<HegemonyWeightWithSnapshot[]>(
      hegemonyWeightKeys.list("season-1")
    );
    expect(cached?.[0].weight_merit).toBe(0.3);
  });

  it("invalidates list, summary, and previews on settled", async () => {
    vi.mocked(apiClient.updateHegemonyWeight).mockResolvedValueOnce(mockWeight);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateHegemonyWeight(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        weightId: "weight-1",
        seasonId: "season-1",
        data: { weight_merit: 0.4 },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.list("season-1") })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: hegemonyWeightKeys.summary("season-1"),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: hegemonyWeightKeys.previews() })
    );
  });
});
