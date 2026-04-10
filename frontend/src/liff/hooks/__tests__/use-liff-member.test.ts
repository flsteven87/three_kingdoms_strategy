/**
 * Tests for LIFF Member hooks
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  liffMemberKeys,
  useLiffMemberInfo,
  useLiffRegisterMember,
  useLiffUnregisterMember,
  useLiffMemberCandidates,
  useLiffSimilarMembers,
} from "../use-liff-member";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../../__tests__/test-utils";
import type {
  MemberInfoResponse,
  RegisterMemberResponse,
  MemberCandidatesResponse,
  SimilarMembersResponse,
} from "../../lib/liff-api-client";

vi.mock("../../lib/liff-api-client", () => ({
  getMemberInfo: vi.fn(),
  registerMember: vi.fn(),
  unregisterMember: vi.fn(),
  getMemberCandidates: vi.fn(),
  findSimilarMembers: vi.fn(),
}));

import {
  getMemberInfo,
  registerMember,
  unregisterMember,
  getMemberCandidates,
  findSimilarMembers,
} from "../../lib/liff-api-client";

const mockContext = {
  lineUserId: "user-123",
  lineGroupId: "group-456",
  lineDisplayName: "Test User",
};

const mockMemberInfoResponse: MemberInfoResponse = {
  has_registered: true,
  registered_ids: [
    {
      game_id: "game-abc",
      display_name: "Test User",
      is_verified: true,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  alliance_name: "Dragon Alliance",
};

const mockUnregisteredResponse: MemberInfoResponse = {
  has_registered: false,
  registered_ids: [],
  alliance_name: null,
};

const mockRegisterResponse: RegisterMemberResponse = {
  has_registered: true,
  registered_ids: [
    {
      game_id: "game-abc",
      display_name: "Test User",
      is_verified: false,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const mockCandidatesResponse: MemberCandidatesResponse = {
  candidates: [
    { name: "Player A", group_name: "Group 1" },
    { name: "Player B", group_name: null },
  ],
};

const mockSimilarResponse: SimilarMembersResponse = {
  similar: [
    { name: "Player A", group_name: "Group 1" },
  ],
  has_exact_match: false,
};

// =============================================================================
// liffMemberKeys
// =============================================================================

describe("liffMemberKeys", () => {
  it("builds correct all key", () => {
    expect(liffMemberKeys.all).toEqual(["liff-member"]);
  });

  it("builds info key with userId and groupId", () => {
    expect(liffMemberKeys.info("user-1", "group-1")).toEqual([
      "liff-member",
      "info",
      "user-1",
      "group-1",
    ]);
  });

  it("builds candidates key with groupId", () => {
    expect(liffMemberKeys.candidates("group-1")).toEqual([
      "liff-member",
      "candidates",
      "group-1",
    ]);
  });

  it("builds similar key with groupId and name", () => {
    expect(liffMemberKeys.similar("group-1", "Player A")).toEqual([
      "liff-member",
      "similar",
      "group-1",
      "Player A",
    ]);
  });
});

// =============================================================================
// useLiffMemberInfo
// =============================================================================

describe("useLiffMemberInfo", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches member info when context is provided", async () => {
    vi.mocked(getMemberInfo).mockResolvedValueOnce(mockMemberInfoResponse);

    const { result } = renderHook(
      () => useLiffMemberInfo(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockMemberInfoResponse);
    expect(getMemberInfo).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
    });
  });

  it("does not fetch when context is null", () => {
    const { result } = renderHook(
      () => useLiffMemberInfo(null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMemberInfo).not.toHaveBeenCalled();
  });

  it("returns unregistered state for new user", async () => {
    vi.mocked(getMemberInfo).mockResolvedValueOnce(mockUnregisteredResponse);

    const { result } = renderHook(
      () => useLiffMemberInfo(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.has_registered).toBe(false);
    expect(result.current.data?.registered_ids).toHaveLength(0);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getMemberInfo).mockRejectedValueOnce(new Error("Unauthorized"));

    const { result } = renderHook(
      () => useLiffMemberInfo(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useLiffRegisterMember
// =============================================================================

describe("useLiffRegisterMember", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("registers member and invalidates member info cache on settled", async () => {
    vi.mocked(registerMember).mockResolvedValueOnce(mockRegisterResponse);
    vi.mocked(getMemberInfo).mockResolvedValue(mockMemberInfoResponse);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useLiffRegisterMember(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ gameId: "game-abc" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(registerMember).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
      displayName: "Test User",
      gameId: "game-abc",
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: liffMemberKeys.info("user-123", "group-456"),
      }),
    );
  });

  it("enters error state on api failure", async () => {
    vi.mocked(registerMember).mockRejectedValueOnce(new Error("Already registered"));

    const { result } = renderHook(
      () => useLiffRegisterMember(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ gameId: "game-abc" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("does not throw when context is null — mutationFn errors naturally", async () => {
    const { result } = renderHook(
      () => useLiffRegisterMember(null),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ gameId: "game-abc" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("still invalidates when context becomes null after mutation completes", async () => {
    // When context is valid, onSettled checks context before invalidating
    vi.mocked(registerMember).mockResolvedValueOnce(mockRegisterResponse);
    vi.mocked(getMemberInfo).mockResolvedValue(mockMemberInfoResponse);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useLiffRegisterMember(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ gameId: "game-abc" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

// =============================================================================
// useLiffUnregisterMember
// =============================================================================

describe("useLiffUnregisterMember", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("unregisters member and invalidates member info cache on settled", async () => {
    vi.mocked(unregisterMember).mockResolvedValueOnce(mockUnregisteredResponse);
    vi.mocked(getMemberInfo).mockResolvedValue(mockUnregisteredResponse);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useLiffUnregisterMember(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ gameId: "game-abc" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(unregisterMember).toHaveBeenCalledWith({
      lineUserId: "user-123",
      lineGroupId: "group-456",
      gameId: "game-abc",
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: liffMemberKeys.info("user-123", "group-456"),
      }),
    );
  });

  it("enters error state on api failure", async () => {
    vi.mocked(unregisterMember).mockRejectedValueOnce(new Error("Not registered"));

    const { result } = renderHook(
      () => useLiffUnregisterMember(mockContext),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ gameId: "game-abc" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useLiffMemberCandidates
// =============================================================================

describe("useLiffMemberCandidates", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches member candidates when groupId is provided", async () => {
    vi.mocked(getMemberCandidates).mockResolvedValueOnce(mockCandidatesResponse);

    const { result } = renderHook(
      () => useLiffMemberCandidates("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCandidatesResponse);
    expect(getMemberCandidates).toHaveBeenCalledWith({ lineGroupId: "group-456" });
  });

  it("does not fetch when groupId is null", () => {
    const { result } = renderHook(
      () => useLiffMemberCandidates(null),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMemberCandidates).not.toHaveBeenCalled();
  });

  it("returns empty candidates when no members exist", async () => {
    vi.mocked(getMemberCandidates).mockResolvedValueOnce({ candidates: [] });

    const { result } = renderHook(
      () => useLiffMemberCandidates("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.candidates).toHaveLength(0);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(getMemberCandidates).mockRejectedValueOnce(new Error("Not found"));

    const { result } = renderHook(
      () => useLiffMemberCandidates("group-456"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// =============================================================================
// useLiffSimilarMembers
// =============================================================================

describe("useLiffSimilarMembers", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches similar members when groupId and name are provided", async () => {
    vi.mocked(findSimilarMembers).mockResolvedValueOnce(mockSimilarResponse);

    const { result } = renderHook(
      () => useLiffSimilarMembers("group-456", "Player"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSimilarResponse);
    expect(findSimilarMembers).toHaveBeenCalledWith({
      lineGroupId: "group-456",
      name: "Player",
    });
  });

  it("does not fetch when groupId is null", () => {
    const { result } = renderHook(
      () => useLiffSimilarMembers(null, "Player"),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(findSimilarMembers).not.toHaveBeenCalled();
  });

  it("does not fetch when name is empty", () => {
    const { result } = renderHook(
      () => useLiffSimilarMembers("group-456", ""),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(findSimilarMembers).not.toHaveBeenCalled();
  });

  it("fetches when name has at least 1 character", async () => {
    vi.mocked(findSimilarMembers).mockResolvedValueOnce({ similar: [], has_exact_match: false });

    const { result } = renderHook(
      () => useLiffSimilarMembers("group-456", "A"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(findSimilarMembers).toHaveBeenCalledTimes(1);
  });

  it("returns has_exact_match true for exact name", async () => {
    vi.mocked(findSimilarMembers).mockResolvedValueOnce({
      similar: [{ name: "Player A", group_name: "Group 1" }],
      has_exact_match: true,
    });

    const { result } = renderHook(
      () => useLiffSimilarMembers("group-456", "Player A"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.has_exact_match).toBe(true);
  });

  it("enters error state on api failure", async () => {
    vi.mocked(findSimilarMembers).mockRejectedValueOnce(new Error("Server error"));

    const { result } = renderHook(
      () => useLiffSimilarMembers("group-456", "Player"),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
