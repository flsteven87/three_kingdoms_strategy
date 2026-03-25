import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useDonations,
  useCreateDonation,
  useDeleteDonation,
  donationKeys,
} from "../use-donations";
import type { QueryClient } from "@tanstack/react-query";
import type { CreateDonationPayload } from "@/lib/api/donation-api";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getDonations: vi.fn(),
    getDonationDetail: vi.fn(),
    createDonation: vi.fn(),
    deleteDonation: vi.fn(),
    upsertMemberTargetOverride: vi.fn(),
    deleteMemberTargetOverride: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const ALLIANCE_ID = "alliance-1";
const SEASON_ID = "season-1";

const mockDonations = [
  { id: "d1", title: "Donation A", target_amount: 1000 },
  { id: "d2", title: "Donation B", target_amount: 2000 },
];

describe("donationKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(donationKeys.all).toEqual(["donations"]);
    expect(donationKeys.list("a1", "s1")).toEqual([
      "donations", "list", "a1", "s1",
    ]);
    expect(donationKeys.detail("d1")).toEqual(["donations", "detail", "d1"]);
  });
});

describe("useDonations", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("fetches donations for alliance and season", async () => {
    vi.mocked(apiClient.getDonations).mockResolvedValueOnce(mockDonations);

    const { result } = renderHook(
      () => useDonations(ALLIANCE_ID, SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDonations);
    expect(apiClient.getDonations).toHaveBeenCalledWith(ALLIANCE_ID, SEASON_ID);
  });

  it("does not fetch when allianceId is undefined", () => {
    const { result } = renderHook(
      () => useDonations(undefined, SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not fetch when seasonId is undefined", () => {
    const { result } = renderHook(
      () => useDonations(ALLIANCE_ID, undefined),
      { wrapper: createWrapper(queryClient) }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateDonation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("calls createDonation and invalidates list cache", async () => {
    const newDonation = { id: "d3", title: "New" };
    vi.mocked(apiClient.createDonation).mockResolvedValueOnce(newDonation);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useCreateDonation(ALLIANCE_ID, SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => {
      result.current.mutate({
        title: "New",
        type: "regular",
        deadline: "2026-04-01",
        target_amount: 500,
      } as CreateDonationPayload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.createDonation).toHaveBeenCalledWith(
      ALLIANCE_ID, SEASON_ID, {
        title: "New",
        type: "regular",
        deadline: "2026-04-01",
        target_amount: 500,
      }
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: donationKeys.list(ALLIANCE_ID, SEASON_ID),
    });
  });

  it("rejects when alliance or season ids are missing", async () => {
    const { result } = renderHook(
      () => useCreateDonation(undefined, undefined),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => {
      result.current.mutate({
        title: "X",
        type: "regular",
        deadline: "2026-04-01",
        target_amount: 100,
      } as CreateDonationPayload);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeleteDonation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("deletes donation and invalidates caches", async () => {
    vi.mocked(apiClient.deleteDonation).mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteDonation(), { wrapper: createWrapper(queryClient) });

    act(() => { result.current.mutate("d1"); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.deleteDonation).toHaveBeenCalledWith("d1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: donationKeys.detail("d1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: donationKeys.all,
    });
  });
});
