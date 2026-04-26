import { describe, it, expect } from "vitest";
import {
  buildTierOptions,
  deriveLevelForTier,
} from "../tier-picker-utils";
import type { CopperMineRule } from "../../lib/liff-api-client";

const rule = (
  tier: number,
  required_merit: number,
  allowed_level: CopperMineRule["allowed_level"],
): CopperMineRule => ({ tier, required_merit, allowed_level });

const RULES: CopperMineRule[] = [
  rule(1, 0, "nine"),
  rule(2, 50_000, "ten"),
  rule(3, 100_000, "ten"),
  rule(4, 200_000, "ten"),
];

describe("buildTierOptions", () => {
  it("marks tiers in claimedTiers as claimed with the supplied label", () => {
    const options = buildTierOptions({
      rules: RULES,
      claimedTiers: new Set([2]),
      claimedMineLabels: new Map([[2, "(123,456) Lv.10"]]),
      currentMerit: 500_000,
      coordLevel: null,
    });
    const tier2 = options.find((o) => o.rule.tier === 2)!;
    expect(tier2.status.kind).toBe("claimed");
    if (tier2.status.kind === "claimed") {
      expect(tier2.status.mineLabel).toBe("(123,456) Lv.10");
    }
  });

  it("marks tiers above current merit as merit-insufficient", () => {
    const options = buildTierOptions({
      rules: RULES,
      claimedTiers: new Set(),
      claimedMineLabels: new Map(),
      currentMerit: 80_000,
      coordLevel: null,
    });
    expect(options.find((o) => o.rule.tier === 2)?.status.kind).toBe("available");
    expect(options.find((o) => o.rule.tier === 3)?.status.kind).toBe(
      "merit-insufficient",
    );
    expect(options.find((o) => o.rule.tier === 4)?.status.kind).toBe(
      "merit-insufficient",
    );
  });

  it("marks tiers whose allowed_level conflicts with coord source as level-mismatch", () => {
    const options = buildTierOptions({
      rules: RULES,
      claimedTiers: new Set(),
      claimedMineLabels: new Map(),
      currentMerit: 500_000,
      coordLevel: 10,
    });
    expect(options.find((o) => o.rule.tier === 1)?.status.kind).toBe(
      "level-mismatch",
    );
    expect(options.find((o) => o.rule.tier === 2)?.status.kind).toBe("available");
  });

  it("treats unknown merit (null) as no merit gate", () => {
    const options = buildTierOptions({
      rules: RULES,
      claimedTiers: new Set(),
      claimedMineLabels: new Map(),
      currentMerit: null,
      coordLevel: null,
    });
    expect(options.every((o) => o.status.kind === "available")).toBe(true);
  });

  it("sorts result by tier ascending regardless of input order", () => {
    const options = buildTierOptions({
      rules: [rule(4, 200_000, "ten"), rule(1, 0, "nine"), rule(2, 50_000, "ten")],
      claimedTiers: new Set(),
      claimedMineLabels: new Map(),
      currentMerit: 500_000,
      coordLevel: null,
    });
    expect(options.map((o) => o.rule.tier)).toEqual([1, 2, 4]);
  });
});

describe("deriveLevelForTier", () => {
  it("returns 9 for nine-only tiers regardless of coord", () => {
    expect(deriveLevelForTier(rule(1, 0, "nine"), 10)).toBe(9);
  });

  it("returns 10 for ten-only tiers regardless of coord", () => {
    expect(deriveLevelForTier(rule(2, 50_000, "ten"), 9)).toBe(10);
  });

  it("falls back to coord level when tier allows both", () => {
    expect(deriveLevelForTier(rule(1, 0, "both"), 9)).toBe(9);
    expect(deriveLevelForTier(rule(1, 0, "both"), 10)).toBe(10);
  });

  it("returns null when tier allows both and no coord level is known", () => {
    expect(deriveLevelForTier(rule(1, 0, "both"), null)).toBeNull();
  });
});
