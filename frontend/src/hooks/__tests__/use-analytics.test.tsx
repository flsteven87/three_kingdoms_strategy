import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  analyticsKeys,
  useAnalyticsMembers,
  useMemberTrend,
  useMemberSeasonSummary,
  usePeriodAverages,
  useAllianceTrend,
  useSeasonAverages,
  useGroups,
  useGroupAnalytics,
  useGroupsComparison,
  useAllianceAnalytics,
} from "../use-analytics";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type {
  MemberListItem,
  MemberTrendItem,
  SeasonSummaryResponse,
  AllianceAveragesResponse,
  AllianceTrendItem,
  GroupListItem,
  GroupAnalyticsResponse,
  GroupComparisonItem,
  AllianceAnalyticsResponse,
  GroupStats,
  AllianceSummary,
} from "@/types/analytics";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAnalyticsMembers: vi.fn(),
    getMemberTrend: vi.fn(),
    getMemberSeasonSummary: vi.fn(),
    getPeriodAverages: vi.fn(),
    getAllianceTrend: vi.fn(),
    getSeasonAverages: vi.fn(),
    getGroups: vi.fn(),
    getGroupAnalytics: vi.fn(),
    getGroupsComparison: vi.fn(),
    getAllianceAnalytics: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

// =============================================================================
// Mock Data
// =============================================================================

const mockMemberListItems: MemberListItem[] = [
  {
    id: "member-1",
    name: "曹操",
    is_active: true,
    contribution_rank: 1,
    group: "A組",
  },
  {
    id: "member-2",
    name: "劉備",
    is_active: true,
    contribution_rank: 2,
    group: "B組",
  },
];

const mockMemberTrendItem: MemberTrendItem = {
  period_id: "period-1",
  period_number: 1,
  period_label: "第1期",
  start_date: "2026-01-01",
  end_date: "2026-01-07",
  days: 7,
  daily_contribution: 1000,
  daily_merit: 500,
  daily_assist: 200,
  daily_donation: 100,
  contribution_diff: 7000,
  merit_diff: 3500,
  assist_diff: 1400,
  donation_diff: 700,
  power_diff: 5000,
  start_rank: 5,
  end_rank: 3,
  rank_change: 2,
  end_power: 50000,
  end_state: "active",
  end_group: "A組",
  is_new_member: false,
  alliance_avg_contribution: 800,
  alliance_avg_merit: 400,
  alliance_avg_assist: 150,
  alliance_avg_donation: 80,
  alliance_avg_power: 45000,
  alliance_member_count: 30,
  alliance_median_contribution: 750,
  alliance_median_merit: 380,
  alliance_median_assist: 140,
  alliance_median_donation: 75,
  alliance_median_power: 42000,
};

const mockSeasonSummary: SeasonSummaryResponse = {
  period_count: 5,
  total_days: 35,
  total_contribution: 35000,
  total_merit: 17500,
  total_assist: 7000,
  total_donation: 3500,
  total_power_change: 25000,
  avg_daily_contribution: 1000,
  avg_daily_merit: 500,
  avg_daily_assist: 200,
  avg_daily_donation: 100,
  avg_power: 50000,
  current_rank: 3,
  rank_change_season: 2,
  current_power: 55000,
  current_group: "A組",
  current_state: "active",
};

const mockAllianceAverages: AllianceAveragesResponse = {
  member_count: 30,
  avg_daily_contribution: 800,
  avg_daily_merit: 400,
  avg_daily_assist: 150,
  avg_daily_donation: 80,
  avg_power: 45000,
  median_daily_contribution: 750,
  median_daily_merit: 380,
  median_daily_assist: 140,
  median_daily_donation: 75,
  median_power: 42000,
};

const mockAllianceTrendItems: AllianceTrendItem[] = [
  {
    period_id: "period-1",
    period_number: 1,
    period_label: "第1期",
    member_count: 30,
    avg_daily_contribution: 800,
    avg_daily_merit: 400,
    avg_daily_assist: 150,
    avg_daily_donation: 80,
  },
];

const mockGroupListItems: GroupListItem[] = [
  { name: "A組", member_count: 10 },
  { name: "B組", member_count: 8 },
];

