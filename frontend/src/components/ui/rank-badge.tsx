/**
 * Rank Badge Component
 *
 * Displays ranking with medal icons for top 3 positions.
 * Uses accessible patterns with aria-labels.
 */

import { cn } from "@/lib/utils";

interface RankConfig {
  readonly icon: string;
  readonly label: string;
  readonly className: string;
}

const RANK_CONFIG: Record<number, RankConfig> = {
  1: {
    icon: "\uD83E\uDD47", // 🥇
    label: "\u7B2C\u4E00\u540D", // 第一名
    className: "text-amber-500",
  },
  2: {
    icon: "\uD83E\uDD48", // 🥈
    label: "\u7B2C\u4E8C\u540D", // 第二名
    className: "text-gray-400 dark:text-gray-300",
  },
  3: {
    icon: "\uD83E\uDD49", // 🥉
    label: "\u7B2C\u4E09\u540D", // 第三名
    className: "text-orange-600 dark:text-orange-400",
  },
};

interface RankBadgeProps {
  readonly rank: number;
  readonly size?: "sm" | "md" | "lg";
  readonly showNumber?: boolean;
  readonly className?: string;
}

/**
 * Rank badge with medal icons for top 3.
 * Falls back to numeric display for ranks 4+.
 */
export function RankBadge({
  rank,
  size = "md",
  showNumber = false,
  className,
}: RankBadgeProps) {
  const config = RANK_CONFIG[rank];

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  // Top 3: show medal
  if (config) {
    return (
      <span
        className={cn(sizeClasses[size], config.className, className)}
        aria-label={config.label}
      >
        {config.icon}
        {showNumber && (
          <span className="ml-0.5 text-muted-foreground">{rank}</span>
        )}
      </span>
    );
  }

  // Rank 4+: show number only
  return (
    <span
      className={cn(
        "text-muted-foreground tabular-nums",
        sizeClasses[size],
        className,
      )}
    >
      {rank}.
    </span>
  );
}

interface RankDisplayProps {
  readonly rank: number;
  readonly total?: number;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
}

/**
 * Full rank display with optional total count.
 * Example: "🥇" or "#4 / 20"
 */
export function RankDisplay({
  rank,
  total,
  size = "md",
  className,
}: RankDisplayProps) {
  const isTop3 = rank <= 3;

  if (isTop3) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <RankBadge rank={rank} size={size} />
        {total && (
          <span className="text-muted-foreground text-sm">/ {total}</span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("text-muted-foreground", className)}>
      #{rank}
      {total && <span className="text-sm"> / {total}</span>}
    </span>
  );
}
