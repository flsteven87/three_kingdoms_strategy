/**
 * BoxPlot - Reusable box plot visualization component
 *
 * Supports multiple modes:
 * 1. Single box plot with optional strip plot (individual data points)
 * 2. Multiple box plots for group comparison
 * 3. DetailedStripPlot - member list with visual position (no hover needed)
 *
 * Box plot shows: Min / Q1 / Median / Q3 / Max
 */

import { useState } from "react";
import { formatNumber, formatNumberCompact } from "@/lib/chart-utils";

// ============================================================================
// Types
// ============================================================================

export interface BoxPlotStats {
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}

export interface StripPlotPoint {
  readonly id: string;
  readonly name: string;
  readonly value: number;
}

interface BoxPlotProps {
  readonly stats: BoxPlotStats;
  /** Optional strip plot data points */
  readonly points?: readonly StripPlotPoint[];
  /** Color theme: primary, chart-2, chart-3, etc. */
  readonly color?: string;
  /** Whether to show value labels */
  readonly showLabels?: boolean;
  /** Custom range for scaling (useful when comparing multiple box plots) */
  readonly scaleRange?: { min: number; max: number };
}

interface BoxPlotComparisonProps {
  readonly items: readonly {
    readonly name: string;
    readonly stats: BoxPlotStats;
  }[];
  /** Color theme */
  readonly color?: string;
}

