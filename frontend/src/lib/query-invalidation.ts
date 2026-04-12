/**
 * Query invalidation helpers for cross-hook cache coordination.
 *
 * When a mutation changes data that multiple query groups derive from
 * (CSV upload → periods → member/group/alliance analytics), every hook
 * that touches that dataset funnels through a single helper so future
 * derived keys are invalidated in one place.
 */

import type { QueryClient } from "@tanstack/react-query";
import { analyticsKeys, csvUploadKeys, periodKeys } from "@/lib/query-keys";

/**
 * Invalidate every cache that a CSV upload, delete, or period
 * recalculation can affect for a given season.
 */
export function invalidateSeasonDerivedData(
  queryClient: QueryClient,
  seasonId: string,
): void {
  queryClient.invalidateQueries({ queryKey: csvUploadKeys.list(seasonId) });
  queryClient.invalidateQueries({ queryKey: periodKeys.list(seasonId) });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
}
