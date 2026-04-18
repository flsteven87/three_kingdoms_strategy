import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  copperMineKeys,
  useCopperMineRules,
  useCopperMineOwnerships,
  useCreateCopperMineRule,
  useUpdateCopperMineRule,
  useDeleteCopperMineRule,
  useCopperCoordinateLookup,
} from "../use-copper-mines";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type {
  CopperMineRule,
  CopperMineOwnership,
  CopperMineOwnershipListResponse,
  CopperCoordinateLookupResult,
} from "@/types/copper-mine";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCopperMineRules: vi.fn(),
    createCopperMineRule: vi.fn(),
    updateCopperMineRule: vi.fn(),
    deleteCopperMineRule: vi.fn(),
    getCopperMineOwnerships: vi.fn(),
    createCopperMineOwnership: vi.fn(),
    deleteCopperMineOwnership: vi.fn(),
    updateCopperMineOwnership: vi.fn(),
    lookupCopperCoordinate: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

// =============================================================================
// Mock Data
// =============================================================================

const mockRule1: CopperMineRule = {
  id: "rule-1",
  alliance_id: "alliance-1",
  tier: 1,
  required_merit: 10000,
  allowed_level: "nine",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockRule2: CopperMineRule = {
  id: "rule-2",
  alliance_id: "alliance-1",
  tier: 2,
  required_merit: 25000,
  allowed_level: "ten",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockOwnership1: CopperMineOwnership = {
  id: "ownership-1",
  season_id: "season-1",
  member_id: "member-1",
  coord_x: 100,
  coord_y: 200,
  level: 9,
  applied_at: "2026-01-05T10:00:00Z",
  created_at: "2026-01-05T10:00:00Z",
  registered_via: "dashboard",
  member_name: "曹操",
  member_group: "A組",
  line_display_name: null,
};

const mockOwnership2: CopperMineOwnership = {
  id: "ownership-2",
  season_id: "season-1",
  member_id: "member-2",
  coord_x: 150,
  coord_y: 250,
  level: 10,
  applied_at: "2026-01-06T10:00:00Z",
  created_at: "2026-01-06T10:00:00Z",
  registered_via: "liff",
  member_name: "劉備",
  member_group: "B組",
  line_display_name: "玄德",
};

const mockOwnershipListResponse: CopperMineOwnershipListResponse = {
  ownerships: [mockOwnership1, mockOwnership2],
  total: 2,
};

// =============================================================================
// copperMineKeys
// =============================================================================

describe("copperMineKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(copperMineKeys.all).toEqual(["copper-mines"]);
    expect(copperMineKeys.rules()).toEqual(["copper-mines", "rules"]);
    expect(copperMineKeys.ownerships()).toEqual(["copper-mines", "ownerships"]);
    expect(copperMineKeys.ownershipsBySeason("season-1")).toEqual([
      "copper-mines",
      "ownerships",
      "season-1",
    ]);
    expect(copperMineKeys.memberStatus("season-1", "member-1")).toEqual([
      "copper-mines",
      "member-status",
      "season-1",
      "member-1",
    ]);
  });
});

// =============================================================================
// useCopperMineRules
// =============================================================================