const mockGroupStats: GroupStats = {
  group_name: "A組",
  member_count: 10,
  avg_daily_contribution: 1000,
  avg_daily_merit: 500,
  avg_daily_assist: 200,
  avg_daily_donation: 100,
  avg_power: 50000,
  avg_rank: 5,
  best_rank: 1,
  worst_rank: 10,
  contribution_min: 500,
  contribution_q1: 750,
  contribution_median: 950,
  contribution_q3: 1200,
  contribution_max: 1800,
  contribution_cv: 0.25,
  merit_min: 200,
  merit_q1: 350,
  merit_median: 480,
  merit_q3: 620,
  merit_max: 900,
  merit_cv: 0.3,
};

const mockGroupAnalyticsResponse: GroupAnalyticsResponse = {
  stats: mockGroupStats,
  members: [],
  trends: [],
  alliance_averages: mockAllianceAverages,
};

const mockGroupComparisonItems: GroupComparisonItem[] = [
  {
    name: "A組",
    avg_daily_merit: 500,
    avg_rank: 5,
    member_count: 10,
    member_names: ["曹操", "夏侯惇"],
  },
];

const mockAllianceSummary: AllianceSummary = {
  member_count: 30,
  avg_daily_contribution: 800,
  avg_daily_merit: 400,
  avg_daily_assist: 150,
  avg_daily_donation: 80,
  avg_power: 45000,
  median_daily_contribution: 750,
  median_daily_merit: 380,
  contribution_change_pct: 5.2,
  merit_change_pct: 3.1,
  power_change_pct: 2.8,
};

const mockAllianceAnalyticsResponse: AllianceAnalyticsResponse = {
  summary: mockAllianceSummary,
  trends: [],
  distributions: { contribution: [], merit: [] },
  groups: [],
  top_performers: [],
  bottom_performers: [],
  needs_attention: [],
  current_period: {
    period_id: "period-1",
    period_number: 1,
    period_label: "第1期",
    start_date: "2026-01-01",
    end_date: "2026-01-07",
    days: 7,
  },
};

// =============================================================================
// analyticsKeys
// =============================================================================

describe("analyticsKeys", () => {
  it("builds top-level all key", () => {
    expect(analyticsKeys.all).toEqual(["analytics"]);
  });

  it("builds members key hierarchy", () => {
    expect(analyticsKeys.members()).toEqual(["analytics", "members"]);
    expect(analyticsKeys.membersList("season-1", true)).toEqual([
      "analytics",
      "members",
      { seasonId: "season-1", activeOnly: true },
    ]);
  });

  it("builds trend key hierarchy", () => {
    expect(analyticsKeys.trends()).toEqual(["analytics", "trend"]);
    expect(analyticsKeys.memberTrend("member-1", "season-1")).toEqual([
      "analytics",
      "trend",
      "member-1",
      "season-1",
    ]);
  });

  it("builds summary key hierarchy", () => {
    expect(analyticsKeys.summaries()).toEqual(["analytics", "summary"]);
    expect(analyticsKeys.memberSummary("member-1", "season-1")).toEqual([
      "analytics",
      "summary",
      "member-1",
      "season-1",
    ]);
  });

  it("builds period averages key hierarchy", () => {
    expect(analyticsKeys.periodAverages()).toEqual([
      "analytics",
      "period-averages",
    ]);
    expect(analyticsKeys.periodAverage("period-1")).toEqual([
      "analytics",
      "period-averages",
      "period-1",
    ]);
  });

  it("builds alliance trend key", () => {
    expect(analyticsKeys.allianceTrend("season-1")).toEqual([
      "analytics",
      "alliance-trend",
      "season-1",
    ]);
  });

  it("builds season averages key", () => {
    expect(analyticsKeys.seasonAverages("season-1")).toEqual([
      "analytics",
      "season-averages",
      "season-1",
    ]);
  });

  it("builds groups key hierarchy", () => {
    expect(analyticsKeys.groups()).toEqual(["analytics", "groups"]);
    expect(analyticsKeys.groupsList("season-1")).toEqual([
      "analytics",
      "groups",
      "list",
      "season-1",
    ]);
    expect(analyticsKeys.groupAnalytics("A組", "season-1", "latest")).toEqual([
      "analytics",
      "groups",
      "detail",
      "A組",
      "season-1",
      "latest",
    ]);
    expect(analyticsKeys.groupsComparison("season-1", "season")).toEqual([
      "analytics",
      "groups",
      "comparison",
      "season-1",
      "season",
    ]);
  });

  it("builds alliance analytics key with view mode", () => {
    expect(analyticsKeys.allianceAnalytics("season-1", "latest")).toEqual([
      "analytics",
      "alliance-analytics",
      "season-1",
      "latest",
    ]);
    expect(analyticsKeys.allianceAnalytics("season-1", "season")).toEqual([
      "analytics",
      "alliance-analytics",
      "season-1",
      "season",
    ]);
  });
});

