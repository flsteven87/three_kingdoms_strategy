/**
 * CSV Upload API
 *
 * CSV file upload and management endpoints.
 */

import { axiosInstance } from "./base-client";
import type { CsvUpload, CsvUploadResponse } from "@/types/csv-upload";

export async function getCsvUploads(seasonId: string): Promise<CsvUpload[]> {
  const response = await axiosInstance.get<{
    uploads: CsvUpload[];
    total: number;
  }>("/api/v1/uploads", {
    params: { season_id: seasonId },
  });
  return response.data.uploads;
}

export interface UploadCsvOptions {
  readonly seasonId: string;
  readonly file: File;
  readonly snapshotDate?: string;
  /** Idempotency key for retry safety (Stripe-style pattern) */
  readonly idempotencyKey?: string;
}

export async function uploadCsv(
  seasonId: string,
  file: File,
  snapshotDate?: string,
  idempotencyKey?: string,
): Promise<CsvUploadResponse> {
  const formData = new FormData();
  formData.append("season_id", seasonId);
  formData.append("file", file);
  if (snapshotDate) {
    formData.append("snapshot_date", snapshotDate);
  }

  // Build headers with optional idempotency key for retry safety
  const headers: Record<string, string | undefined> = {
    // IMPORTANT: Must set Content-Type to undefined to let axios automatically
    // set multipart/form-data with correct boundary parameter.
    "Content-Type": undefined,
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const response = await axiosInstance.post<CsvUploadResponse>(
    "/api/v1/uploads",
    formData,
    {
      headers,
    },
  );
  return response.data;
}

export async function deleteCsvUpload(uploadId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/uploads/${uploadId}`);
}
