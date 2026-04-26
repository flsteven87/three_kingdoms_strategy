/**
 * Tier Picker
 *
 * Lets the user explicitly choose which copper-mine tier slot to claim
 * instead of auto-assigning the lowest eligible one. Required because
 * tier 1 is often `nine`-only and 9-level coords are scarce — users
 * want to skip ahead to a tier that allows 10-level.
 *
 * Each tier row encodes its full state (selectable / claimed / locked-by-merit
 * / locked-by-level) so the user can see at a glance why a tier isn't
 * available without round-tripping to the server.
 */

import { Check, Lock } from "lucide-react";
import type { CopperMineRule } from "../lib/liff-api-client";
import type { TierOption } from "./tier-picker-utils";

interface Props {
  readonly options: readonly TierOption[];
  readonly value: number | null;
  readonly onChange: (tier: number) => void;
  readonly autoPick: boolean;
  readonly onAutoPickChange: (auto: boolean) => void;
}

function formatLevelText(allowedLevel: CopperMineRule["allowed_level"]): string {
  if (allowedLevel === "nine") return "9 級";
  if (allowedLevel === "ten") return "10 級";
  return "9 / 10 級";
}

function formatMerit(merit: number): string {
  return merit.toLocaleString("zh-TW");
}

function describeStatus(option: TierOption): string {
  const { status } = option;
  if (status.kind === "claimed") return `已申請 · ${status.mineLabel}`;
  if (status.kind === "merit-insufficient") {
    return `戰功不足（目前 ${formatMerit(status.currentMerit)}）`;
  }
  if (status.kind === "level-mismatch") {
    return `座標為 Lv.${status.coordLevel}，與此座等級不符`;
  }
  return `戰功 ≥ ${formatMerit(option.rule.required_merit)}`;
}

export function TierPicker({
  options,
  value,
  onChange,
  autoPick,
  onAutoPickChange,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">申請第幾座</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoPick}
            onChange={(e) => onAutoPickChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          自動挑選
        </label>
      </div>

      <div
        role="radiogroup"
        aria-label="申請第幾座銅礦"
        className={`space-y-1.5 ${autoPick ? "pointer-events-none opacity-60" : ""}`}
      >
        {options.map((option) => {
          const tier = option.rule.tier;
          const selected = value === tier;
          const disabled = option.status.kind !== "available";

          const baseRow =
            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors";
          const stateClass = selected
            ? "border-primary bg-primary/10"
            : disabled
              ? "border-border bg-muted/30 cursor-not-allowed"
              : "border-border bg-card hover:bg-muted/40 cursor-pointer";

          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled || autoPick}
              onClick={() => !disabled && onChange(tier)}
              className={`${baseRow} ${stateClass} w-full text-left`}
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                style={{
                  borderColor: selected ? "var(--primary)" : undefined,
                }}
              >
                {option.status.kind === "claimed" ? (
                  <Check className="h-3 w-3 text-muted-foreground" />
                ) : option.status.kind !== "available" ? (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                ) : selected ? (
                  <span className="block h-2.5 w-2.5 rounded-full bg-primary" />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">第 {tier} 座</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatLevelText(option.rule.allowed_level)}
                  </span>
                </div>
                <div
                  className={`truncate text-[11px] ${
                    option.status.kind === "available"
                      ? "text-muted-foreground"
                      : "text-muted-foreground/80"
                  }`}
                >
                  {describeStatus(option)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

