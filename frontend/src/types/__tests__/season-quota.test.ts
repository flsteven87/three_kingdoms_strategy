import { describe, it, expect } from "vitest";
import { getQuotaWarningLevel, getQuotaWarningMessage } from "../season-quota";
import { createMockSeasonQuotaStatus as createStatus } from "../../__tests__/test-utils";

// =============================================================================
// getQuotaWarningLevel
// =============================================================================

describe("getQuotaWarningLevel", () => {
  it("returns 'none' for null input", () => {
    expect(getQuotaWarningLevel(null)).toBe("none");
  });

  it("returns 'none' for undefined input", () => {
    expect(getQuotaWarningLevel(undefined)).toBe("none");
  });

  it("returns 'expired' when can_write and can_activate are both false", () => {
    const status = createStatus({
      can_write: false,
      can_activate_season: false,
    });
    expect(getQuotaWarningLevel(status)).toBe("expired");
  });

  it("returns 'expired' when trial days remaining is 0", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 0,
      can_write: true,
      can_activate_season: true,
    });
    expect(getQuotaWarningLevel(status)).toBe("expired");
  });

  it("returns 'critical' when trial days remaining is 1", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 1,
    });
    expect(getQuotaWarningLevel(status)).toBe("critical");
  });

  it("returns 'critical' when trial days remaining is 3", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 3,
    });
    expect(getQuotaWarningLevel(status)).toBe("critical");
  });

  it("returns 'warning' when trial days remaining is 5", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 5,
    });
    expect(getQuotaWarningLevel(status)).toBe("warning");
  });

  it("returns 'warning' when trial days remaining is 7", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 7,
    });
    expect(getQuotaWarningLevel(status)).toBe("warning");
  });

  it("returns 'none' when trial days remaining is 10", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 10,
    });
    expect(getQuotaWarningLevel(status)).toBe("none");
  });

  it("returns 'none' for non-trial with purchased seasons", () => {
    const status = createStatus({
      purchased_seasons: 5,
      available_seasons: 3,
      current_season_is_trial: false,
    });
    expect(getQuotaWarningLevel(status)).toBe("none");
  });

  it("returns 'none' when can_write=false but can_activate=true", () => {
    const status = createStatus({
      can_write: false,
      can_activate_season: true,
    });
    expect(getQuotaWarningLevel(status)).toBe("none");
  });
});

// =============================================================================
// getQuotaWarningMessage
// =============================================================================

describe("getQuotaWarningMessage", () => {
  it("returns null for null input", () => {
    expect(getQuotaWarningMessage(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(getQuotaWarningMessage(undefined)).toBeNull();
  });

  it("returns trial expired message when trial season is expired", () => {
    const status = createStatus({
      can_write: false,
      can_activate_season: false,
      current_season_is_trial: true,
    });
    expect(getQuotaWarningMessage(status)).toBe(
      "試用期已結束，歡迎購買賽季繼續使用"
    );
  });

  it("returns no-seasons message when non-trial is expired", () => {
    const status = createStatus({
      can_write: false,
      can_activate_season: false,
      current_season_is_trial: false,
    });
    expect(getQuotaWarningMessage(status)).toBe(
      "目前沒有可用賽季，歡迎購買以繼續使用"
    );
  });

  it("returns days remaining for warning level", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 5,
    });
    expect(getQuotaWarningMessage(status)).toBe("試用期剩餘 5 天");
  });

  it("returns days remaining for critical level", () => {
    const status = createStatus({
      current_season_is_trial: true,
      trial_days_remaining: 2,
    });
    expect(getQuotaWarningMessage(status)).toBe("試用期剩餘 2 天");
  });

  it("returns null for 'none' level", () => {
    const status = createStatus({
      purchased_seasons: 5,
      available_seasons: 3,
    });
    expect(getQuotaWarningMessage(status)).toBeNull();
  });
});
