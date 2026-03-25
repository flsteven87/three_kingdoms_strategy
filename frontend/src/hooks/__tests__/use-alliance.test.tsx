import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useAlliance,
  useCreateAlliance,
  useUpdateAlliance,
  useDeleteAlliance,
  allianceKeys,
} from "../use-alliance";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type { Alliance } from "@/types/alliance";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAlliance: vi.fn(),
    createAlliance: vi.fn(),
    updateAlliance: vi.fn(),
    deleteAlliance: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const mockAlliance: Alliance = {
  id: "alliance-1",
  name: "Test Alliance",
  server_name: "S100",
  owner_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("allianceKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(allianceKeys.all).toEqual(["alliance"]);
    expect(allianceKeys.detail()).toEqual(["alliance", "detail"]);
  });
});

describe("useAlliance", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("fetches alliance data", async () => {
    vi.mocked(apiClient.getAlliance).mockResolvedValueOnce(mockAlliance);

    const { result } = renderHook(() => useAlliance(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAlliance);
    expect(apiClient.getAlliance).toHaveBeenCalledTimes(1);
  });

  it("returns null when user has no alliance", async () => {
    vi.mocked(apiClient.getAlliance).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAlliance(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useCreateAlliance", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("calls createAlliance and updates cache on success", async () => {
    vi.mocked(apiClient.createAlliance).mockResolvedValueOnce(mockAlliance);

    const { result } = renderHook(() => useCreateAlliance(), { wrapper: createWrapper(queryClient) });

    act(() => {
      result.current.mutate({ name: "Test Alliance", server_name: "S100" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Cache should be populated
    const cached = queryClient.getQueryData(allianceKeys.detail());
    expect(cached).toEqual(mockAlliance);
  });
});

describe("useUpdateAlliance", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("optimistically updates alliance data", async () => {
    // Seed cache with existing alliance
    queryClient.setQueryData(allianceKeys.detail(), mockAlliance);

    vi.mocked(apiClient.updateAlliance).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        ...mockAlliance,
        name: "Updated Name",
      }), 50))
    );

    const { result } = renderHook(() => useUpdateAlliance(), { wrapper: createWrapper(queryClient) });

    act(() => {
      result.current.mutate({ name: "Updated Name" });
    });

    // Optimistic update should be applied immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<Alliance>(allianceKeys.detail());
      expect(cached?.name).toBe("Updated Name");
    });
  });

  it("rolls back optimistic update on error", async () => {
    queryClient.setQueryData(allianceKeys.detail(), mockAlliance);

    vi.mocked(apiClient.updateAlliance).mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useUpdateAlliance(), { wrapper: createWrapper(queryClient) });

    act(() => {
      result.current.mutate({ name: "Will Fail" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should rollback to original
    const cached = queryClient.getQueryData<Alliance>(allianceKeys.detail());
    expect(cached?.name).toBe("Test Alliance");
  });
});

describe("useDeleteAlliance", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("sets cache to null on success", async () => {
    queryClient.setQueryData(allianceKeys.detail(), mockAlliance);
    vi.mocked(apiClient.deleteAlliance).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteAlliance(), { wrapper: createWrapper(queryClient) });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData(allianceKeys.detail());
    expect(cached).toBeNull();
  });
});
