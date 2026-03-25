import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useCsvUploads,
  useUploadCsv,
  useDeleteCsvUpload,
  csvUploadKeys,
} from "../use-csv-uploads";
import type { QueryClient } from "@tanstack/react-query";
import { createWrapper, createTestQueryClient } from "../../__tests__/test-utils";
import type { CsvUpload } from "@/types/csv-upload";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCsvUploads: vi.fn(),
    uploadCsv: vi.fn(),
    deleteCsvUpload: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

const SEASON_ID = "season-abc";

const mockUploads: CsvUpload[] = [
  {
    id: "upload-1",
    season_id: SEASON_ID,
    file_name: "stats-2026-01.csv",
    snapshot_date: "2026-01-15",
    record_count: 50,
    created_at: "2026-01-15T10:00:00Z",
  } as CsvUpload,
  {
    id: "upload-2",
    season_id: SEASON_ID,
    file_name: "stats-2026-02.csv",
    snapshot_date: "2026-02-15",
    record_count: 48,
    created_at: "2026-02-15T10:00:00Z",
  } as CsvUpload,
];

describe("csvUploadKeys", () => {
  it("builds correct key hierarchy", () => {
    expect(csvUploadKeys.all).toEqual(["csv-uploads"]);
    expect(csvUploadKeys.lists()).toEqual(["csv-uploads", "list"]);
    expect(csvUploadKeys.list("s1")).toEqual([
      "csv-uploads",
      "list",
      { seasonId: "s1" },
    ]);
    expect(csvUploadKeys.detail("u1")).toEqual([
      "csv-uploads",
      "detail",
      "u1",
    ]);
  });
});

describe("useCsvUploads", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("fetches uploads for a season", async () => {
    vi.mocked(apiClient.getCsvUploads).mockResolvedValueOnce(mockUploads);

    const { result } = renderHook(() => useCsvUploads(SEASON_ID), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockUploads);
    expect(apiClient.getCsvUploads).toHaveBeenCalledWith(SEASON_ID);
  });

  it("does not fetch when seasonId is empty", () => {
    const { result } = renderHook(() => useCsvUploads(""), { wrapper: createWrapper(queryClient) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useUploadCsv", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("calls uploadCsv with correct parameters", async () => {
    const mockResponse = { ...mockUploads[0], id: "new-upload" };
    vi.mocked(apiClient.uploadCsv).mockResolvedValueOnce(mockResponse);

    const file = new File(["csv data"], "test.csv", { type: "text/csv" });

    const { result } = renderHook(() => useUploadCsv(), { wrapper: createWrapper(queryClient) });

    act(() => {
      result.current.mutate({
        seasonId: SEASON_ID,
        file,
        snapshotDate: "2026-03-01",
        idempotencyKey: "key-123",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.uploadCsv).toHaveBeenCalledWith(
      SEASON_ID,
      file,
      "2026-03-01",
      "key-123"
    );
  });

  it("invalidates csv upload list on settled", async () => {
    vi.mocked(apiClient.uploadCsv).mockResolvedValueOnce(mockUploads[0]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const file = new File(["data"], "test.csv");
    const { result } = renderHook(() => useUploadCsv(), { wrapper: createWrapper(queryClient) });

    act(() => {
      result.current.mutate({ seasonId: SEASON_ID, file });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: csvUploadKeys.list(SEASON_ID),
    });
  });
});

describe("useDeleteCsvUpload", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });


  it("optimistically removes upload from cache", async () => {
    queryClient.setQueryData(csvUploadKeys.list(SEASON_ID), mockUploads);

    vi.mocked(apiClient.deleteCsvUpload).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50))
    );

    const { result } = renderHook(
      () => useDeleteCsvUpload(SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => { result.current.mutate("upload-1"); });

    // Optimistic: upload-1 should be removed immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<CsvUpload[]>(
        csvUploadKeys.list(SEASON_ID)
      );
      expect(cached).toHaveLength(1);
      expect(cached?.[0].id).toBe("upload-2");
    });
  });

  it("rolls back on delete failure", async () => {
    queryClient.setQueryData(csvUploadKeys.list(SEASON_ID), mockUploads);

    vi.mocked(apiClient.deleteCsvUpload).mockRejectedValueOnce(
      new Error("Forbidden")
    );

    const { result } = renderHook(
      () => useDeleteCsvUpload(SEASON_ID),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => { result.current.mutate("upload-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should rollback to original list
    const cached = queryClient.getQueryData<CsvUpload[]>(
      csvUploadKeys.list(SEASON_ID)
    );
    expect(cached).toHaveLength(2);
  });
});