// =============================================================================
// useAnalyticsMembers
// =============================================================================

describe("useAnalyticsMembers", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches members list when seasonId is provided", async () => {
    vi.mocked(apiClient.getAnalyticsMembers).mockResolvedValueOnce(
      mockMemberListItems
    );

    const { result } = renderHook(
      () => useAnalyticsMembers("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockMemberListItems);
    expect(apiClient.getAnalyticsMembers).toHaveBeenCalledWith("season-1", true);
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useAnalyticsMembers(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getAnalyticsMembers).not.toHaveBeenCalled();
  });

  it("passes activeOnly=false when specified", async () => {
    vi.mocked(apiClient.getAnalyticsMembers).mockResolvedValueOnce(
      mockMemberListItems
    );

    const { result } = renderHook(
      () => useAnalyticsMembers("season-1", false),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getAnalyticsMembers).toHaveBeenCalledWith("season-1", false);
  });
});

// =============================================================================
// useMemberTrend
// =============================================================================

describe("useMemberTrend", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches trend data when both memberId and seasonId are provided", async () => {
    vi.mocked(apiClient.getMemberTrend).mockResolvedValueOnce([
      mockMemberTrendItem,
    ]);

    const { result } = renderHook(
      () => useMemberTrend("member-1", "season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockMemberTrendItem]);
    expect(apiClient.getMemberTrend).toHaveBeenCalledWith("member-1", "season-1");
  });

  it("does not fetch when memberId is undefined", () => {
    const { result } = renderHook(
      () => useMemberTrend(undefined, "season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getMemberTrend).not.toHaveBeenCalled();
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useMemberTrend("member-1", undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getMemberTrend).not.toHaveBeenCalled();
  });

  it("does not fetch when both params are undefined", () => {
    const { result } = renderHook(
      () => useMemberTrend(undefined, undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getMemberTrend).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useMemberSeasonSummary
// =============================================================================

describe("useMemberSeasonSummary", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches season summary when both params are provided", async () => {
    vi.mocked(apiClient.getMemberSeasonSummary).mockResolvedValueOnce(
      mockSeasonSummary
    );

    const { result } = renderHook(
      () => useMemberSeasonSummary("member-1", "season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSeasonSummary);
    expect(apiClient.getMemberSeasonSummary).toHaveBeenCalledWith(
      "member-1",
      "season-1"
    );
  });

  it("does not fetch when memberId is undefined", () => {
    const { result } = renderHook(
      () => useMemberSeasonSummary(undefined, "season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getMemberSeasonSummary).not.toHaveBeenCalled();
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useMemberSeasonSummary("member-1", undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getMemberSeasonSummary).not.toHaveBeenCalled();
  });
});

// =============================================================================
// usePeriodAverages
// =============================================================================

describe("usePeriodAverages", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches period averages when periodId is provided", async () => {
    vi.mocked(apiClient.getPeriodAverages).mockResolvedValueOnce(
      mockAllianceAverages
    );

    const { result } = renderHook(
      () => usePeriodAverages("period-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAllianceAverages);
    expect(apiClient.getPeriodAverages).toHaveBeenCalledWith("period-1");
  });

  it("does not fetch when periodId is undefined", () => {
    const { result } = renderHook(
      () => usePeriodAverages(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getPeriodAverages).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useAllianceTrend
// =============================================================================

describe("useAllianceTrend", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches alliance trend when seasonId is provided", async () => {
    vi.mocked(apiClient.getAllianceTrend).mockResolvedValueOnce(
      mockAllianceTrendItems
    );

    const { result } = renderHook(
      () => useAllianceTrend("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAllianceTrendItems);
    expect(apiClient.getAllianceTrend).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useAllianceTrend(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getAllianceTrend).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useSeasonAverages
// =============================================================================

describe("useSeasonAverages", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches season averages when seasonId is provided", async () => {
    vi.mocked(apiClient.getSeasonAverages).mockResolvedValueOnce(
      mockAllianceAverages
    );

    const { result } = renderHook(
      () => useSeasonAverages("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAllianceAverages);
    expect(apiClient.getSeasonAverages).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useSeasonAverages(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getSeasonAverages).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useGroups
// =============================================================================

describe("useGroups", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches groups list when seasonId is provided", async () => {
    vi.mocked(apiClient.getGroups).mockResolvedValueOnce(mockGroupListItems);

    const { result } = renderHook(
      () => useGroups("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockGroupListItems);
    expect(apiClient.getGroups).toHaveBeenCalledWith("season-1");
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useGroups(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getGroups).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useGroupAnalytics
// =============================================================================

describe("useGroupAnalytics", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches group analytics when both params are provided", async () => {
    vi.mocked(apiClient.getGroupAnalytics).mockResolvedValueOnce(
      mockGroupAnalyticsResponse
    );

    const { result } = renderHook(
      () => useGroupAnalytics("A組", "season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockGroupAnalyticsResponse);
    expect(apiClient.getGroupAnalytics).toHaveBeenCalledWith(
      "A組",
      "season-1",
      "latest"
    );
  });

  it("passes custom view mode to api", async () => {
    vi.mocked(apiClient.getGroupAnalytics).mockResolvedValueOnce(
      mockGroupAnalyticsResponse
    );

    const { result } = renderHook(
      () => useGroupAnalytics("A組", "season-1", "season"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getGroupAnalytics).toHaveBeenCalledWith(
      "A組",
      "season-1",
      "season"
    );
  });

  it("does not fetch when groupName is undefined", () => {
    const { result } = renderHook(
      () => useGroupAnalytics(undefined, "season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getGroupAnalytics).not.toHaveBeenCalled();
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useGroupAnalytics("A組", undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getGroupAnalytics).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useGroupsComparison
// =============================================================================

describe("useGroupsComparison", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches groups comparison when seasonId is provided", async () => {
    vi.mocked(apiClient.getGroupsComparison).mockResolvedValueOnce(
      mockGroupComparisonItems
    );

    const { result } = renderHook(
      () => useGroupsComparison("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockGroupComparisonItems);
    expect(apiClient.getGroupsComparison).toHaveBeenCalledWith(
      "season-1",
      "latest"
    );
  });

  it("passes season view mode to api", async () => {
    vi.mocked(apiClient.getGroupsComparison).mockResolvedValueOnce(
      mockGroupComparisonItems
    );

    const { result } = renderHook(
      () => useGroupsComparison("season-1", "season"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getGroupsComparison).toHaveBeenCalledWith(
      "season-1",
      "season"
    );
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useGroupsComparison(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.getGroupsComparison).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useAllianceAnalytics
// =============================================================================

describe("useAllianceAnalytics", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("fetches alliance analytics when seasonId is provided", async () => {
    vi.mocked(apiClient.getAllianceAnalytics)
      .mockResolvedValueOnce(mockAllianceAnalyticsResponse)  // primary fetch
      .mockResolvedValueOnce(mockAllianceAnalyticsResponse); // prefetch

    const { result } = renderHook(
      () => useAllianceAnalytics("season-1"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAllianceAnalyticsResponse);
    expect(apiClient.getAllianceAnalytics).toHaveBeenCalledWith(
      "season-1",
      "latest"
    );
  });

  it("fetches with season view mode", async () => {
    vi.mocked(apiClient.getAllianceAnalytics)
      .mockResolvedValueOnce(mockAllianceAnalyticsResponse)  // primary fetch
      .mockResolvedValueOnce(mockAllianceAnalyticsResponse); // prefetch

    const { result } = renderHook(
      () => useAllianceAnalytics("season-1", "season"),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getAllianceAnalytics).toHaveBeenCalledWith(
      "season-1",
      "season"
    );
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useAllianceAnalytics(undefined),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("prefetches the alternate view mode in background", async () => {
    vi.mocked(apiClient.getAllianceAnalytics)
      .mockResolvedValueOnce(mockAllianceAnalyticsResponse)  // primary fetch
      .mockResolvedValueOnce(mockAllianceAnalyticsResponse); // prefetch

    renderHook(
      () => useAllianceAnalytics("season-1", "latest"),
      { wrapper: createWrapper(queryClient) }
    );

    // Allow effects to run
    await waitFor(() => {
      expect(apiClient.getAllianceAnalytics).toHaveBeenCalledWith(
        "season-1",
        "season"
      );
    });
  });

  it("does not prefetch alternate view when seasonId is undefined", () => {
    renderHook(
      () => useAllianceAnalytics(undefined, "latest"),
      { wrapper: createWrapper(queryClient) }
    );

    expect(apiClient.getAllianceAnalytics).not.toHaveBeenCalled();
  });
});
