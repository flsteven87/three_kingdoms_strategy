/**
 * Metric Card Component
 *
 * Compact metric display block for LIFF event cards.
 * Shows a primary value with label, designed for side-by-side layout.
 */

import { cn } from "@/lib/utils";
import { liffTypography, typography } from "@/lib/typography";
import { formatScore } from "@/lib/format-utils";
import { ProgressBar } from "./progress-bar";
import { RankBadge } from "./rank-badge";

interface MetricCardProps {
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Container for metric display block.
 */
export function MetricCard({ className, children }: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg bg-muted/30 px-3 py-2 min-w-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface RankMetricProps {
  readonly rank: number | null;
  readonly total: number;
  readonly score: number | null;
  readonly scoreLabel: string;
}

/**
 * Personal rank and score metric for battle/siege events.
 * Shows medal + rank/total on first line, score on second line.
 */
export function RankMetric({
  rank,
  total,
  score,
  scoreLabel,
}: RankMetricProps) {
  // Not participated state
  if (rank === null || score === null) {
    return (
      <MetricCard>
        <div className="text-center">
          <div className={cn(liffTypography.metricMedium, typography.muted)}>
            —
          </div>
          <div className={liffTypography.metricLabel}>未參戰</div>
        </div>
      </MetricCard>
    );
  }

  return (
    <MetricCard>
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          <RankBadge rank={rank} size="sm" />
          <span className={cn(liffTypography.metricMedium, "text-foreground")}>
            #{rank}
          </span>
          <span className={liffTypography.metricLabel}>/ {total}</span>
        </div>
        <div className={liffTypography.metricLabel}>
          {scoreLabel} {formatScore(score, true)}
        </div>
      </div>
    </MetricCard>
  );
}

interface ComplianceMetricProps {
  readonly violated: boolean;
}

/**
 * Compliance status metric for forbidden events.
 * Shows check or warning icon with status text.
 */
export function ComplianceMetric({ violated }: ComplianceMetricProps) {
  if (violated) {
    return (
      <MetricCard>
        <div className="text-center">
          <div className={cn(liffTypography.metricMedium, typography.danger)}>
            ⚠️ 違規
          </div>
          <div className={liffTypography.metricLabel}>個人狀態</div>
        </div>
      </MetricCard>
    );
  }

  return (
    <MetricCard>
      <div className="text-center">
        <div className={cn(liffTypography.metricMedium, typography.success)}>
          ✓ 守規
        </div>
        <div className={liffTypography.metricLabel}>個人狀態</div>
      </div>
    </MetricCard>
  );
}

interface RateMetricProps {
  readonly rate: number;
  readonly label: string;
  readonly variant?: "success" | "danger";
}

/**
 * Rate metric with progress bar.
 * Shows percentage value and mini progress visualization.
 */
export function RateMetric({
  rate,
  label,
  variant = "success",
}: RateMetricProps) {
  const rateColor =
    variant === "danger" ? typography.danger : typography.success;

  return (
    <MetricCard>
      <div className="text-center space-y-1">
        <div className={cn(liffTypography.metricMedium, rateColor)}>
          {rate.toFixed(0)}%
        </div>
        <div className="flex items-center gap-1.5">
          <span className={liffTypography.metricLabel}>{label}</span>
          <ProgressBar
            value={rate}
            variant={variant}
            size="sm"
            className="w-12"
          />
        </div>
      </div>
    </MetricCard>
  );
}
