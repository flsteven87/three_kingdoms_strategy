import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SeasonQuotaGuard } from "../SeasonQuotaGuard";
import { createMockSeasonQuotaStatus } from "@/__tests__/test-utils";
import type { SeasonQuotaStatus } from "@/types/season-quota";

// Mock the hook so tests don't need a full QueryClient provider
vi.mock("@/hooks/use-season-quota", () => ({
  useSeasonQuota: vi.fn(),
}));

import { useSeasonQuota } from "@/hooks/use-season-quota";

// Typed shorthand
function mockQuota(overrides: Partial<SeasonQuotaStatus> = {}) {
  vi.mocked(useSeasonQuota).mockReturnValue({
    data: createMockSeasonQuotaStatus(overrides),
    isLoading: false,
  } as ReturnType<typeof useSeasonQuota>);
}

function mockLoading() {
  vi.mocked(useSeasonQuota).mockReturnValue({
    data: undefined,
    isLoading: true,
  } as ReturnType<typeof useSeasonQuota>);
}

function mockNoData() {
  vi.mocked(useSeasonQuota).mockReturnValue({
    data: undefined,
    isLoading: false,
  } as ReturnType<typeof useSeasonQuota>);
}

// =============================================================================
// SeasonQuotaGuard
// =============================================================================

describe("SeasonQuotaGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Happy path — quota active
  // ---------------------------------------------------------------------------

  it("renders children when can_activate_season is true", () => {
    mockQuota({ can_activate_season: true });

    render(
      <SeasonQuotaGuard>
        <span>protected content</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("renders children when user has purchased seasons available", () => {
    mockQuota({ can_activate_season: true, purchased_seasons: 3, available_seasons: 2 });

    render(
      <SeasonQuotaGuard>
        <p>season data</p>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("season data")).toBeInTheDocument();
  });

  it("renders children during trial period", () => {
    mockQuota({
      can_activate_season: true,
      current_season_is_trial: true,
      trial_days_remaining: 7,
    });

    render(
      <SeasonQuotaGuard>
        <div>trial content</div>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("trial content")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Loading state — children must still render (avoid flash of expired state)
  // ---------------------------------------------------------------------------

  it("renders children while loading quota data", () => {
    mockLoading();

    render(
      <SeasonQuotaGuard>
        <span>loading children</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("loading children")).toBeInTheDocument();
    expect(screen.queryByText("需要購買賽季")).not.toBeInTheDocument();
  });

  it("renders children when data is undefined and not loading", () => {
    mockNoData();

    render(
      <SeasonQuotaGuard>
        <span>pending children</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("pending children")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Quota exhausted — full overlay
  // ---------------------------------------------------------------------------

  it("shows expired overlay and hides children when can_activate_season is false", () => {
    mockQuota({ can_activate_season: false });

    render(
      <SeasonQuotaGuard>
        <span>hidden content</span>
      </SeasonQuotaGuard>
    );

    expect(screen.queryByText("hidden content")).not.toBeInTheDocument();
    expect(screen.getByText("需要購買賽季")).toBeInTheDocument();
  });

  it("shows default expired message in overlay", () => {
    mockQuota({ can_activate_season: false });

    render(
      <SeasonQuotaGuard>
        <span>hidden</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("試用期已結束，請購買賽季以繼續使用。")).toBeInTheDocument();
  });

  it("shows custom expired message when provided", () => {
    mockQuota({ can_activate_season: false });

    render(
      <SeasonQuotaGuard expiredMessage="您的訂閱已過期，請續費。">
        <span>hidden</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("您的訂閱已過期，請續費。")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Known bug: purchase button is disabled (conversion funnel is broken)
  // This test documents current behavior so the bug is visible in CI
  // ---------------------------------------------------------------------------

  it("shows purchase button in disabled state (known bug — button should be enabled)", () => {
    mockQuota({ can_activate_season: false });

    render(
      <SeasonQuotaGuard>
        <span>hidden</span>
      </SeasonQuotaGuard>
    );

    const purchaseButton = screen.getByRole("button", { name: /購買賽季/i });
    // BUG: button is disabled — users cannot navigate to the purchase page
    expect(purchaseButton).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Inline variant
  // ---------------------------------------------------------------------------

  it("shows inline Alert when quota expired and inline prop is true", () => {
    mockQuota({ can_activate_season: false });

    render(
      <SeasonQuotaGuard inline>
        <span>hidden</span>
      </SeasonQuotaGuard>
    );

    // Alert-based inline view uses AlertTitle
    expect(screen.getByText("需要購買賽季")).toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("shows custom inline message via expiredMessage prop", () => {
    mockQuota({ can_activate_season: false });

    render(
      <SeasonQuotaGuard inline expiredMessage="自訂訊息">
        <span>hidden</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("自訂訊息")).toBeInTheDocument();
  });

  it("renders children (not inline alert) when inline is true but quota is active", () => {
    mockQuota({ can_activate_season: true });

    render(
      <SeasonQuotaGuard inline>
        <span>shown content</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("shown content")).toBeInTheDocument();
    // Alert title should not appear
    expect(screen.queryByText("需要購買賽季")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("renders multiple children correctly when quota is active", () => {
    mockQuota({ can_activate_season: true });

    render(
      <SeasonQuotaGuard>
        <span>child one</span>
        <span>child two</span>
      </SeasonQuotaGuard>
    );

    expect(screen.getByText("child one")).toBeInTheDocument();
    expect(screen.getByText("child two")).toBeInTheDocument();
  });
});
