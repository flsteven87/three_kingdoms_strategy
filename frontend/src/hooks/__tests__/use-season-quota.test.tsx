import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
  useSeasonQuota,
  useCanActivateSeason,
  useAvailableSeasons,
  useQuotaWarning,
  useSeasonQuotaDisplay,
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
// useCanActivateSeason
// =============================================================================

describe("useCanActivateSeason", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("returns true when can activate", () => {
    const mockStatus = createMockStatus({ can_activate_season: true });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useCanActivateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toBe(true);
  });

  it("returns false when cannot activate", () => {
    const mockStatus = createMockStatus({ can_activate_season: false });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useCanActivateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toBe(false);
  });

  it("returns false when data not loaded", () => {
    const { result } = renderHook(() => useCanActivateSeason(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toBe(false);
  });
});

// =============================================================================
// useAvailableSeasons
// =============================================================================

describe("useAvailableSeasons", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("returns available count from data", () => {
    const mockStatus = createMockStatus({ available_seasons: 7 });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useAvailableSeasons(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toBe(7);
  });

  it("returns 0 when data not loaded", () => {
    const { result } = renderHook(() => useAvailableSeasons(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toBe(0);
  });
});

// =============================================================================
// useQuotaWarning
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
      isExpired: false,
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
    expect(result.current.message).toBe("試用期已結束，歡迎購買賽季繼續使用");
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
    expect(result.current.message).toBe("試用期剩餘 2 天");
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

// =============================================================================
// useSeasonQuotaDisplay
// =============================================================================

describe("useSeasonQuotaDisplay", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("returns loading state when no data", () => {
    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("載入中...");
    expect(result.current.statusColor).toBe("gray");
    expect(result.current.canActivate).toBe(false);
    expect(result.current.canWrite).toBe(false);
  });

  it("returns trial available state", () => {
    const mockStatus = createMockStatus({
      has_trial_available: true,
      can_activate_season: true,
      can_write: true,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("可免費試用");
    expect(result.current.statusColor).toBe("green");
    expect(result.current.hasTrialAvailable).toBe(true);
  });

  it("returns trial in progress with days", () => {
    const mockStatus = createMockStatus({
      current_season_is_trial: true,
      trial_days_remaining: 10,
      can_activate_season: true,
      can_write: true,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("試用中 (10 天)");
    expect(result.current.statusColor).toBe("green");
  });

  it("returns yellow for trial with 3 days or less", () => {
    const mockStatus = createMockStatus({
      current_season_is_trial: true,
      trial_days_remaining: 2,
      can_activate_season: true,
      can_write: true,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("試用中 (2 天)");
    expect(result.current.statusColor).toBe("yellow");
  });

  it("returns remaining seasons count", () => {
    const mockStatus = createMockStatus({
      available_seasons: 5,
      can_activate_season: true,
      can_write: true,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("剩餘 5 季");
    expect(result.current.statusColor).toBe("green");
  });

  it("returns generic usable state", () => {
    const mockStatus = createMockStatus({
      can_activate_season: true,
      can_write: true,
      available_seasons: 0,
      has_trial_available: false,
      current_season_is_trial: false,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("可使用");
    expect(result.current.statusColor).toBe("green");
  });

  it("returns trial expired state", () => {
    const mockStatus = createMockStatus({
      can_write: false,
      can_activate_season: false,
      current_season_is_trial: true,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("試用已過期");
    expect(result.current.statusColor).toBe("red");
  });

  it("returns need purchase state for non-trial", () => {
    const mockStatus = createMockStatus({
      can_write: false,
      can_activate_season: false,
      current_season_is_trial: false,
    });
    queryClient.setQueryData(seasonQuotaKeys.status(), mockStatus);

    const { result } = renderHook(() => useSeasonQuotaDisplay(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("需購買賽季");
    expect(result.current.statusColor).toBe("red");
  });
});