describe("useCopperMineRules", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches copper mine rules", async () => {
    vi.mocked(apiClient.getCopperMineRules).mockResolvedValueOnce([
      mockRule1,
      mockRule2,
    ]);

    const { result } = renderHook(() => useCopperMineRules(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockRule1, mockRule2]);
    expect(apiClient.getCopperMineRules).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no rules exist", async () => {
    vi.mocked(apiClient.getCopperMineRules).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useCopperMineRules(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// =============================================================================
// useCopperMineOwnerships
// =============================================================================

describe("useCopperMineOwnerships", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches ownerships for a season", async () => {
    vi.mocked(apiClient.getCopperMineOwnerships).mockResolvedValueOnce(
      mockOwnershipListResponse
    );

    const { result } = renderHook(
      () => useCopperMineOwnerships("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Hook extracts .ownerships from the response
    expect(result.current.data).toEqual([mockOwnership1, mockOwnership2]);
    expect(apiClient.getCopperMineOwnerships).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is null", () => {
    const { result } = renderHook(
      () => useCopperMineOwnerships(null),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getCopperMineOwnerships).not.toHaveBeenCalled();
  });

  it("returns empty array when no ownerships exist", async () => {
    vi.mocked(apiClient.getCopperMineOwnerships).mockResolvedValueOnce({
      ownerships: [],
      total: 0,
    });

    const { result } = renderHook(
      () => useCopperMineOwnerships("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// =============================================================================
// useCreateCopperMineRule
// =============================================================================

describe("useCreateCopperMineRule", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("creates a rule and invalidates cache on settled", async () => {
    vi.mocked(apiClient.createCopperMineRule).mockResolvedValueOnce(mockRule1);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        tier: 1,
        required_merit: 10000,
        allowed_level: "nine",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: copperMineKeys.rules(),
    });
  });

  it("optimistically adds the new rule to the cache", async () => {
    queryClient.setQueryData(copperMineKeys.rules(), [mockRule2]);

    vi.mocked(apiClient.createCopperMineRule).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(mockRule1), 50)
        )
    );

    const { result } = renderHook(() => useCreateCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        tier: 1,
        required_merit: 10000,
        allowed_level: "nine",
      });
    });

    // Optimistic update: new rule should appear immediately, sorted by tier
    await waitFor(() => {
      const cached = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rules()
      );
      expect(cached?.length).toBe(2);
      expect(cached?.[0].tier).toBe(1);
      expect(cached?.[1].tier).toBe(2);
    });
  });

  it("rolls back optimistic update on error", async () => {
    queryClient.setQueryData(copperMineKeys.rules(), [mockRule2]);

    vi.mocked(apiClient.createCopperMineRule).mockRejectedValueOnce(
      new Error("Server error")
    );

    const { result } = renderHook(() => useCreateCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        tier: 1,
        required_merit: 10000,
        allowed_level: "nine",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should rollback to original single rule
    const cached = queryClient.getQueryData<CopperMineRule[]>(
      copperMineKeys.rules()
    );
    expect(cached).toEqual([mockRule2]);
  });
});

// =============================================================================
// useUpdateCopperMineRule
// =============================================================================

describe("useUpdateCopperMineRule", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("updates a rule and invalidates cache on settled", async () => {
    const updatedRule = { ...mockRule1, required_merit: 15000 };
    vi.mocked(apiClient.updateCopperMineRule).mockResolvedValueOnce(updatedRule);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        ruleId: "rule-1",
        data: { required_merit: 15000 },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: copperMineKeys.rules(),
    });
  });

  it("optimistically updates the rule in cache", async () => {
    queryClient.setQueryData(copperMineKeys.rules(), [mockRule1, mockRule2]);

    vi.mocked(apiClient.updateCopperMineRule).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ...mockRule1, required_merit: 15000 }), 50)
        )
    );

    const { result } = renderHook(() => useUpdateCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        ruleId: "rule-1",
        data: { required_merit: 15000 },
      });
    });

    // Optimistic update should be visible immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rules()
      );
      expect(cached?.find((r) => r.id === "rule-1")?.required_merit).toBe(
        15000
      );
      // Other rule should be unchanged
      expect(cached?.find((r) => r.id === "rule-2")?.required_merit).toBe(
        25000
      );
    });
  });

  it("rolls back optimistic update on error", async () => {
    queryClient.setQueryData(copperMineKeys.rules(), [mockRule1, mockRule2]);

    vi.mocked(apiClient.updateCopperMineRule).mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useUpdateCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        ruleId: "rule-1",
        data: { required_merit: 99999 },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should rollback to original
    const cached = queryClient.getQueryData<CopperMineRule[]>(
      copperMineKeys.rules()
    );
    expect(cached?.find((r) => r.id === "rule-1")?.required_merit).toBe(10000);
  });
});

