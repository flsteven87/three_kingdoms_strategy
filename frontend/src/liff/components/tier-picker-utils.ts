/**
 * Pure helpers for TierPicker. Lives outside the component file so HMR/fast
 * refresh stays clean and helpers can be unit-tested in isolation.
 */

import type { CopperMineRule } from "../lib/liff-api-client";

export type TierStatus =
  | { kind: "available" }
  | { kind: "claimed"; mineLabel: string }
  | { kind: "merit-insufficient"; currentMerit: number }
  | { kind: "level-mismatch"; coordLevel: number };

export interface TierOption {
  rule: CopperMineRule;
  status: TierStatus;
}

/**
 * Compute tier statuses for a given context. Pure helper so callers can
 * derive options once and the picker stays presentational.
 */
export function buildTierOptions(args: {
  rules: readonly CopperMineRule[];
  claimedTiers: ReadonlySet<number>;
  claimedMineLabels: ReadonlyMap<number, string>;
  currentMerit: number | null;
  coordLevel: number | null;
}): TierOption[] {
  const { rules, claimedTiers, claimedMineLabels, currentMerit, coordLevel } = args;
  return rules
    .slice()
    .sort((a, b) => a.tier - b.tier)
    .map((rule): TierOption => {
      if (claimedTiers.has(rule.tier)) {
        return {
          rule,
          status: {
            kind: "claimed",
            mineLabel: claimedMineLabels.get(rule.tier) ?? "已申請",
          },
        };
      }
      if (currentMerit !== null && currentMerit < rule.required_merit) {
        return {
          rule,
          status: { kind: "merit-insufficient", currentMerit },
        };
      }
      if (coordLevel !== null) {
        const ok =
          rule.allowed_level === "both" ||
          (rule.allowed_level === "nine" && coordLevel === 9) ||
          (rule.allowed_level === "ten" && coordLevel === 10);
        if (!ok) {
          return {
            rule,
            status: { kind: "level-mismatch", coordLevel },
          };
        }
      }
      return { rule, status: { kind: "available" } };
    });
}

/**
 * Derive the canonical level (9 or 10) for a given tier rule + coord lookup.
 * Returns null when the tier allows both and we have no coord-source level.
 */
export function deriveLevelForTier(
  rule: CopperMineRule,
  coordLevel: number | null,
): number | null {
  if (rule.allowed_level === "nine") return 9;
  if (rule.allowed_level === "ten") return 10;
  if (coordLevel !== null) return coordLevel;
  return null;
}