interface DetailedStripPlotProps {
  readonly stats: BoxPlotStats;
  readonly points: readonly StripPlotPoint[];
  /** Color theme: primary, chart-2, chart-3, etc. */
  readonly color?: string;
  /** Sort order for members: desc (high first) or asc (low first) */
  readonly sortOrder?: "asc" | "desc";
  /** Whether to show quartile reference lines */
  readonly showQuartileLines?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculatePosition(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

// ============================================================================
// Single BoxPlot Component
// ============================================================================

export function BoxPlot({
  stats,
  points,
  color = "primary",
  showLabels = true,
  scaleRange,
}: BoxPlotProps) {
  const [hoveredPoint, setHoveredPoint] = useState<StripPlotPoint | null>(null);
  const [hoveredStat, setHoveredStat] = useState<"q1" | "median" | "q3" | null>(null);

  const rangeMin = scaleRange?.min ?? stats.min;
  const rangeMax = scaleRange?.max ?? stats.max;

  const getPosition = (value: number) =>
    calculatePosition(value, rangeMin, rangeMax);

  const minPct = getPosition(stats.min);
  const q1Pct = getPosition(stats.q1);
  const medianPct = getPosition(stats.median);
  const q3Pct = getPosition(stats.q3);
  const maxPct = getPosition(stats.max);

  const colorClass = `var(--${color})`;

  return (
    <div className="space-y-2">
      {/* Top labels */}
      {showLabels && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{formatNumber(stats.min)}</span>
          <span>{formatNumber(stats.median)}</span>
          <span>{formatNumber(stats.max)}</span>
        </div>
      )}

      {/* Box Plot */}
      <div className="relative h-8">
        {/* Full range bar */}
        <div className="absolute inset-y-2 left-0 right-0 bg-muted rounded" />
        {/* Whisker line (min to max) */}
        <div
          className="absolute top-1/2 h-px -translate-y-1/2"
          style={{
            left: `${minPct}%`,
            right: `${100 - maxPct}%`,
            backgroundColor: colorClass,
            opacity: 0.5,
          }}
        />
        {/* Min whisker cap */}
        <div
          className="absolute top-2 bottom-2 w-px"
          style={{
            left: `${minPct}%`,
            backgroundColor: colorClass,
            opacity: 0.5,
          }}
        />
        {/* Max whisker cap */}
        <div
          className="absolute top-2 bottom-2 w-px"
          style={{
            left: `${maxPct}%`,
            backgroundColor: colorClass,
            opacity: 0.5,
          }}
        />
        {/* IQR box */}
        <div
          className="absolute inset-y-1 rounded border-2 cursor-pointer"
          style={{
            left: `${q1Pct}%`,
            right: `${100 - q3Pct}%`,
            backgroundColor: `color-mix(in srgb, ${colorClass} 20%, transparent)`,
            borderColor: colorClass,
          }}
          onMouseEnter={() => setHoveredStat("q1")}
          onMouseLeave={() => setHoveredStat(null)}
        >
          {hoveredStat === "q1" && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 rounded bg-popover border shadow-md text-xs whitespace-nowrap z-20">
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span className="text-muted-foreground">Q1:</span>
                <span className="font-medium text-right">{formatNumber(stats.q1)}</span>
                <span className="text-muted-foreground">Median:</span>
                <span className="font-medium text-right">{formatNumber(stats.median)}</span>
                <span className="text-muted-foreground">Q3:</span>
                <span className="font-medium text-right">{formatNumber(stats.q3)}</span>
              </div>
            </div>
          )}
        </div>
        {/* Median line */}
        <div
          className="absolute inset-y-0 w-1 -ml-0.5 cursor-pointer hover:w-1.5 transition-all"
          style={{ left: `${medianPct}%`, backgroundColor: colorClass }}
          onMouseEnter={() => setHoveredStat("median")}
          onMouseLeave={() => setHoveredStat(null)}
        >
          {hoveredStat === "median" && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded bg-popover border shadow-md text-xs whitespace-nowrap z-20">
              <div className="text-center">
                <span className="text-muted-foreground">Median: </span>
                <span className="font-medium">{formatNumber(stats.median)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Strip Plot - Individual data points */}
      {points && points.length > 0 && (
        <div className="relative h-6">
          {points.map((point) => {
            const position = getPosition(point.value);
            const isHovered = hoveredPoint?.id === point.id;
            return (
              <div
                key={point.id}
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-transform z-10 hover:scale-150"
                style={{
                  left: `calc(${position}% - 5px)`,
                  backgroundColor: `color-mix(in srgb, ${colorClass} 70%, transparent)`,
                }}
                onMouseEnter={() => setHoveredPoint(point)}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {isHovered && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-popover border shadow-md text-xs whitespace-nowrap z-20">
                    <div className="font-medium">{point.name}</div>
                    <div className="text-muted-foreground">
                      {formatNumber(point.value)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom labels */}
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Min</span>
          <span>Q1: {formatNumber(stats.q1)}</span>
          <span>Q3: {formatNumber(stats.q3)}</span>
          <span>Max</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BoxPlot Comparison Component (multiple groups)
// ============================================================================

export function BoxPlotComparison({
  items,
  color = "primary",
}: BoxPlotComparisonProps) {
  // Calculate global range for consistent scaling across all items
  const allValues = items.flatMap((item) => [item.stats.min, item.stats.max]);
  const globalMin = Math.min(...allValues);
  const globalMax = Math.max(...allValues);

  const getPosition = (value: number) =>
    calculatePosition(value, globalMin, globalMax);

  const colorClass = `var(--${color})`;

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const minPct = getPosition(item.stats.min);
        const q1Pct = getPosition(item.stats.q1);
        const medianPct = getPosition(item.stats.median);
        const q3Pct = getPosition(item.stats.q3);
        const maxPct = getPosition(item.stats.max);

        return (
          <div key={item.name} className="space-y-1">
            {/* Row header */}
            <div className="flex justify-between text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground tabular-nums">
                Med: {formatNumberCompact(item.stats.median)}
              </span>
            </div>

            {/* Box Plot Row */}
            <div className="relative h-6">
              {/* Whisker line (min to max) */}
              <div
                className="absolute top-1/2 h-px -translate-y-1/2"
                style={{
                  left: `${minPct}%`,
                  right: `${100 - maxPct}%`,
                  backgroundColor: colorClass,
                  opacity: 0.5,
                }}
              />
              {/* Min whisker cap */}
              <div
                className="absolute top-1 bottom-1 w-px"
                style={{
                  left: `${minPct}%`,
                  backgroundColor: colorClass,
                  opacity: 0.5,
                }}
              />
              {/* Max whisker cap */}
              <div
                className="absolute top-1 bottom-1 w-px"
                style={{
                  left: `${maxPct}%`,
                  backgroundColor: colorClass,
                  opacity: 0.5,
                }}
              />
              {/* IQR box (Q1 to Q3) */}
              <div
                className="absolute top-0.5 bottom-0.5 rounded-sm border"
                style={{
                  left: `${q1Pct}%`,
                  right: `${100 - q3Pct}%`,
                  backgroundColor: `color-mix(in srgb, ${colorClass} 20%, transparent)`,
                  borderColor: colorClass,
                }}
              />
              {/* Median line */}
              <div
                className="absolute top-0 bottom-0 w-0.5"
                style={{ left: `${medianPct}%`, backgroundColor: colorClass }}
              />
            </div>

            {/* Value labels */}
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatNumberCompact(item.stats.min)}</span>
              <span>Q1: {formatNumberCompact(item.stats.q1)}</span>
              <span>Q3: {formatNumberCompact(item.stats.q3)}</span>
              <span>{formatNumberCompact(item.stats.max)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Detailed Strip Plot Component (member list with visual positions)
// ============================================================================

export function DetailedStripPlot({
  stats,
  points,
  color = "primary",
  sortOrder = "desc",
  showQuartileLines = true,
}: DetailedStripPlotProps) {
  const colorClass = `var(--${color})`;

  // Sort points by value
  const sortedPoints = [...points].sort((a, b) =>
    sortOrder === "desc" ? b.value - a.value : a.value - b.value,
  );

  // Calculate positions
  const getPosition = (value: number) =>
    calculatePosition(value, stats.min, stats.max);

  const q1Pct = getPosition(stats.q1);
  const medianPct = getPosition(stats.median);
  const q3Pct = getPosition(stats.q3);

  // Determine which quartile a value falls into for coloring
  const getQuartileClass = (value: number): string => {
    if (value < stats.q1) return "opacity-50"; // Below Q1
    if (value > stats.q3) return "opacity-100"; // Above Q3 (highlight)
    return "opacity-75"; // Within IQR
  };

  return (
    <div className="space-y-4">
      {/* Compact Box Plot Summary */}
      <div className="space-y-2">
        {/* Top labels */}
        <div className="flex justify-between text-sm text-muted-foreground tabular-nums">
          <span>{formatNumberCompact(stats.min)}</span>
          <span>{formatNumberCompact(stats.median)}</span>
          <span>{formatNumberCompact(stats.max)}</span>
        </div>

        {/* Box Plot */}
        <div className="relative h-6">
          {/* Full range bar */}
          <div className="absolute inset-y-1 left-0 right-0 bg-muted rounded" />
          {/* Whisker line (min to max) */}
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 left-0 right-0"
            style={{ backgroundColor: colorClass, opacity: 0.4 }}
          />
          {/* Min whisker cap */}
          <div
            className="absolute top-1 bottom-1 w-px left-0"
            style={{ backgroundColor: colorClass, opacity: 0.5 }}
          />
          {/* Max whisker cap */}
          <div
            className="absolute top-1 bottom-1 w-px right-0"
            style={{ backgroundColor: colorClass, opacity: 0.5 }}
          />
          {/* IQR box */}
          <div
            className="absolute inset-y-0 rounded border-2"
            style={{
              left: `${q1Pct}%`,
              right: `${100 - q3Pct}%`,
              backgroundColor: `color-mix(in srgb, ${colorClass} 20%, transparent)`,
              borderColor: colorClass,
            }}
          />
          {/* Median line */}
          <div
            className="absolute inset-y-0 w-0.5"
            style={{ left: `${medianPct}%`, backgroundColor: colorClass }}
          />
        </div>

        {/* Bottom labels */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Min</span>
          <span>Q1: {formatNumberCompact(stats.q1)}</span>
          <span>Q3: {formatNumberCompact(stats.q3)}</span>
          <span>Max</span>
        </div>
      </div>

      {/* Member List with Visual Positions */}
      <div className="space-y-0">
        {/* Axis header with quartile markers */}
        <div className="flex items-center gap-2 pb-2 border-b border-border/50">
          <div className="w-24 shrink-0 text-xs text-muted-foreground">
            成員
          </div>
          <div className="flex-1 relative h-4">
            {/* Axis line */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />
            {/* Min label */}
            <div className="absolute left-0 -translate-x-0 text-[10px] text-muted-foreground tabular-nums">
              {formatNumberCompact(stats.min)}
            </div>
            {/* Max label */}
            <div className="absolute right-0 translate-x-0 text-[10px] text-muted-foreground tabular-nums">
              {formatNumberCompact(stats.max)}
            </div>
            {showQuartileLines && (
              <>
                {/* Q1 marker */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-border"
                  style={{ left: `${q1Pct}%` }}
                />
                {/* Median marker */}
                <div
                  className="absolute top-0 bottom-0 w-px"
                  style={{
                    left: `${medianPct}%`,
                    backgroundColor: colorClass,
                    opacity: 0.5,
                  }}
                />
                {/* Q3 marker */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-border"
                  style={{ left: `${q3Pct}%` }}
                />
              </>
            )}
          </div>
          <div className="w-16 shrink-0 text-xs text-muted-foreground text-right">
            數值
          </div>
        </div>

        {/* Member rows */}
        <div className="divide-y divide-border/30">
          {sortedPoints.map((point) => {
            const position = getPosition(point.value);
            const quartileClass = getQuartileClass(point.value);

            return (
              <div
                key={point.id}
                className="flex items-center gap-2 py-1.5 group hover:bg-muted/30"
              >
                {/* Member name */}
                <div
                  className="w-24 shrink-0 text-sm truncate"
                  title={point.name}
                >
                  {point.name}
                </div>

                {/* Visual position bar */}
                <div className="flex-1 relative h-5">
                  {/* Quartile reference lines (subtle) */}
                  {showQuartileLines && (
                    <>
                      <div
                        className="absolute top-0 bottom-0 w-px bg-border/50"
                        style={{ left: `${q1Pct}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-px"
                        style={{
                          left: `${medianPct}%`,
                          backgroundColor: colorClass,
                          opacity: 0.2,
                        }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-px bg-border/50"
                        style={{ left: `${q3Pct}%` }}
                      />
                    </>
                  )}

                  {/* Connecting line from start to dot */}
                  <div
                    className="absolute top-1/2 h-px -translate-y-1/2 left-0"
                    style={{
                      width: `calc(${position}% - 4px)`,
                      backgroundColor: colorClass,
                      opacity: 0.3,
                    }}
                  />

                  {/* Data point */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125 ${quartileClass}`}
                    style={{
                      left: `calc(${position}% - 5px)`,
                      backgroundColor: colorClass,
                    }}
                  />
                </div>

                {/* Value */}
                <div className="w-16 shrink-0 text-sm text-right tabular-nums text-muted-foreground">
                  {formatNumberCompact(point.value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
