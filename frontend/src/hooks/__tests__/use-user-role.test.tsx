import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useUserRole,
  usePermission,
  permissions,
  type UserRole,
} from "../use-user-role";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import { allianceKeys } from "../use-alliance";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAlliance: vi.fn(),
    getMyRole: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const mockAlliance = {
  id: "alliance-1",
  name: "Test Alliance",
  server_name: "S100",
  owner_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("permissions", () => {
  it("owner has all permissions", () => {
    const role: UserRole = "owner";
    expect(permissions.canManageCollaborators(role)).toBe(true);
    expect(permissions.canUploadData(role)).toBe(true);
    expect(permissions.canManageSeasons(role)).toBe(true);
    expect(permissions.canManageWeights(role)).toBe(true);
    expect(permissions.canUpdateAlliance(role)).toBe(true);
    expect(permissions.canDeleteAlliance(role)).toBe(true);
    expect(permissions.canViewData(role)).toBe(true);
  });

  it("collaborator can upload and manage but not delete alliance", () => {
    const role: UserRole = "collaborator";
    expect(permissions.canManageCollaborators(role)).toBe(false);
    expect(permissions.canUploadData(role)).toBe(true);
    expect(permissions.canManageSeasons(role)).toBe(true);
    expect(permissions.canUpdateAlliance(role)).toBe(true);
    expect(permissions.canDeleteAlliance(role)).toBe(false);
    expect(permissions.canViewData(role)).toBe(true);
  });

  it("member can only view data", () => {
    const role: UserRole = "member";
    expect(permissions.canManageCollaborators(role)).toBe(false);
    expect(permissions.canUploadData(role)).toBe(false);
    expect(permissions.canManageSeasons(role)).toBe(false);
    expect(permissions.canDeleteAlliance(role)).toBe(false);
    expect(permissions.canViewData(role)).toBe(true);
  });

  it("null role has no permissions", () => {
    expect(permissions.canManageCollaborators(null)).toBe(false);
    expect(permissions.canUploadData(null)).toBe(false);
    expect(permissions.canViewData(null)).toBe(false);
  });
});

describe("useUserRole", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("fetches role when alliance is available", async () => {
    // Seed alliance in cache so useAlliance returns data
    queryClient.setQueryData(allianceKeys.detail(), mockAlliance);
    vi.mocked(apiClient.getMyRole).mockResolvedValueOnce({ role: "owner" });

    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("owner");
    expect(apiClient.getMyRole).toHaveBeenCalledWith("alliance-1");
  });

  it("stays disabled when no alliance in cache", () => {
    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper(queryClient) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getMyRole).not.toHaveBeenCalled();
  });
});

describe("usePermission", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("returns true when user has the permission", async () => {
    queryClient.setQueryData(allianceKeys.detail(), mockAlliance);
    queryClient.setQueryData(["user-role", "alliance-1"], "owner");

    const { result } = renderHook(
      () => usePermission(permissions.canDeleteAlliance),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current).toBe(true);
  });

  it("returns false when role is not loaded yet", () => {
    const { result } = renderHook(
      () => usePermission(permissions.canDeleteAlliance),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current).toBe(false);
  });
});
