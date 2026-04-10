import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

import { usePurchaseFlow } from "../use-purchase-flow";
import { seasonQuotaKeys } from "../use-season-quota";
import {
  createMockSeasonQuotaStatus as createMockStatus,
  createTestQueryClient,
  createWrapper,
} from "../../__tests__/test-utils";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getSeasonQuotaStatus: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

describe("usePurchaseFlow", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    queryClient = createTestQueryClient();
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.state).toBe("idle");
  });

  it("transitions idle → pending when startPolling is called", () => {
    vi.mocked(apiClient.getSeasonQuotaStatus).mockResolvedValue(
      createMockStatus({ purchased_seasons: 2, available_seasons: 2 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(2);
    });

    expect(result.current.state).toBe("pending");
  });

  it("transitions pending → granted when purchased_seasons exceeds baseline", async () => {
    // Baseline = 2; quota shows purchased_seasons=3 → grant confirmed.
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ purchased_seasons: 3, available_seasons: 3 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(2);
    });

    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.availableSeasons).toBe(3);
  });

  it("stays pending when purchased_seasons equals baseline", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ purchased_seasons: 2, available_seasons: 2 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(2);
    });

    // Give React a tick to flush any state updates.
    await waitFor(() => expect(result.current.state).toBe("pending"));
    expect(result.current.state).toBe("pending");
  });

  it("redirect path (baseline=null) grants on any positive purchased_seasons", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ purchased_seasons: 1, available_seasons: 1 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(null);
    });

    await waitFor(() => expect(result.current.state).toBe("granted"));
  });

  it("redirect path stays pending when purchased_seasons is zero", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ purchased_seasons: 0, available_seasons: 0 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(null);
    });

    await waitFor(() => expect(result.current.state).toBe("pending"));
    expect(result.current.state).toBe("pending");
  });

  it("flips pending → timeout after 30s without a grant", () => {
    vi.useFakeTimers();
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ purchased_seasons: 2, available_seasons: 2 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(2); // baseline = current → never grants
    });
    expect(result.current.state).toBe("pending");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.state).toBe("timeout");
    vi.useRealTimers();
  });

  it("detects trialConverted on modal path (wasTrialRef accurate)", async () => {
    // Pre-purchase: user is on trial
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({
        purchased_seasons: 0,
        current_season_is_trial: true,
        trial_days_remaining: 5,
      }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    // Start polling — wasTrialRef captures current_season_is_trial=true
    act(() => {
      result.current.startPolling(0);
    });

    // Webhook processed: trial converted, purchased=1, is_trial now false
    act(() => {
      queryClient.setQueryData(
        seasonQuotaKeys.status(),
        createMockStatus({
          purchased_seasons: 1,
          used_seasons: 1,
          available_seasons: 0,
          current_season_is_trial: false,
        }),
      );
    });

    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.trialConverted).toBe(true);
  });

  it("detects trialConverted on redirect path when quota loads after startPolling", async () => {
    // Redirect path: page loads fresh, quota not in cache yet.
    // Mock the API to return the post-conversion state (simulating webhook
    // already processed before the page polls).
    const postConversionStatus = createMockStatus({
      purchased_seasons: 1,
      used_seasons: 1,
      available_seasons: 0,
      current_season_is_trial: false,
    });
    vi.mocked(apiClient.getSeasonQuotaStatus).mockResolvedValue(postConversionStatus);

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    // Start polling with no baseline — quota not loaded yet
    act(() => {
      result.current.startPolling(null);
    });
    expect(result.current.state).toBe("pending");

    // Key: redirect heuristic detects conversion even without wasTrialRef.
    await waitFor(() => {
      expect(result.current.state).toBe("granted");
      expect(result.current.trialConverted).toBe(true);
    });
  });

  it("does NOT detect trialConverted on redirect for non-trial purchase", async () => {
    // Non-trial user buys: purchased=2, used=1, available=1
    // available > 0 means this is NOT a trial conversion.
    vi.mocked(apiClient.getSeasonQuotaStatus).mockResolvedValue(
      createMockStatus({
        purchased_seasons: 2,
        used_seasons: 1,
        available_seasons: 1,
        current_season_is_trial: false,
      }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(null);
    });

    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.trialConverted).toBe(false);
  });

  it("reset() returns state to idle", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ purchased_seasons: 3, available_seasons: 3 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(2);
    });
    await waitFor(() => expect(result.current.state).toBe("granted"));

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toBe("idle");
  });
});
