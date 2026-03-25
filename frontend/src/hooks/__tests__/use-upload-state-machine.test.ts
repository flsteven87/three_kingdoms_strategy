import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useUploadStateMachine } from "../use-upload-state-machine";

vi.stubGlobal("crypto", {
  randomUUID: vi
    .fn()
    .mockReturnValueOnce("uuid-1")
    .mockReturnValueOnce("uuid-2")
    .mockReturnValueOnce("uuid-3"),
});

describe("useUploadStateMachine", () => {
  describe("initial state", () => {
    it("starts in idle with zero progress and no error", () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const [state] = result.current;

      expect(state).toEqual({
        status: "idle",
        progress: 0,
        error: null,
        idempotencyKey: null,
      });
    });
  });

  describe("start", () => {
    it("transitions to uploading with a new idempotency key", () => {
      const { result } = renderHook(() => useUploadStateMachine());

      let key: string;
      act(() => {
        key = result.current[1].start();
      });

      const [state] = result.current;
      expect(state.status).toBe("uploading");
      expect(state.progress).toBe(0);
      expect(state.error).toBeNull();
      expect(state.idempotencyKey).toBe(key!);
    });

    it("returns a uuid string", () => {
      const { result } = renderHook(() => useUploadStateMachine());

      let key: string;
      act(() => {
        key = result.current[1].start();
      });

      expect(key!).toBeDefined();
      expect(typeof key!).toBe("string");
    });
  });

  describe("setProgress", () => {
    it("updates progress value", () => {
      const { result } = renderHook(() => useUploadStateMachine());
      act(() => { result.current[1].start(); });
      act(() => { result.current[1].setProgress(42); });

      expect(result.current[0].progress).toBe(42);
    });

    it("clamps progress to 0-100 range", () => {
      const { result } = renderHook(() => useUploadStateMachine());
      act(() => { result.current[1].start(); });

      act(() => { result.current[1].setProgress(150); });
      expect(result.current[0].progress).toBe(100);

      act(() => { result.current[1].setProgress(-10); });
      expect(result.current[0].progress).toBe(0);
    });
  });

  describe("success", () => {
    it("transitions to success with 100% progress", () => {
      const { result } = renderHook(() => useUploadStateMachine());
      act(() => { result.current[1].start(); });
      act(() => { result.current[1].setProgress(50); });
      act(() => { result.current[1].success(); });

      const [state] = result.current;
      expect(state.status).toBe("success");
      expect(state.progress).toBe(100);
    });
  });

  describe("fail", () => {
    it("transitions to error with error message", () => {
      const { result } = renderHook(() => useUploadStateMachine());
      act(() => { result.current[1].start(); });
      act(() => { result.current[1].fail("Network timeout"); });

      const [state] = result.current;
      expect(state.status).toBe("error");
      expect(state.error).toBe("Network timeout");
    });
  });

  describe("reset", () => {
    it("returns to initial idle state", () => {
      const { result } = renderHook(() => useUploadStateMachine());
      act(() => { result.current[1].start(); });
      act(() => { result.current[1].fail("oops"); });
      act(() => { result.current[1].reset(); });

      expect(result.current[0]).toEqual({
        status: "idle",
        progress: 0,
        error: null,
        idempotencyKey: null,
      });
    });
  });

  describe("retry", () => {
    it("reuses the existing idempotency key", () => {
      const { result } = renderHook(() => useUploadStateMachine());

      let originalKey: string;
      act(() => { originalKey = result.current[1].start(); });
      act(() => { result.current[1].fail("error"); });

      let retryKey: string;
      act(() => { retryKey = result.current[1].retry(); });

      expect(retryKey!).toBe(originalKey!);
      expect(result.current[0].status).toBe("uploading");
      expect(result.current[0].progress).toBe(0);
      expect(result.current[0].error).toBeNull();
    });
  });
});
