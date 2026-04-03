import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lineBindingKeys,
  useLineBindingStatus,
  useGenerateBindingCode,
  useUnbindLineGroup,
  useRegisteredMembers,
  useLineCustomCommands,
  useCreateLineCustomCommand,
  useUpdateLineCustomCommand,
  useDeleteLineCustomCommand,
  useCountdown,
  useCopyToClipboard,
} from "../use-line-binding";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type {
  LineBindingStatusResponse,
  LineBindingCode,
  RegisteredMembersResponse,
  LineCustomCommand,
} from "@/types/line-binding";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getLineBindingStatus: vi.fn(),
    generateLineBindingCode: vi.fn(),
    unbindLineGroup: vi.fn(),
    getRegisteredMembers: vi.fn(),
    getLineCustomCommands: vi.fn(),
    createLineCustomCommand: vi.fn(),
    updateLineCustomCommand: vi.fn(),
    deleteLineCustomCommand: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

// =============================================================================
// Mock Data
// =============================================================================

const mockBindingCode: LineBindingCode = {
  code: "ABC123",
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
  is_test: false,
  created_at: new Date().toISOString(),
};

const mockBoundStatusResponse: LineBindingStatusResponse = {
  is_bound: true,
  bindings: [
    {
      id: "binding-1",
      alliance_id: "alliance-1",
      line_group_id: "C12345",
      group_name: "三國戰略討論群",
      group_picture_url: null,
      bound_at: "2026-01-01T00:00:00Z",
      is_active: true,
      is_test: false,
      member_count: 30,
    },
  ],
  pending_code: null,
};

const mockUnboundStatusResponse: LineBindingStatusResponse = {
  is_bound: false,
  bindings: [],
  pending_code: null,
};

const mockRegisteredMembersResponse: RegisteredMembersResponse = {
  members: [
    {
      line_user_id: "U12345",
      line_display_name: "玄德",
      game_id: "劉備",
      is_verified: true,
      registered_at: "2026-01-01T00:00:00Z",
    },
  ],
  unregistered: [],
  total: 1,
  unregistered_count: 0,
};

const mockCustomCommand: LineCustomCommand = {
  id: "cmd-1",
  command_name: "查詢戰功",
  trigger_keyword: "戰功",
  response_message: "您的本週戰功為 {merit}",
  is_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// =============================================================================
// lineBindingKeys
// =============================================================================

describe("lineBindingKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(lineBindingKeys.all).toEqual(["line-binding"]);
    expect(lineBindingKeys.status()).toEqual(["line-binding", "status"]);
    expect(lineBindingKeys.members()).toEqual(["line-binding", "members"]);
    expect(lineBindingKeys.commands()).toEqual(["line-binding", "commands"]);
  });
});

// =============================================================================
// useLineBindingStatus
// =============================================================================

describe("useLineBindingStatus", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches binding status when allianceId is provided", async () => {
    vi.mocked(apiClient.getLineBindingStatus).mockResolvedValueOnce(
      mockBoundStatusResponse
    );

    const { result } = renderHook(
      () => useLineBindingStatus("alliance-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockBoundStatusResponse);
    expect(apiClient.getLineBindingStatus).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when allianceId is undefined", () => {
    const { result } = renderHook(
      () => useLineBindingStatus(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getLineBindingStatus).not.toHaveBeenCalled();
  });

  it("returns is_bound=false for unbound status", async () => {
    vi.mocked(apiClient.getLineBindingStatus).mockResolvedValueOnce(
      mockUnboundStatusResponse
    );

    const { result } = renderHook(
      () => useLineBindingStatus("alliance-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.is_bound).toBe(false);
    expect(result.current.data?.pending_code).toBeNull();
  });
});

// =============================================================================
// useGenerateBindingCode
// =============================================================================

describe("useGenerateBindingCode", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("generates a binding code and invalidates status cache", async () => {
    vi.mocked(apiClient.generateLineBindingCode).mockResolvedValueOnce(
      mockBindingCode
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useGenerateBindingCode(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(false);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockBindingCode);
    expect(apiClient.generateLineBindingCode).toHaveBeenCalledWith(false);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lineBindingKeys.status(),
    });
  });

  it("generates a test binding code when isTest=true", async () => {
    const testCode: LineBindingCode = { ...mockBindingCode, is_test: true };
    vi.mocked(apiClient.generateLineBindingCode).mockResolvedValueOnce(
      testCode
    );

    const { result } = renderHook(() => useGenerateBindingCode(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(true);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.generateLineBindingCode).toHaveBeenCalledWith(true);
  });

  it("invalidates status cache even on error", async () => {
    vi.mocked(apiClient.generateLineBindingCode).mockRejectedValueOnce(
      new Error("Server error")
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useGenerateBindingCode(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(false);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lineBindingKeys.status(),
    });
  });
});

// =============================================================================
// useUnbindLineGroup
// =============================================================================

describe("useUnbindLineGroup", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("unbinds LINE group and invalidates status cache", async () => {
    vi.mocked(apiClient.unbindLineGroup).mockResolvedValueOnce(undefined);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUnbindLineGroup(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(false);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.unbindLineGroup).toHaveBeenCalledWith(false);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lineBindingKeys.status(),
    });
  });

  it("unbinds test group when isTest=true", async () => {
    vi.mocked(apiClient.unbindLineGroup).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useUnbindLineGroup(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(true);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.unbindLineGroup).toHaveBeenCalledWith(true);
  });
});

