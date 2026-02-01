/**
 * LIFF Layout
 *
 * Compact layout for LIFF Tall mode (bottom sheet style).
 * Optimized for ~70% viewport height.
 *
 * Conditional rendering:
 * - If eventId is present: render LiffEventReport
 * - Otherwise: render normal LIFF home via Outlet
 */

import { Outlet } from "react-router-dom";
import {
  useLiffSession,
  type LiffSessionWithGroup,
} from "../hooks/use-liff-session";
import { LiffEventReport } from "../pages/LiffEventReport";

const LIFF_ID = import.meta.env.VITE_LIFF_ID || "";

/**
 * Context type passed to child routes via Outlet.
 * Uses LiffSessionWithGroup since we validate lineGroupId before rendering children.
 */
export type LiffContextType = {
  session: LiffSessionWithGroup;
};

export function LiffLayout() {
  const state = useLiffSession(LIFF_ID);

  if (!LIFF_ID) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-destructive">LIFF ID not configured</p>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-destructive">{state.error}</p>
        </div>
      </div>
    );
  }

  if (!state.session.lineGroupId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            請從 LINE 群組中開啟此頁面
          </p>
        </div>
      </div>
    );
  }

  // Narrow session type after lineGroupId guard
  const session: LiffSessionWithGroup = {
    ...state.session,
    lineGroupId: state.session.lineGroupId,
  };

  // If eventId is present, render the event report page directly
  if (session.eventId) {
    return (
      <div className="h-full bg-background overflow-auto">
        <LiffEventReport session={session} eventId={session.eventId} />
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-auto">
      <Outlet context={{ session } satisfies LiffContextType} />
    </div>
  );
}
