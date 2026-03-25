import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collaboratorKeys,
  useAllianceCollaborators,
  useAddAllianceCollaborator,
  useRemoveAllianceCollaborator,
  useUpdateCollaboratorRole,
} from "../use-alliance-collaborators";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type {
  AllianceCollaborator,
  AllianceCollaboratorsResponse,
} from "@/types/alliance-collaborator";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCollaborators: vi.fn(),
    addCollaborator: vi.fn(),
    removeCollaborator: vi.fn(),
    updateCollaboratorRole: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const mockCollaborator: AllianceCollaborator = {
  id: "collab-1",
  alliance_id: "alliance-1",
  user_id: "user-2",
  role: "editor",
  invited_by: "user-1",
  joined_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  user_email: "editor@example.com",
  user_name: "Editor User",
};

const mockCollaboratorsResponse: AllianceCollaboratorsResponse = {
  collaborators: [mockCollaborator],
  total: 1,
};

// =============================================================================
// collaboratorKeys
// =============================================================================

describe("collaboratorKeys", () => {
  it("builds correct all key", () => {
    expect(collaboratorKeys.all).toEqual(["alliance-collaborators"]);
  });

  it("builds byAlliance key", () => {
    expect(collaboratorKeys.byAlliance("alliance-1")).toEqual([
      "alliance-collaborators",
      "alliance",
      "alliance-1",
    ]);
  });
});

// =============================================================================
// useAllianceCollaborators
// =============================================================================

describe("useAllianceCollaborators", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches collaborators for a given allianceId", async () => {
    vi.mocked(apiClient.getCollaborators).mockResolvedValueOnce(
      mockCollaboratorsResponse
    );

    const { result } = renderHook(
      () => useAllianceCollaborators("alliance-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCollaboratorsResponse);
    expect(apiClient.getCollaborators).toHaveBeenCalledWith("alliance-1");
  });

  it("does not fetch when allianceId is undefined", () => {
    const { result } = renderHook(
      () => useAllianceCollaborators(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getCollaborators).not.toHaveBeenCalled();
  });

  it("returns empty collaborators list when alliance has none", async () => {
    vi.mocked(apiClient.getCollaborators).mockResolvedValueOnce({
      collaborators: [],
      total: 0,
    });

    const { result } = renderHook(
      () => useAllianceCollaborators("alliance-empty"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.collaborators).toHaveLength(0);
    expect(result.current.data?.total).toBe(0);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(apiClient.getCollaborators).mockRejectedValueOnce(
      new Error("Forbidden")
    );

    const { result } = renderHook(
      () => useAllianceCollaborators("alliance-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// =============================================================================
// useAddAllianceCollaborator
// =============================================================================

describe("useAddAllianceCollaborator", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls addCollaborator and invalidates cache on success", async () => {
    vi.mocked(apiClient.addCollaborator).mockResolvedValueOnce(mockCollaborator);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddAllianceCollaborator(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        allianceId: "alliance-1",
        data: { email: "newuser@example.com", role: "viewer" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.addCollaborator).toHaveBeenCalledWith("alliance-1", {
      email: "newuser@example.com",
      role: "viewer",
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: collaboratorKeys.byAlliance("alliance-1"),
      })
    );
  });

  it("invalidates cache even on api error (onSettled)", async () => {
    vi.mocked(apiClient.addCollaborator).mockRejectedValueOnce(
      new Error("User not found")
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddAllianceCollaborator(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        allianceId: "alliance-1",
        data: { email: "ghost@example.com" },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: collaboratorKeys.byAlliance("alliance-1"),
      })
    );
  });
});

// =============================================================================
// useRemoveAllianceCollaborator
// =============================================================================

describe("useRemoveAllianceCollaborator", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls removeCollaborator and invalidates cache on success", async () => {
    vi.mocked(apiClient.removeCollaborator).mockResolvedValueOnce(undefined);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveAllianceCollaborator(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ allianceId: "alliance-1", userId: "user-2" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.removeCollaborator).toHaveBeenCalledWith("alliance-1", "user-2");
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: collaboratorKeys.byAlliance("alliance-1"),
      })
    );
  });

  it("invalidates cache even on removal failure (onSettled)", async () => {
    vi.mocked(apiClient.removeCollaborator).mockRejectedValueOnce(
      new Error("Cannot remove owner")
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveAllianceCollaborator(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ allianceId: "alliance-1", userId: "user-owner" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: collaboratorKeys.byAlliance("alliance-1"),
      })
    );
  });
});

// =============================================================================
// useUpdateCollaboratorRole
// =============================================================================

describe("useUpdateCollaboratorRole", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("calls updateCollaboratorRole and invalidates cache on success", async () => {
    const updatedCollaborator: AllianceCollaborator = {
      ...mockCollaborator,
      role: "viewer",
    };
    vi.mocked(apiClient.updateCollaboratorRole).mockResolvedValueOnce(
      updatedCollaborator
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCollaboratorRole(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        allianceId: "alliance-1",
        userId: "user-2",
        newRole: "viewer",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.updateCollaboratorRole).toHaveBeenCalledWith(
      "alliance-1",
      "user-2",
      "viewer"
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: collaboratorKeys.byAlliance("alliance-1"),
      })
    );
  });

  it("invalidates cache on role update failure (onSettled)", async () => {
    vi.mocked(apiClient.updateCollaboratorRole).mockRejectedValueOnce(
      new Error("Invalid role")
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCollaboratorRole(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        allianceId: "alliance-1",
        userId: "user-2",
        newRole: "superadmin",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: collaboratorKeys.byAlliance("alliance-1"),
      })
    );
  });
});
