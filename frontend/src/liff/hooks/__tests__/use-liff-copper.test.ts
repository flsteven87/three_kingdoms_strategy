/**
 * Tests for LIFF Copper Mine hooks
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  liffCopperKeys,
  useLiffCopperMines,
  useLiffCopperRules,
  useLiffRegisterCopper,
  useLiffDeleteCopper,
  useLiffCopperSearch,
  useLiffCopperCoordinateLookup,
} from "../use-liff-copper";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../../__tests__/test-utils";
import type {
  CopperMine,
  CopperMineListResponse,
  CopperMineRule,
  CopperCoordinateSearchResult,
  CopperCoordinateLookupResult,
  RegisterCopperResponse,
} from "../../lib/liff-api-client";

vi.mock("../../lib/liff-api-client", () => ({
  getCopperMines: vi.fn(),
  getCopperRules: vi.fn(),
  registerCopperMine: vi.fn(),
  deleteCopperMine: vi.fn(),
  searchCopperCoordinates: vi.fn(),
  lookupCopperCoordinate: vi.fn(),
}));

import {
  getCopperMines,
  getCopperRules,
  registerCopperMine,
  deleteCopperMine,
  searchCopperCoordinates,
  lookupCopperCoordinate,
} from "../../lib/liff-api-client";

const mockContext = {
  lineUserId: "user-123",
  lineGroupId: "group-456",
};

const mockMine: CopperMine = {
  id: "mine-1",
  game_id: "game-abc",
  coord_x: 10,
  coord_y: 20,
  level: 9,
  status: "active",
  notes: null,
  registered_at: "2026-01-01T00:00:00Z",
};

const mockMineListResponse: CopperMineListResponse = {
  mines: [mockMine],
  total: 1,
  mine_counts_by_game_id: { "game-abc": 1 },
  max_allowed: 3,
  has_source_data: true,
  current_game_season_tag: "S1",
  available_counties: ["縣A", "縣B"],
};

const mockEmptyMineListResponse: CopperMineListResponse = {
  mines: [],
  total: 0,
  mine_counts_by_game_id: {},
  max_allowed: 3,
  has_source_data: false,
  current_game_season_tag: null,
  available_counties: [],
};

const mockCopperRules: CopperMineRule[] = [
  { tier: 1, required_merit: 0, allowed_level: "nine" },
  { tier: 2, required_merit: 10000, allowed_level: "ten" },
  { tier: 3, required_merit: 50000, allowed_level: "both" },
];

// =============================================================================
// liffCopperKeys
// =============================================================================

describe("liffCopperKeys", () => {
  it("builds correct all key", () => {
    expect(liffCopperKeys.all).toEqual(["liff-copper"]);
  });

  it("builds list key with userId and groupId", () => {
    expect(liffCopperKeys.list("user-1", "group-1")).toEqual([
      "liff-copper",
      "list",
      "user-1",
      "group-1",
    ]);
  });

  it("builds rules key with groupId", () => {
    expect(liffCopperKeys.rules("group-1")).toEqual([
      "liff-copper",
      "rules",
      "group-1",
    ]);
  });

  it("builds lookup key with groupId and coordinates", () => {
    expect(liffCopperKeys.lookup("group-1", 10, 20)).toEqual([
      "liff-copper",
      "lookup",
      "group-1",
      10,
      20,
    ]);
  });

  it("builds search key with groupId and query", () => {
    expect(liffCopperKeys.search("group-1", "縣A")).toEqual([
      "liff-copper",
      "search",
      "group-1",
      "縣A",
    ]);
  });
});

// =============================================================================
// useLiffCopperMines
// =============================================================================

describe("useLiffCopperMines", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches copper mines when context is provided", async () => {
    vi.mocked(getCopperMines).mockResolvedValueOnce(mockMineListResponse);

    const { result } = renderHook(
      () => useLiffCopperMines(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockMineListResponse);
    expect(getCopperMines).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
    });
  });

  it("does not fetch when context is null", () => {
    const { result } = renderHook(
      () => useLiffCopperMines(null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getCopperMines).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getCopperMines).mockRejectedValueOnce(new Error("Unauthorized"));

    const { result } = renderHook(
      () => useLiffCopperMines(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("returns empty mines list when user has no mines", async () => {
    vi.mocked(getCopperMines).mockResolvedValueOnce(mockEmptyMineListResponse);

    const { result } = renderHook(
      () => useLiffCopperMines(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.mines).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });
});

// =============================================================================
// useLiffCopperRules
// =============================================================================

describe("useLiffCopperRules", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches copper rules when groupId is provided", async () => {
    vi.mocked(getCopperRules).mockResolvedValueOnce(mockCopperRules);

    const { result } = renderHook(
      () => useLiffCopperRules("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCopperRules);
    expect(getCopperRules).toHaveBeenCalledWith({ lineGroupId: "group-456" });
  });

  it("does not fetch when groupId is null", () => {
    const { result } = renderHook(
      () => useLiffCopperRules(null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getCopperRules).not.toHaveBeenCalled();
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getCopperRules).mockRejectedValueOnce(new Error("Not found"));

    const { result } = renderHook(
      () => useLiffCopperRules("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("returns empty rules array when no rules configured", async () => {
    vi.mocked(getCopperRules).mockResolvedValueOnce([]);

    const { result } = renderHook(
      () => useLiffCopperRules("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// =============================================================================
// useLiffRegisterCopper
// =============================================================================

describe("useLiffRegisterCopper", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("registers a copper mine and invalidates list cache on settled", async () => {
    const mockRegisterResponse: RegisterCopperResponse = {
      success: true,
      mine: mockMine,
      message: null,
    };
    vi.mocked(registerCopperMine).mockResolvedValueOnce(mockRegisterResponse);
    // Needed for the subsequent invalidation refetch
    vi.mocked(getCopperMines).mockResolvedValue(mockMineListResponse);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useLiffRegisterCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({
        gameId: "game-abc",
        coordX: 10,
        coordY: 20,
        level: 9,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(registerCopperMine).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
      gameId: "game-abc",
      coordX: 10,
      coordY: 20,
      level: 9,
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: liffCopperKeys.list("user-123", "group-456"),
      }),
    );
  });

  it("applies optimistic update before server response", async () => {
    // Seed cache with current mine list
    queryClient.setQueryData(
      liffCopperKeys.list("user-123", "group-456"),
      mockEmptyMineListResponse,
    );

    vi.mocked(registerCopperMine).mockImplementation(
      () => new Promise((resolve) => setTimeout(() =>
        resolve({ success: true, mine: mockMine, message: null }), 50)),
    );
    vi.mocked(getCopperMines).mockResolvedValue(mockMineListResponse);

    const { result } = renderHook(
      () => useLiffRegisterCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({
        gameId: "game-abc",
        coordX: 10,
        coordY: 20,
        level: 9,
      });
    });

    // Optimistic update: mine should appear immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<CopperMineListResponse>(
        liffCopperKeys.list("user-123", "group-456"),
      );
      expect(cached?.total).toBe(1);
    });
  });

  it("rolls back optimistic update on error", async () => {
    queryClient.setQueryData(
      liffCopperKeys.list("user-123", "group-456"),
      mockMineListResponse,
    );

    vi.mocked(registerCopperMine).mockRejectedValueOnce(new Error("Limit exceeded"));
    vi.mocked(getCopperMines).mockResolvedValue(mockMineListResponse);

    const { result } = renderHook(
      () => useLiffRegisterCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({
        gameId: "game-abc",
        coordX: 99,
        coordY: 99,
        level: 9,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<CopperMineListResponse>(
      liffCopperKeys.list("user-123", "group-456"),
    );
    expect(cached?.total).toBe(1);
    expect(cached?.mines[0].id).toBe("mine-1");
  });

  it("does not throw when context is null (skips optimistic update)", async () => {
    const mockRegisterResponse: RegisterCopperResponse = {
      success: true,
      mine: mockMine,
      message: null,
    };
    vi.mocked(registerCopperMine).mockResolvedValueOnce(mockRegisterResponse);

    const { result } = renderHook(
      () => useLiffRegisterCopper(null),
      { wrapper: createWrapper(queryClient) },
    );

    // mutationFn will throw since context is null — that is expected behavior
    act(() => {
      result.current.mutate({
        gameId: "game-abc",
        coordX: 10,
        coordY: 20,
        level: 9,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("registers mine with optional notes", async () => {
    const mockRegisterResponse: RegisterCopperResponse = {
      success: true,
      mine: { ...mockMine, notes: "Near river" },
      message: null,
    };
    vi.mocked(registerCopperMine).mockResolvedValueOnce(mockRegisterResponse);
    vi.mocked(getCopperMines).mockResolvedValue(mockMineListResponse);

    const { result } = renderHook(
      () => useLiffRegisterCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({
        gameId: "game-abc",
        coordX: 10,
        coordY: 20,
        level: 9,
        notes: "Near river",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(registerCopperMine).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Near river" }),
    );
  });
});

// =============================================================================
// useLiffDeleteCopper
// =============================================================================

describe("useLiffDeleteCopper", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("deletes a mine and invalidates list cache on settled", async () => {
    vi.mocked(deleteCopperMine).mockResolvedValueOnce(undefined);
    vi.mocked(getCopperMines).mockResolvedValue(mockEmptyMineListResponse);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useLiffDeleteCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ mineId: "mine-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deleteCopperMine).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
      mineId: "mine-1",
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: liffCopperKeys.list("user-123", "group-456"),
      }),
    );
  });

  it("applies optimistic removal before server response", async () => {
    queryClient.setQueryData(
      liffCopperKeys.list("user-123", "group-456"),
      mockMineListResponse,
    );

    vi.mocked(deleteCopperMine).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50)),
    );
    vi.mocked(getCopperMines).mockResolvedValue(mockEmptyMineListResponse);

    const { result } = renderHook(
      () => useLiffDeleteCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ mineId: "mine-1" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<CopperMineListResponse>(
        liffCopperKeys.list("user-123", "group-456"),
      );
      expect(cached?.mines.find((m) => m.id === "mine-1")).toBeUndefined();
    });
  });

  it("rolls back optimistic delete on error", async () => {
    queryClient.setQueryData(
      liffCopperKeys.list("user-123", "group-456"),
      mockMineListResponse,
    );

    vi.mocked(deleteCopperMine).mockRejectedValueOnce(new Error("Not found"));
    vi.mocked(getCopperMines).mockResolvedValue(mockMineListResponse);

    const { result } = renderHook(
      () => useLiffDeleteCopper(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ mineId: "mine-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<CopperMineListResponse>(
      liffCopperKeys.list("user-123", "group-456"),
    );
    expect(cached?.mines).toHaveLength(1);
    expect(cached?.mines[0].id).toBe("mine-1");
  });

  it("does not throw when context is null", async () => {
    const { result } = renderHook(
      () => useLiffDeleteCopper(null),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ mineId: "mine-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useLiffCopperSearch
// =============================================================================

describe("useLiffCopperSearch", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  const mockSearchResults: CopperCoordinateSearchResult[] = [
    {
      coord_x: 10,
      coord_y: 20,
      level: 9,
      county: "縣A",
      district: "區A",
      is_taken: false,
    },
  ];

  it("fetches search results when groupId and query are provided", async () => {
    vi.mocked(searchCopperCoordinates).mockResolvedValueOnce(mockSearchResults);

    const { result } = renderHook(
      () => useLiffCopperSearch("group-456", "縣A"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSearchResults);
    expect(searchCopperCoordinates).toHaveBeenCalledWith({
      lineGroupId: "group-456",
      query: "縣A",
    });
  });

  it("does not fetch when groupId is null", () => {
    const { result } = renderHook(
      () => useLiffCopperSearch(null, "縣A"),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(searchCopperCoordinates).not.toHaveBeenCalled();
  });

  it("does not fetch when query is empty", () => {
    const { result } = renderHook(
      () => useLiffCopperSearch("group-456", ""),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(searchCopperCoordinates).not.toHaveBeenCalled();
  });

  it("fetches when query has at least 1 character", async () => {
    vi.mocked(searchCopperCoordinates).mockResolvedValueOnce([]);

    const { result } = renderHook(
      () => useLiffCopperSearch("group-456", "A"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchCopperCoordinates).toHaveBeenCalledTimes(1);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(searchCopperCoordinates).mockRejectedValueOnce(new Error("Server error"));

    const { result } = renderHook(
      () => useLiffCopperSearch("group-456", "縣A"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useLiffCopperCoordinateLookup
// =============================================================================

describe("useLiffCopperCoordinateLookup", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  const mockLookupResult: CopperCoordinateLookupResult = {
    coord_x: 10,
    coord_y: 20,
    level: 9,
    county: "縣A",
    district: "區A",
    is_taken: false,
    can_register: true,
    requires_manual_level: false,
    message: null,
  };

  it("looks up coordinate on mutate", async () => {
    vi.mocked(lookupCopperCoordinate).mockResolvedValueOnce(mockLookupResult);

    const { result } = renderHook(
      () => useLiffCopperCoordinateLookup("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ coordX: 10, coordY: 20 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockLookupResult);
    expect(lookupCopperCoordinate).toHaveBeenCalledWith({
      lineGroupId: "group-456",
      coordX: 10,
      coordY: 20,
    });
  });

  it("returns taken coordinate info", async () => {
    const takenResult: CopperCoordinateLookupResult = {
      ...mockLookupResult,
      is_taken: true,
      can_register: false,
      message: "此坐標已被佔用",
    };
    vi.mocked(lookupCopperCoordinate).mockResolvedValueOnce(takenResult);

    const { result } = renderHook(
      () => useLiffCopperCoordinateLookup("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ coordX: 10, coordY: 20 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.is_taken).toBe(true);
    expect(result.current.data?.can_register).toBe(false);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(lookupCopperCoordinate).mockRejectedValueOnce(new Error("Invalid coordinate"));

    const { result } = renderHook(
      () => useLiffCopperCoordinateLookup("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ coordX: -1, coordY: -1 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
