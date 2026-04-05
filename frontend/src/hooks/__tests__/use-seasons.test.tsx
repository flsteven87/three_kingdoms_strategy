import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  seasonKeys,
  useSeasons,
  useCurrentSeason,
  useSeason,
  useCreateSeason,
  useDeleteSeason,
  useActivateSeason,
  useUpdateSeason,
} from "../use-seasons";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type { Season, SeasonActivateResponse } from "@/types/season";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getSeasons: vi.fn(),
    getCurrentSeason: vi.fn(),
    getSeason: vi.fn(),
    createSeason: vi.fn(),
    updateSeason: vi.fn(),
    deleteSeason: vi.fn(),
    activateSeason: vi.fn(),
    setCurrentSeason: vi.fn(),
    completeSeason: vi.fn(),
    reopenSeason: vi.fn(),
  },
}));

// Suppress toast side effects in tests
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { apiClient } from "@/lib/api-client";

const mockSeason: Season = {
  id: "season-1",
  alliance_id: "alliance-1",
  name: "Season One",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
  is_current: true,
  activation_status: "activated",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_trial: false,
  activated_at: "2026-01-01T00:00:00Z",
  game_season_tag: null,
};

const mockSeasonDraft: Season = {
  ...mockSeason,
  id: "season-2",
  name: "Season Draft",
  is_current: false,
  activation_status: "draft",
  activated_at: null,
};

// =============================================================================
// seasonKeys
// =============================================================================

describe("seasonKeys", () => {
  it("builds correct all key", () => {
    expect(seasonKeys.all).toEqual(["seasons"]);
  });

  it("builds lists key", () => {
    expect(seasonKeys.lists()).toEqual(["seasons", "list"]);
  });

  it("builds list key with activatedOnly flag", () => {
    expect(seasonKeys.list(false)).toEqual(["seasons", "list", { activatedOnly: false }]);
    expect(seasonKeys.list(true)).toEqual(["seasons", "list", { activatedOnly: true }]);
  });

  it("builds current key", () => {
    expect(seasonKeys.current()).toEqual(["seasons", "current"]);
  });

  it("builds detail key with id", () => {
    expect(seasonKeys.detail("season-1")).toEqual(["seasons", "detail", "season-1"]);
  });

  it("builds details key", () => {
    expect(seasonKeys.details()).toEqual(["seasons", "detail"]);
  });
});

// =============================================================================
// useSeasons
// =============================================================================