// =============================================================================
// useRegisteredMembers
// =============================================================================

describe("useRegisteredMembers", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches registered members when enabled=true", async () => {
    vi.mocked(apiClient.getRegisteredMembers).mockResolvedValueOnce(
      mockRegisteredMembersResponse
    );

    const { result } = renderHook(
      () => useRegisteredMembers(true),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockRegisteredMembersResponse);
    expect(apiClient.getRegisteredMembers).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when enabled=false", () => {
    const { result } = renderHook(
      () => useRegisteredMembers(false),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getRegisteredMembers).not.toHaveBeenCalled();
  });

  it("fetches by default (enabled defaults to true)", async () => {
    vi.mocked(apiClient.getRegisteredMembers).mockResolvedValueOnce(
      mockRegisteredMembersResponse
    );

    const { result } = renderHook(
      () => useRegisteredMembers(),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getRegisteredMembers).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// useLineCustomCommands
// =============================================================================

describe("useLineCustomCommands", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches custom commands when enabled=true", async () => {
    vi.mocked(apiClient.getLineCustomCommands).mockResolvedValueOnce([
      mockCustomCommand,
    ]);

    const { result } = renderHook(
      () => useLineCustomCommands(true),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockCustomCommand]);
  });

  it("does not fetch when enabled=false", () => {
    const { result } = renderHook(
      () => useLineCustomCommands(false),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getLineCustomCommands).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useCreateLineCustomCommand
// =============================================================================

describe("useCreateLineCustomCommand", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("creates a command and invalidates commands cache", async () => {
    vi.mocked(apiClient.createLineCustomCommand).mockResolvedValueOnce(
      mockCustomCommand
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateLineCustomCommand(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        command_name: "查詢戰功",
        trigger_keyword: "戰功",
        response_message: "您的本週戰功為 {merit}",
        is_enabled: true,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lineBindingKeys.commands(),
    });
  });
});

// =============================================================================
// useUpdateLineCustomCommand
// =============================================================================

describe("useUpdateLineCustomCommand", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("updates a command and invalidates commands cache", async () => {
    const updatedCommand = { ...mockCustomCommand, is_enabled: false };
    vi.mocked(apiClient.updateLineCustomCommand).mockResolvedValueOnce(
      updatedCommand
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateLineCustomCommand(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        commandId: "cmd-1",
        data: { is_enabled: false },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.updateLineCustomCommand).toHaveBeenCalledWith("cmd-1", {
      is_enabled: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lineBindingKeys.commands(),
    });
  });
});

// =============================================================================
// useDeleteLineCustomCommand
// =============================================================================

describe("useDeleteLineCustomCommand", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("deletes a command and invalidates commands cache", async () => {
    vi.mocked(apiClient.deleteLineCustomCommand).mockResolvedValueOnce(
      undefined
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteLineCustomCommand(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("cmd-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.deleteLineCustomCommand).toHaveBeenCalledWith("cmd-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lineBindingKeys.commands(),
    });
  });
});

// =============================================================================
// useCountdown
// =============================================================================

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null values when expiresAt is undefined", () => {
    const { result } = renderHook(() => useCountdown(undefined));

    expect(result.current.remainingSeconds).toBeNull();
    expect(result.current.formatted).toBeNull();
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isUrgent).toBe(false);
  });

  it("computes initial remaining seconds from expiresAt", () => {
    // Set a fixed 'now' for deterministic test
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt = new Date("2026-01-01T00:05:00Z").toISOString(); // 5 minutes from now

    const { result } = renderHook(() => useCountdown(expiresAt));

    expect(result.current.remainingSeconds).toBe(300);
    expect(result.current.formatted).toBe("05:00");
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isUrgent).toBe(false);
  });

  it("decrements every second via interval", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt = new Date("2026-01-01T00:05:00Z").toISOString();

    const { result } = renderHook(() => useCountdown(expiresAt));

    expect(result.current.remainingSeconds).toBe(300);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remainingSeconds).toBe(299);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.remainingSeconds).toBe(295);
  });

  it("formats correctly as MM:SS", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt = new Date("2026-01-01T00:01:05Z").toISOString(); // 1 min 5 sec

    const { result } = renderHook(() => useCountdown(expiresAt));

    expect(result.current.formatted).toBe("01:05");
  });

  it("marks isUrgent when under 60 seconds remain", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt = new Date("2026-01-01T00:00:59Z").toISOString(); // 59 seconds

    const { result } = renderHook(() => useCountdown(expiresAt));

    expect(result.current.isUrgent).toBe(true);
    expect(result.current.isExpired).toBe(false);
  });

  it("marks isExpired and stops interval at zero", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt = new Date("2026-01-01T00:00:02Z").toISOString(); // 2 seconds

    const { result } = renderHook(() => useCountdown(expiresAt));

    expect(result.current.remainingSeconds).toBe(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isExpired).toBe(true);
    expect(result.current.formatted).toBe("00:00");
  });

  it("treats already-expired timestamps as 0", () => {
    const now = new Date("2026-01-01T01:00:00Z");
    vi.setSystemTime(now);

    // expires_at is in the past
    const expiresAt = new Date("2026-01-01T00:00:00Z").toISOString();

    const { result } = renderHook(() => useCountdown(expiresAt));

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it("resets when expiresAt changes", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt1 = new Date("2026-01-01T00:05:00Z").toISOString();
    const expiresAt2 = new Date("2026-01-01T00:10:00Z").toISOString();

    const { result, rerender } = renderHook(
      ({ expiresAt }: { expiresAt: string }) => useCountdown(expiresAt),
      { initialProps: { expiresAt: expiresAt1 } }
    );

    expect(result.current.remainingSeconds).toBe(300);

    rerender({ expiresAt: expiresAt2 });

    expect(result.current.remainingSeconds).toBe(600);
  });

  it("resets to null when expiresAt becomes undefined", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const expiresAt = new Date("2026-01-01T00:05:00Z").toISOString();

    const { result, rerender } = renderHook(
      ({ expiresAt }: { expiresAt: string | undefined }) =>
        useCountdown(expiresAt),
      { initialProps: { expiresAt } as { expiresAt: string | undefined } }
    );

    expect(result.current.remainingSeconds).toBe(300);

    rerender({ expiresAt: undefined });

    expect(result.current.remainingSeconds).toBeNull();
    expect(result.current.formatted).toBeNull();
  });
});

// =============================================================================
// useCopyToClipboard
// =============================================================================

describe("useCopyToClipboard", () => {
  let originalClipboard: Clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it("starts with copied=false", () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);
  });

  it("sets copied=true on successful copy", async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useCopyToClipboard());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy("hello");
    });

    expect(success).toBe(true);
    expect(result.current.copied).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("resets copied=false after 2 seconds", async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("hello");
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copied).toBe(false);
  });

  it("returns false and does not set copied on clipboard failure", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Clipboard not available")
    );

    const { result } = renderHook(() => useCopyToClipboard());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy("hello");
    });

    expect(success).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("copies the correct text to clipboard", async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("BINDING_CODE_XYZ");
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "BINDING_CODE_XYZ"
    );
  });
});
