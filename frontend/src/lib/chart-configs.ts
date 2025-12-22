/**
 * Shared Chart Configurations
 *
 * Centralized chart config definitions for consistent styling across analytics pages.
 * Uses CSS variables for theme compatibility.
 */

import type { ChartConfig } from '@/components/ui/chart'

// Subtle blue-gray for median lines (distinct from muted-foreground but still muted)
export const MEDIAN_LINE_COLOR = 'hsl(215 20% 55%)'

// =============================================================================
// Base Config Builders
// =============================================================================

/**
 * Creates alliance comparison config entries (avg + median)
 */
function createAllianceComparisonEntries(metricKey: string) {
  return {
    [`alliance_avg_${metricKey}`]: {
      label: '同盟平均',
      color: 'var(--muted-foreground)',
    },
    [`alliance_median_${metricKey}`]: {
      label: '同盟中位數',
      color: MEDIAN_LINE_COLOR,
    },
  }
}

// =============================================================================
// Member Performance Chart Configs
// =============================================================================

export const memberChartConfigs = {
  contributionMerit: {
    contribution: {
      label: '日均貢獻',
      color: 'var(--chart-4)',
    },
    merit: {
      label: '日均戰功',
      color: 'var(--primary)',
    },
  } satisfies ChartConfig,

  radar: {
    member: {
      label: '成員',
      color: 'var(--primary)',
    },
    alliance: {
      label: '同盟平均',
      color: 'var(--muted-foreground)',
    },
    median: {
      label: '同盟中位數',
      color: MEDIAN_LINE_COLOR,
    },
  } satisfies ChartConfig,

  merit: {
    merit: {
      label: '日均戰功',
      color: 'var(--primary)',
    },
    ...createAllianceComparisonEntries('merit'),
  } satisfies ChartConfig,

  assist: {
    assist: {
      label: '日均助攻',
      color: 'var(--chart-2)',
    },
    ...createAllianceComparisonEntries('assist'),
  } satisfies ChartConfig,

  power: {
    power: {
      label: '勢力值',
      color: 'var(--primary)',
    },
    ...createAllianceComparisonEntries('power'),
  } satisfies ChartConfig,

  donation: {
    donation: {
      label: '捐獻',
      color: 'var(--chart-3)',
    },
    ...createAllianceComparisonEntries('donation'),
  } satisfies ChartConfig,

  contribution: {
    contribution: {
      label: '日均貢獻',
      color: 'var(--chart-4)',
    },
    ...createAllianceComparisonEntries('contribution'),
  } satisfies ChartConfig,
}

// =============================================================================
// Group Analytics Chart Configs
// =============================================================================

export const groupChartConfigs = {
  capabilityRadar: {
    group: {
      label: '組別',
      color: 'var(--primary)',
    },
    alliance: {
      label: '同盟平均',
      color: 'var(--muted-foreground)',
    },
    median: {
      label: '同盟中位數',
      color: MEDIAN_LINE_COLOR,
    },
  } satisfies ChartConfig,

  meritBar: {
    merit: {
      label: '人日均戰功',
      color: 'var(--primary)',
    },
  } satisfies ChartConfig,

  meritTrend: {
    merit: {
      label: '人日均戰功',
      color: 'var(--primary)',
    },
    assist: {
      label: '人日均助攻',
      color: 'var(--chart-2)',
    },
  } satisfies ChartConfig,

  contributionDistribution: {
    count: {
      label: '人數',
      color: 'var(--chart-3)',
    },
  } satisfies ChartConfig,

  contributionTrend: {
    contribution: {
      label: '人日均貢獻',
      color: 'var(--chart-3)',
    },
  } satisfies ChartConfig,

  meritDistribution: {
    count: {
      label: '人數',
      color: 'var(--primary)',
    },
  } satisfies ChartConfig,
}

// =============================================================================
// Alliance Analytics Chart Configs
// =============================================================================

export const allianceChartConfigs = {
  trend: {
    contribution: { label: '人日均貢獻', color: 'var(--primary)' },
    merit: { label: '人日均戰功', color: 'var(--chart-2)' },
    median: { label: '中位數', color: 'var(--muted-foreground)' },
  } satisfies ChartConfig,

  groupBar: {
    value: { label: '數值', color: 'var(--primary)' },
  } satisfies ChartConfig,

  distribution: {
    count: { label: '人數', color: 'var(--primary)' },
  } satisfies ChartConfig,
}