// =============================================================================
// useDeleteCopperMineRule
// =============================================================================

describe("useDeleteCopperMineRule", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("deletes a rule and invalidates cache on settled", async () => {
    vi.mocked(apiClient.deleteCopperMineRule).mockResolvedValueOnce(undefined);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("rule-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: copperMineKeys.rules(),
    });
  });

  it("optimistically removes the rule from cache", async () => {
    queryClient.setQueryData(copperMineKeys.rules(), [mockRule1, mockRule2]);

    vi.mocked(apiClient.deleteCopperMineRule).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(undefined), 50)
        )
    );

    const { result } = renderHook(() => useDeleteCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("rule-1");
    });

    // Optimistic removal: rule-1 should be gone immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<CopperMineRule[]>(
        copperMineKeys.rules()
      );
      expect(cached?.length).toBe(1);
      expect(cached?.[0].id).toBe("rule-2");
    });
  });

  it("rolls back optimistic delete on error", async () => {
    queryClient.setQueryData(copperMineKeys.rules(), [mockRule1, mockRule2]);

    vi.mocked(apiClient.deleteCopperMineRule).mockRejectedValueOnce(
      new Error("Server error")
    );

    const { result } = renderHook(() => useDeleteCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("rule-1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should rollback to having both rules
    const cached = queryClient.getQueryData<CopperMineRule[]>(
      copperMineKeys.rules()
    );
    expect(cached?.length).toBe(2);
  });

  it("calls apiClient.deleteCopperMineRule with the correct ruleId", async () => {
    vi.mocked(apiClient.deleteCopperMineRule).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteCopperMineRule(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("rule-2");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.deleteCopperMineRule).toHaveBeenCalledWith("rule-2");
  });
});

// =============================================================================
// useCopperCoordinateLookup
// =============================================================================

describe("useCopperCoordinateLookup", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("returns in-source metadata when coord found", async () => {
    const result: CopperCoordinateLookupResult = {
      coord_x: 123,
      coord_y: 456,
      level: 10,
      county: "巴郡",
      district: "江州",
      is_taken: false,
      can_register: true,
      requires_manual_level: false,
      message: null,
    };
    vi.mocked(apiClient.lookupCopperCoordinate).mockResolvedValueOnce(result);

    const { result: hookResult } = renderHook(
      () => useCopperCoordinateLookup("season-1", 123, 456),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));
    expect(hookResult.current.data?.level).toBe(10);
    expect(hookResult.current.data?.requires_manual_level).toBe(false);
    expect(apiClient.lookupCopperCoordinate).toHaveBeenCalledWith("season-1", 123, 456);
  });

  it("returns warning state when coord not in source", async () => {
    const result: CopperCoordinateLookupResult = {
      coord_x: 999,
      coord_y: 888,
      level: null,
      county: null,
      district: null,
      is_taken: false,
      can_register: true,
      requires_manual_level: true,
      message: "座標不在 PK23 官方資料中，仍可申請，請確認等級",
    };
    vi.mocked(apiClient.lookupCopperCoordinate).mockResolvedValueOnce(result);

    const { result: hookResult } = renderHook(
      () => useCopperCoordinateLookup("season-1", 999, 888),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));
    expect(hookResult.current.data?.requires_manual_level).toBe(true);
    expect(hookResult.current.data?.can_register).toBe(true);
    expect(hookResult.current.data?.message).toContain("PK23");
  });

  it("is disabled when coords are null", () => {
    const { result } = renderHook(
      () => useCopperCoordinateLookup("season-1", null, null),
      { wrapper: createWrapper(queryClient) },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.lookupCopperCoordinate).not.toHaveBeenCalled();
  });

  it("is disabled when seasonId is null", () => {
    const { result } = renderHook(
      () => useCopperCoordinateLookup(null, 10, 20),
      { wrapper: createWrapper(queryClient) },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.lookupCopperCoordinate).not.toHaveBeenCalled();
  });
});
