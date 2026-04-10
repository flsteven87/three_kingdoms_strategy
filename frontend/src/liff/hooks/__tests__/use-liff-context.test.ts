/**
 * Tests for useLiffContext hook
 *
 * useLiffContext wraps useOutletContext from react-router-dom.
 * We test that it correctly returns the context from the outlet.
 */

import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useLiffContext } from "../use-liff-context";
import type { LiffContextType } from "../../components/LiffLayout";
import type { LiffSessionWithGroup } from "../use-liff-session";

// Mock react-router-dom to control what useOutletContext returns
vi.mock("react-router-dom", () => ({
  useOutletContext: vi.fn(),
}));

import { useOutletContext } from "react-router-dom";

const mockSession: LiffSessionWithGroup = {
  lineUserId: "user-123",
  lineDisplayName: "Test User",
  lineGroupId: "group-456",
  eventId: null,
};

const mockLiffContext: LiffContextType = {
  session: mockSession,
};

describe("useLiffContext", () => {
  it("returns the outlet context provided by LiffLayout", () => {
    vi.mocked(useOutletContext<LiffContextType>).mockReturnValue(mockLiffContext);

    const { result } = renderHook(() => useLiffContext());

    expect(result.current).toEqual(mockLiffContext);
  });

  it("returns session with lineGroupId as a string (LiffSessionWithGroup)", () => {
    vi.mocked(useOutletContext<LiffContextType>).mockReturnValue(mockLiffContext);

    const { result } = renderHook(() => useLiffContext());

    expect(result.current.session.lineGroupId).toBe("group-456");
    expect(typeof result.current.session.lineGroupId).toBe("string");
  });

  it("returns session with eventId when present", () => {
    const contextWithEvent: LiffContextType = {
      session: { ...mockSession, eventId: "event-789" },
    };
    vi.mocked(useOutletContext<LiffContextType>).mockReturnValue(contextWithEvent);

    const { result } = renderHook(() => useLiffContext());

    expect(result.current.session.eventId).toBe("event-789");
  });

  it("returns session with null eventId when not present", () => {
    vi.mocked(useOutletContext<LiffContextType>).mockReturnValue(mockLiffContext);

    const { result } = renderHook(() => useLiffContext());

    expect(result.current.session.eventId).toBeNull();
  });

  it("calls useOutletContext on render", () => {
    vi.mocked(useOutletContext<LiffContextType>).mockReturnValue(mockLiffContext);

    renderHook(() => useLiffContext());

    expect(useOutletContext).toHaveBeenCalled();
  });
});
