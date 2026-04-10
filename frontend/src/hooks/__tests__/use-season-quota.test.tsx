import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
  useSeasonQuota,
  useQuotaWarning,
  seasonQuotaKeys,
} from "../use-season-quota";
import { createWrapper, createTestQueryClient, createMockSeasonQuotaStatus as createMockStatus } from "../../__tests__/test-utils";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getSeasonQuotaStatus: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

// =============================================================================
// seasonQuotaKeys
// =============================================================================

describe("seasonQuotaKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(seasonQuotaKeys.all).toEqual(["season-quota"]);
    expect(seasonQuotaKeys.status()).toEqual(["season-quota", "status"]);
  });
});

// =============================================================================
// useSeasonQuota
// =============================================================================

describe("useSeasonQuota", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches quota status", async () => {
    const mockStatus = createMockStatus({ purchased_seasons: 5 });
    vi.mocked(apiClient.getSeasonQuotaStatus).mockResolvedValueOnce(mockStatus);

    const { result } = renderHook(() => useSeasonQuota(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockStatus);
  });
});

// =============================================================================
// useQuotaWarning (delegates to getQuotaDisplayState)
// =============================================================================

describe("useQuotaWarning", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("returns defaults when no data", () => {
    const { result } = renderHook(() => useQuotaWarning(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toEqual({
      level: "none",
      message: null,
      isExpired: true, // loading state: both canWrite and canActivate are false
      trialDaysRemaining: null,
      availableSeasons: 0,
    });
  });

  it("returns expired state", () => {
    const mockStatus = createMockStatus({
      can_write: false,
      can_activate_season: false,
      current_season_is_trial: true,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useQuotaWarning(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.level).toBe("expired");
    expect(result.current.isExpired).toBe(true);
    expect(result.current.message).toBe(
      "試用期已結束，購買後自動升級為正式版"
    );
  });

  it("returns critical state for trial with 2 days", () => {
    const mockStatus = createMockStatus({
      current_season_is_trial: true,
      trial_days_remaining: 2,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useQuotaWarning(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.level).toBe("critical");
    expect(result.current.isExpired).toBe(false);
    expect(result.current.message).toBe(
      "試用期剩餘 2 天，購買後自動升級為正式版"
    );
    expect(result.current.trialDaysRemaining).toBe(2);
  });

  it("returns none for healthy purchased status", () => {
    const mockStatus = createMockStatus({
      purchased_seasons: 5,
      available_seasons: 3,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useQuotaWarning(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.level).toBe("none");
    expect(result.current.message).toBeNull();
    expect(result.current.availableSeasons).toBe(3);
  });
});
