import { describe, it, expect } from "vitest";
import { getQuotaDisplayState } from "../season-quota";
import { createMockSeasonQuotaStatus as createStatus } from "../../__tests__/test-utils";

// =============================================================================
// getQuotaDisplayState
// =============================================================================

describe("getQuotaDisplayState", () => {
  it("returns loading state for null", () => {
    const state = getQuotaDisplayState(null);
    expect(state.phase).toBe("loading");
    expect(state.badgeText).toBe("載入中...");
    expect(state.canActivate).toBe(false);
    expect(state.canWrite).toBe(false);
  });

  it("returns loading state for undefined", () => {
    const state = getQuotaDisplayState(undefined);
    expect(state.phase).toBe("loading");
    expect(state.badgeColor).toBe("gray");
  });

  it("returns trial_available when has_trial_available", () => {
    const state = getQuotaDisplayState(
      createStatus({
        has_trial_available: true,
        can_activate_season: true,
        can_write: true,
      })
    );
    expect(state.phase).toBe("trial_available");
    expect(state.badgeText).toBe("可免費試用");
    expect(state.badgeColor).toBe("green");
    expect(state.settingsLabel).toBe("免費試用（啟用賽季後開始 14 天倒數）");
    expect(state.bannerMessage).toBeNull();
    expect(state.hasTrialAvailable).toBe(true);
  });

  it("returns trial_active for trial with 10 days", () => {
    const state = getQuotaDisplayState(
      createStatus({
        current_season_is_trial: true,
        trial_days_remaining: 10,
        can_write: true,
      })
    );
    expect(state.phase).toBe("trial_active");
    expect(state.badgeText).toBe("試用 10 天");
    expect(state.badgeColor).toBe("green");
    expect(state.bannerMessage).toBeNull();
    expect(state.settingsLabel).toBe("試用中，剩餘 10 天");
  });

  it("returns trial_warning for trial with 5 days", () => {
    const state = getQuotaDisplayState(
      createStatus({
        current_season_is_trial: true,
        trial_days_remaining: 5,
        can_write: true,
      })
    );
    expect(state.phase).toBe("trial_warning");
    expect(state.badgeText).toBe("試用 5 天");
    expect(state.badgeColor).toBe("yellow");
    expect(state.bannerMessage).toBe(
      "試用期剩餘 5 天，購買後自動升級為正式版"
    );
    expect(state.bannerLevel).toBe("warning");
  });

  it("returns trial_critical for trial with 2 days", () => {
    const state = getQuotaDisplayState(
      createStatus({
        current_season_is_trial: true,
        trial_days_remaining: 2,
        can_write: true,
      })
    );
    expect(state.phase).toBe("trial_critical");
    expect(state.badgeText).toBe("試用 2 天");
    expect(state.badgeColor).toBe("red");
    expect(state.bannerMessage).toBe(
      "試用期剩餘 2 天，購買後自動升級為正式版"
    );
    expect(state.bannerLevel).toBe("critical");
  });

  it("returns trial_expired for expired trial", () => {
    const state = getQuotaDisplayState(
      createStatus({
        current_season_is_trial: true,
        trial_days_remaining: 0,
        can_write: false,
        can_activate_season: false,
      })
    );
    expect(state.phase).toBe("trial_expired");
    expect(state.badgeText).toBe("試用已過期");
    expect(state.badgeColor).toBe("red");
    expect(state.bannerMessage).toBe("試用期已結束，購買後自動升級為正式版");
    expect(state.bannerLevel).toBe("expired");
    expect(state.showPurchaseLink).toBe(true);
  });

  it("returns has_quota for purchased seasons", () => {
    const state = getQuotaDisplayState(
      createStatus({
        purchased_seasons: 3,
        available_seasons: 2,
        can_write: true,
        can_activate_season: true,
      })
    );
    expect(state.phase).toBe("has_quota");
    expect(state.badgeText).toBe("剩餘 2 季");
    expect(state.badgeColor).toBe("green");
    expect(state.bannerMessage).toBeNull();
    expect(state.settingsLabel).toBe("已購買 3 季，剩餘 2 季可用");
  });

  it("returns active for can_write with no available (post-conversion)", () => {
    const state = getQuotaDisplayState(
      createStatus({
        purchased_seasons: 1,
        used_seasons: 1,
        available_seasons: 0,
        can_write: true,
        can_activate_season: false,
        current_season_is_trial: false,
      })
    );
    expect(state.phase).toBe("active");
    expect(state.badgeText).toBe("使用中");
    expect(state.badgeColor).toBe("green");
    expect(state.settingsLabel).toBe("已購買 1 季，使用中");
  });

  it("returns quota_exhausted for non-trial with no access", () => {
    const state = getQuotaDisplayState(
      createStatus({
        can_write: false,
        can_activate_season: false,
        current_season_is_trial: false,
      })
    );
    expect(state.phase).toBe("quota_exhausted");
    expect(state.badgeText).toBe("需購買");
    expect(state.badgeColor).toBe("red");
    expect(state.bannerMessage).toBe("賽季額度已用完，購買後可繼續使用");
    expect(state.showPurchaseLink).toBe(true);
  });
});
