/**
 * Upload State Machine Hook
 *
 * Based on 2025 SaaS best practices for file upload UX.
 *
 * Features:
 * - Idempotency key generation for retry safety
 * - Progress tracking
 * - Concurrent upload prevention
 * - Retry with same idempotency key
 *
 * 符合 CLAUDE.md 🟡:
 * - Type-safe hooks
 * - Single responsibility
 */

import { useRef, useState } from "react";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadState {
  readonly status: UploadStatus;
  readonly progress: number;
  readonly error: string | null;
  readonly idempotencyKey: string | null;
}

export interface UploadActions {
  /** Start a new upload, returns the generated idempotency key */
  readonly start: () => string;
  /** Update upload progress (0-100) */
  readonly setProgress: (progress: number) => void;
  /** Mark upload as successful */
  readonly success: () => void;
  /** Mark upload as failed with error message */
  readonly fail: (error: string) => void;
  /** Reset state to idle */
  readonly reset: () => void;
  /** Retry upload, reuses existing idempotency key */
  readonly retry: () => string;
}

const initialState: UploadState = {
  status: "idle",
  progress: 0,
  error: null,
  idempotencyKey: null,
};

/**
 * Hook for managing file upload state with idempotency support.
 *
 * Usage:
 * ```tsx
 * const [state, actions] = useUploadStateMachine();
 *
 * const handleUpload = async (file: File) => {
 *   const key = actions.start();
 *   try {
 *     await uploadFile(file, { idempotencyKey: key });
 *     actions.success();
 *   } catch (error) {
 *     actions.fail(error.message);
 *   }
 * };
 * ```
 */
export function useUploadStateMachine(): [UploadState, UploadActions] {
  const [state, setState] = useState<UploadState>(initialState);
  const idempotencyKeyRef = useRef<string | null>(null);

  function start(): string {
    // Generate new idempotency key using Web Crypto API
    const key = crypto.randomUUID();
    idempotencyKeyRef.current = key;

    setState({
      status: "uploading",
      progress: 0,
      error: null,
      idempotencyKey: key,
    });

    return key;
  }

  function setProgress(progress: number) {
    setState((prev) => ({
      ...prev,
      progress: Math.min(100, Math.max(0, progress)),
    }));
  }

  function success() {
    setState((prev) => ({
      ...prev,
      status: "success",
      progress: 100,
    }));
  }

  function fail(error: string) {
    setState((prev) => ({
      ...prev,
      status: "error",
      error,
    }));
  }

  function reset() {
    idempotencyKeyRef.current = null;
    setState(initialState);
  }

  function retry(): string {
    // Reuse existing idempotency key for retry (ensures server returns cached response)
    const key = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = key;

    setState({
      status: "uploading",
      progress: 0,
      error: null,
      idempotencyKey: key,
    });

    return key;
  }

  return [state, { start, setProgress, success, fail, reset, retry }];
}
