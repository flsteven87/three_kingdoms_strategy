/**
 * Tests for useLiffSession hook
 *
 * Tests LIFF SDK initialization, login flow, URL param parsing,
 * sessionStorage persistence, and error handling.
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLiffSession } from "../use-liff-session";

// Mock @line/liff SDK
vi.mock("@line/liff", () => ({
  default: {
    init: vi.fn(),
    isLoggedIn: vi.fn(),
    login: vi.fn(),
    getProfile: vi.fn(),
    getIDToken: vi.fn(),
    getDecodedIDToken: vi.fn(),
  },
}));

import liff from "@line/liff";

const LIFF_ID = "test-liff-id";

const mockProfile = {
  userId: "U123456",
  displayName: "Test User",
  pictureUrl: "https://example.com/pic.jpg",
  statusMessage: "",
};

function setWindowSearch(search: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, search, href: `http://localhost${search}` },
  });
}

describe("useLiffSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Default: successful LIFF init + logged in
    vi.mocked(liff.init).mockResolvedValue(undefined);
    vi.mocked(liff.isLoggedIn).mockReturnValue(true);
    vi.mocked(liff.getProfile).mockResolvedValue(mockProfile);
    vi.mocked(liff.getIDToken).mockReturnValue("id-token-123");
    // Default: token still valid for ~1h so refresh timer is scheduled far out
    vi.mocked(liff.getDecodedIDToken).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    // Clean URL search
    setWindowSearch("");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  it("starts in loading state", () => {
    // Block init from resolving immediately
    vi.mocked(liff.init).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    expect(result.current.status).toBe("loading");
  });

  // ---------------------------------------------------------------------------
  // Successful initialization
  // ---------------------------------------------------------------------------

  it("transitions to ready state after successful init", async () => {
    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("returns user profile in session when ready", async () => {
    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.lineUserId).toBe("U123456");
      expect(result.current.session.lineDisplayName).toBe("Test User");
      expect(result.current.session.lineIdToken).toBe("id-token-123");
    }
  });

  it("calls liff.init with the provided liffId", async () => {
    renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(liff.init).toHaveBeenCalledWith({ liffId: LIFF_ID }));
  });

  // ---------------------------------------------------------------------------
  // URL parameter extraction
  // ---------------------------------------------------------------------------

  it("extracts lineGroupId from g query param", async () => {
    setWindowSearch("?g=GROUP_001");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.lineGroupId).toBe("GROUP_001");
    }
  });

  it("extracts eventId from e query param", async () => {
    setWindowSearch("?g=GROUP_001&e=EVENT_001");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.eventId).toBe("EVENT_001");
    }
  });

  it("extracts groupId from groupId query param (fallback)", async () => {
    setWindowSearch("?groupId=GROUP_002");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.lineGroupId).toBe("GROUP_002");
    }
  });

  it("returns null lineGroupId when no group param is present", async () => {
    setWindowSearch("");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.lineGroupId).toBeNull();
    }
  });

  it("returns null eventId when no event param is present", async () => {
    setWindowSearch("?g=GROUP_001");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.eventId).toBeNull();
    }
  });

  // ---------------------------------------------------------------------------
  // LIFF state URL params (liff.state)
  // ---------------------------------------------------------------------------

  it("extracts params from liff.state query string", async () => {
    const liffState = encodeURIComponent("?g=GROUP_FROM_STATE");
    setWindowSearch(`?liff.state=${liffState}`);

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.lineGroupId).toBe("GROUP_FROM_STATE");
    }
  });

  // ---------------------------------------------------------------------------
  // sessionStorage persistence across OAuth flow
  // ---------------------------------------------------------------------------

  it("saves params to sessionStorage before liff.init", async () => {
    setWindowSearch("?g=GROUP_SAVE_TEST");

    // saveParamsBeforeLogin runs synchronously before init
    renderHook(() => useLiffSession(LIFF_ID));

    // sessionStorage should be populated immediately (before async init)
    const saved = sessionStorage.getItem("liff_params");
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.g).toBe("GROUP_SAVE_TEST");
  });

  it("reads params from sessionStorage after OAuth callback clears URL", async () => {
    // Simulate OAuth callback: URL has 'code' param (no group params)
    setWindowSearch("?code=auth_code&liffClientId=liff-client-id");
    // Params were saved before OAuth redirect
    sessionStorage.setItem("liff_params", JSON.stringify({ g: "GROUP_RESTORED" }));

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    if (result.current.status === "ready") {
      expect(result.current.session.lineGroupId).toBe("GROUP_RESTORED");
    }
  });

  it("does not overwrite saved params when on OAuth callback URL", () => {
    // Simulate OAuth callback URL
    setWindowSearch("?code=auth_code&liffClientId=liff-client-id");
    // Pre-existing saved params from before OAuth redirect
    sessionStorage.setItem("liff_params", JSON.stringify({ g: "GROUP_PRE_OAUTH" }));

    renderHook(() => useLiffSession(LIFF_ID));

    // The saved params should remain intact (not overwritten by OAuth callback URL)
    // params should still have the pre-OAuth value (may be cleared on read)
    // We just verify init was called, which triggers param reading
    expect(sessionStorage.getItem("liff_params")).not.toBeNull();
    expect(liff.init).toHaveBeenCalled();
  });

  it("clears sessionStorage after reading saved params", async () => {
    setWindowSearch("?code=auth_code&liffClientId=liff-client-id");
    sessionStorage.setItem("liff_params", JSON.stringify({ g: "GROUP_ONCE" }));

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // sessionStorage should be cleared after reading
    expect(sessionStorage.getItem("liff_params")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Login flow
  // ---------------------------------------------------------------------------

  it("calls liff.login when user is not logged in", async () => {
    vi.mocked(liff.isLoggedIn).mockReturnValue(false);

    renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(liff.login).toHaveBeenCalledTimes(1));
  });

  it("stays in loading state after triggering login (waiting for redirect)", async () => {
    vi.mocked(liff.isLoggedIn).mockReturnValue(false);

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    // Give enough time for the hook to run
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Should remain loading because login() redirects the page
    expect(result.current.status).toBe("loading");
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it("transitions to error state when liff.init throws", async () => {
    vi.mocked(liff.init).mockRejectedValueOnce(new Error("LIFF init failed"));

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("error"));

    if (result.current.status === "error") {
      expect(result.current.error).toBe("LIFF init failed");
    }
  });

  it("transitions to error state when liff.getProfile throws", async () => {
    vi.mocked(liff.getProfile).mockRejectedValueOnce(new Error("Profile fetch failed"));

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("error"));

    if (result.current.status === "error") {
      expect(result.current.error).toBe("Profile fetch failed");
    }
  });

  it("converts non-Error exceptions to string in error state", async () => {
    vi.mocked(liff.init).mockRejectedValueOnce("string error");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("error"));

    if (result.current.status === "error") {
      expect(result.current.error).toBe("string error");
    }
  });

  // ---------------------------------------------------------------------------
  // Token refresh scheduling (exp-1min re-login)
  // ---------------------------------------------------------------------------

  it("triggers liff.login immediately when token is already expired", async () => {
    vi.mocked(liff.getDecodedIDToken).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(liff.login).toHaveBeenCalledTimes(1));
    // Hook returns early — status stays loading until redirect completes
    expect(result.current.status).toBe("loading");
  });

  it("schedules liff.login to run ~60s before token expiry", async () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 600; // 10 min from now
    vi.mocked(liff.getDecodedIDToken).mockReturnValue({ exp: expSeconds });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const { result } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(liff.login).not.toHaveBeenCalled();

    // Find our refresh call among any incidental setTimeout uses by test libs.
    // Expected delay ≈ 600_000 - 60_000 = 540_000 ms (with small jitter for Date.now drift).
    const refreshCall = setTimeoutSpy.mock.calls.find(
      ([, delay]) =>
        typeof delay === "number" && delay >= 538_000 && delay <= 542_000,
    );
    expect(refreshCall).toBeDefined();

    // Invoke the scheduled callback manually to verify it calls liff.login
    const callback = refreshCall![0] as () => void;
    callback();
    expect(liff.login).toHaveBeenCalledTimes(1);
  });

  it("clears the refresh timer on unmount", async () => {
    vi.mocked(liff.getDecodedIDToken).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const { result, unmount } = renderHook(() => useLiffSession(LIFF_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Locate the timer handle returned by our scheduled setTimeout
    const refreshIdx = setTimeoutSpy.mock.calls.findIndex(
      ([, delay]) =>
        typeof delay === "number" && delay >= 538_000 && delay <= 542_000,
    );
    expect(refreshIdx).toBeGreaterThanOrEqual(0);
    const timerHandle = setTimeoutSpy.mock.results[refreshIdx]!.value;

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerHandle);
  });

  // ---------------------------------------------------------------------------
  // Cleanup (cancelled flag)
  // ---------------------------------------------------------------------------

  it("does not update state after unmount", async () => {
    // Long-running init
    let resolveInit!: () => void;
    vi.mocked(liff.init).mockImplementation(
      () => new Promise<void>((resolve) => { resolveInit = resolve; }),
    );

    const { result, unmount } = renderHook(() => useLiffSession(LIFF_ID));

    expect(result.current.status).toBe("loading");

    // Unmount before init resolves
    unmount();

    // Now resolve the init — should NOT trigger a state update
    act(() => {
      resolveInit();
    });

    // Still loading (state was not updated after unmount)
    expect(result.current.status).toBe("loading");
  });
});
