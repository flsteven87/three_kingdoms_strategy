/**
 * Event API
 *
 * Battle event CRUD and analytics endpoints.
 */

import { axiosInstance } from "./base-client";
import type {
  BattleEvent,
  EventListItem,
  EventAnalyticsResponse,
  EventGroupAnalytics,
  CreateEventRequest,
  UpdateEventRequest,
  EventUploadResponse,
  BatchAnalyticsResponse,
} from "@/types/event";

export async function getEvents(seasonId: string): Promise<EventListItem[]> {
  const response = await axiosInstance.get<EventListItem[]>("/api/v1/events", {
    params: { season_id: seasonId },
  });
  return response.data;
}

export async function getEvent(eventId: string): Promise<BattleEvent> {
  const response = await axiosInstance.get<BattleEvent>(
    `/api/v1/events/${eventId}`,
  );
  return response.data;
}

export async function getEventAnalytics(
  eventId: string,
): Promise<EventAnalyticsResponse> {
  const response = await axiosInstance.get<EventAnalyticsResponse>(
    `/api/v1/events/${eventId}/analytics`,
  );
  return response.data;
}

export async function createEvent(
  seasonId: string,
  data: CreateEventRequest,
): Promise<BattleEvent> {
  const response = await axiosInstance.post<BattleEvent>(
    "/api/v1/events",
    data,
    {
      params: { season_id: seasonId },
    },
  );
  return response.data;
}

/**
 * Upload CSV for event analysis (separate from regular data management uploads)
 *
 * Unlike regular uploads, event CSV uploads:
 * - Do NOT trigger period calculation
 * - Can have multiple uploads on the same day
 * - Are stored with upload_type='event'
 */
export async function uploadEventCsv(
  seasonId: string,
  file: File,
  snapshotDate?: string,
): Promise<EventUploadResponse> {
  const formData = new FormData();
  formData.append("season_id", seasonId);
  formData.append("file", file);
  if (snapshotDate) {
    formData.append("snapshot_date", snapshotDate);
  }

  // IMPORTANT: Must set Content-Type to undefined to let axios
  // automatically set multipart/form-data with correct boundary.
  const response = await axiosInstance.post<EventUploadResponse>(
    "/api/v1/events/upload-csv",
    formData,
    { headers: { "Content-Type": undefined } },
  );
  return response.data;
}

export async function processEvent(
  eventId: string,
  beforeUploadId: string,
  afterUploadId: string,
): Promise<BattleEvent> {
  const response = await axiosInstance.post<BattleEvent>(
    `/api/v1/events/${eventId}/process`,
    {
      before_upload_id: beforeUploadId,
      after_upload_id: afterUploadId,
    },
  );
  return response.data;
}

/**
 * Update event's basic information (name, event_type, description)
 */
export async function updateEvent(
  eventId: string,
  data: UpdateEventRequest,
): Promise<BattleEvent> {
  const response = await axiosInstance.patch<BattleEvent>(
    `/api/v1/events/${eventId}`,
    data,
  );
  return response.data;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/events/${eventId}`);
}

/**
 * Get group-level analytics for LINE Bot report preview
 */
export async function getEventGroupAnalytics(
  eventId: string,
): Promise<EventGroupAnalytics> {
  const response = await axiosInstance.get<EventGroupAnalytics>(
    `/api/v1/events/${eventId}/group-analytics`,
  );
  return response.data;
}

/**
 * Get analytics for multiple events in a single request
 */
export async function getBatchEventAnalytics(
  eventIds: string[],
): Promise<BatchAnalyticsResponse> {
  const response = await axiosInstance.post<BatchAnalyticsResponse>(
    "/api/v1/events/batch-analytics",
    { event_ids: eventIds },
  );
  return response.data;
}
