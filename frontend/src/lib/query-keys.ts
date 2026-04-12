/**
 * Shared TanStack Query key factories.
 *
 * Defined in a neutral module so helpers like invalidateSeasonDerivedData
 * can import them without forming a cycle with the hook files that own
 * the query logic.
 */

export const csvUploadKeys = {
  all: ["csv-uploads"] as const,
  lists: () => [...csvUploadKeys.all, "list"] as const,
  list: (seasonId: string) => [...csvUploadKeys.lists(), { seasonId }] as const,
  details: () => [...csvUploadKeys.all, "detail"] as const,
  detail: (id: string) => [...csvUploadKeys.details(), id] as const,
};

export const periodKeys = {
  all: ["periods"] as const,
  lists: () => [...periodKeys.all, "list"] as const,
  list: (seasonId: string) => [...periodKeys.lists(), { seasonId }] as const,
  details: () => [...periodKeys.all, "detail"] as const,
  detail: (id: string) => [...periodKeys.details(), id] as const,
  metrics: (periodId: string) =>
    [...periodKeys.all, "metrics", periodId] as const,
};

export const analyticsKeys = {
  all: ["analytics"] as const,

  // Members list
  members: () => [...analyticsKeys.all, "members"] as const,
  membersList: (seasonId: string, activeOnly: boolean) =>
    [...analyticsKeys.members(), { seasonId, activeOnly }] as const,

  // Member trend
  trends: () => [...analyticsKeys.all, "trend"] as const,
  memberTrend: (memberId: string, seasonId: string) =>
    [...analyticsKeys.trends(), memberId, seasonId] as const,

  // Member summary
  summaries: () => [...analyticsKeys.all, "summary"] as const,
  memberSummary: (memberId: string, seasonId: string) =>
    [...analyticsKeys.summaries(), memberId, seasonId] as const,

  // Period averages
  periodAverages: () => [...analyticsKeys.all, "period-averages"] as const,
  periodAverage: (periodId: string) =>
    [...analyticsKeys.periodAverages(), periodId] as const,

  // Alliance trend
  allianceTrend: (seasonId: string) =>
    [...analyticsKeys.all, "alliance-trend", seasonId] as const,

  // Season averages (for "賽季以來" view comparison)
  seasonAverages: (seasonId: string) =>
    [...analyticsKeys.all, "season-averages", seasonId] as const,

  // Group analytics
  groups: () => [...analyticsKeys.all, "groups"] as const,
  groupsList: (seasonId: string) =>
    [...analyticsKeys.groups(), "list", seasonId] as const,
  groupAnalytics: (
    groupName: string,
    seasonId: string,
    view: "latest" | "season" = "latest",
  ) =>
    [...analyticsKeys.groups(), "detail", groupName, seasonId, view] as const,
  groupsComparison: (seasonId: string, view: "latest" | "season" = "latest") =>
    [...analyticsKeys.groups(), "comparison", seasonId, view] as const,

  // Alliance analytics
  allianceAnalytics: (seasonId: string, view: "latest" | "season" = "latest") =>
    [...analyticsKeys.all, "alliance-analytics", seasonId, view] as const,
};