describe("useSeasons", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches all seasons successfully", async () => {
    vi.mocked(apiClient.getSeasons).mockResolvedValueOnce([mockSeason]);

    const { result } = renderHook(() => useSeasons(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockSeason]);
    expect(apiClient.getSeasons).toHaveBeenCalledWith(false);
  });

  it("passes activatedOnly flag to api", async () => {
    vi.mocked(apiClient.getSeasons).mockResolvedValueOnce([mockSeason]);

    const { result } = renderHook(() => useSeasons(true), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getSeasons).toHaveBeenCalledWith(true);
  });

  it("returns empty array when no seasons exist", async () => {
    vi.mocked(apiClient.getSeasons).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useSeasons(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.getSeasons).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSeasons(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// =============================================================================
// useCurrentSeason
// =============================================================================

describe("useCurrentSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches current season", async () => {
    vi.mocked(apiClient.getCurrentSeason).mockResolvedValueOnce(mockSeason);

    const { result } = renderHook(() => useCurrentSeason(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSeason);
  });

  it("returns null when no current season is set", async () => {
    vi.mocked(apiClient.getCurrentSeason).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useCurrentSeason(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

// =============================================================================
// useSeason
// =============================================================================

describe("useSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches season by id", async () => {
    vi.mocked(apiClient.getSeason).mockResolvedValueOnce(mockSeason);

    const { result } = renderHook(() => useSeason("season-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSeason);
    expect(apiClient.getSeason).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is empty string", () => {
    const { result } = renderHook(() => useSeason(""), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getSeason).not.toHaveBeenCalled();
  });

  it("enters error state when api fails", async () => {
    vi.mocked(apiClient.getSeason).mockRejectedValueOnce(new Error("Not found"));

    const { result } = renderHook(() => useSeason("season-missing"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useCreateSeason
// =============================================================================

describe("useCreateSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls createSeason and invalidates seasons list on success", async () => {
    vi.mocked(apiClient.createSeason).mockResolvedValueOnce(mockSeasonDraft);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        alliance_id: "alliance-1",
        name: "New Season",
        start_date: "2026-07-01",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.createSeason).toHaveBeenCalledTimes(1);

    // onSettled invalidates seasonKeys.all
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: seasonKeys.all })
    );
  });

  it("enters error state when api fails", async () => {
    vi.mocked(apiClient.createSeason).mockRejectedValueOnce(new Error("Quota exceeded"));

    const { result } = renderHook(() => useCreateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        alliance_id: "alliance-1",
        name: "Fail Season",
        start_date: "2026-07-01",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useUpdateSeason
// =============================================================================

describe("useUpdateSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("optimistically updates season in list", async () => {
    queryClient.setQueryData(seasonKeys.list(false), [mockSeason]);

    vi.mocked(apiClient.updateSeason).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ ...mockSeason, name: "Updated Season" }),
            50
          )
        )
    );

    const { result } = renderHook(() => useUpdateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ seasonId: "season-1", data: { name: "Updated Season" } });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Season[]>(seasonKeys.list(false));
      expect(cached?.[0].name).toBe("Updated Season");
    });
  });

  it("rolls back optimistic update on error", async () => {
    queryClient.setQueryData(seasonKeys.list(false), [mockSeason]);

    vi.mocked(apiClient.updateSeason).mockRejectedValueOnce(new Error("Server error"));

    const { result } = renderHook(() => useUpdateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ seasonId: "season-1", data: { name: "Will Fail" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<Season[]>(seasonKeys.list(false));
    expect(cached?.[0].name).toBe("Season One");
  });
});

// =============================================================================
// useDeleteSeason
// =============================================================================

describe("useDeleteSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("optimistically removes season from list", async () => {
    queryClient.setQueryData(seasonKeys.list(false), [mockSeason, mockSeasonDraft]);

    vi.mocked(apiClient.deleteSeason).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50))
    );

    const { result } = renderHook(() => useDeleteSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-2");
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Season[]>(seasonKeys.list(false));
      expect(cached?.some((s) => s.id === "season-2")).toBe(false);
    });
  });

  it("rolls back optimistic delete on error", async () => {
    queryClient.setQueryData(seasonKeys.list(false), [mockSeason, mockSeasonDraft]);

    vi.mocked(apiClient.deleteSeason).mockRejectedValueOnce(new Error("Delete failed"));

    const { result } = renderHook(() => useDeleteSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-2");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<Season[]>(seasonKeys.list(false));
    expect(cached?.length).toBe(2);
  });

  it("invalidates all season queries on settled", async () => {
    vi.mocked(apiClient.deleteSeason).mockResolvedValueOnce(undefined);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: seasonKeys.all })
    );
  });
});

// =============================================================================
// useActivateSeason
// =============================================================================

describe("useActivateSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("optimistically changes activation_status to activated", async () => {
    queryClient.setQueryData(seasonKeys.list(false), [mockSeasonDraft]);

    const activateResponse: SeasonActivateResponse = {
      success: true,
      season: { ...mockSeasonDraft, activation_status: "activated" },
      remaining_seasons: 4,
      used_trial: false,
      trial_ends_at: null,
    };

    vi.mocked(apiClient.activateSeason).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(activateResponse), 50))
    );

    const { result } = renderHook(() => useActivateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-2");
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Season[]>(seasonKeys.list(false));
      expect(cached?.[0].activation_status).toBe("activated");
    });
  });

  it("rolls back on activation error", async () => {
    queryClient.setQueryData(seasonKeys.list(false), [mockSeasonDraft]);

    vi.mocked(apiClient.activateSeason).mockRejectedValueOnce(new Error("No quota"));

    const { result } = renderHook(() => useActivateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("season-2");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<Season[]>(seasonKeys.list(false));
    expect(cached?.[0].activation_status).toBe("draft");
  });
});
