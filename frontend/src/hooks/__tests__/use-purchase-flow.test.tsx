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
      createMockStatus({ available_seasons: 2 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(2);
    });

    expect(result.current.state).toBe("pending");
  });

  it("transitions pending → granted when quota strictly exceeds baseline", async () => {
    // Baseline = 2; first poll returns 3 → grant confirmed.
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ available_seasons: 3 }),
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

  it("stays pending when quota equals baseline (grant not yet landed)", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ available_seasons: 2 }),
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

  it("redirect path (baseline=null) grants on any positive count", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ available_seasons: 1 }),
    );

    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.startPolling(null);
    });

    await waitFor(() => expect(result.current.state).toBe("granted"));
  });

  it("redirect path stays pending when quota is zero", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ available_seasons: 0 }),
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
      createMockStatus({ available_seasons: 2 }),
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

  it("reset() returns state to idle", async () => {
    queryClient.setQueryData(
      seasonQuotaKeys.status(),
      createMockStatus({ available_seasons: 3 }),
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
