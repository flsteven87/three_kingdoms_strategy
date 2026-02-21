/**
 * LIFF Session Hook
 *
 * Initializes LIFF SDK and provides session data for LIFF pages.
 * Handles login flow and extracts group ID from URL params.
 *
 * IMPORTANT: URL params (g, e) are saved to sessionStorage BEFORE liff.init()
 * because the OAuth login flow will replace the URL with callback params,
 * losing the original liff.state parameters.
 */

import { useEffect, useState } from "react";
import liff from "@line/liff";

export interface LiffSession {
  lineUserId: string;
  lineDisplayName: string;
  lineGroupId: string | null;
  eventId: string | null;
}

/**
 * Narrowed session type for components that require lineGroupId.
 * Used after LiffLayout validates lineGroupId is present.
 */
export interface LiffSessionWithGroup extends Omit<LiffSession, "lineGroupId"> {
  lineGroupId: string;
}

type LiffState =
  | { status: "loading" }
  | { status: "ready"; session: LiffSession }
  | { status: "error"; error: string };

const LIFF_PARAMS_KEY = "liff_params";

function getParamsFromLiffUrl(): Record<string, string> {
  const qs = new URLSearchParams(window.location.search);
  const state = qs.get("liff.state");

  const raw = state ? decodeURIComponent(state) : window.location.href;

  const query = raw.includes("?") ? raw.split("?")[1] : "";

  const params = Object.fromEntries(new URLSearchParams(query).entries());

  return params;
}

/**
 * Check if current URL is an OAuth callback (contains 'code' param).
 * We should NOT overwrite saved params when returning from OAuth.
 */
function isOAuthCallback(): boolean {
  const qs = new URLSearchParams(window.location.search);
  return qs.has("code") && qs.has("liffClientId");
}

/**
 * Save LIFF params to sessionStorage before login redirect.
 * This preserves g (groupId) and e (eventId) across OAuth flow.
 * IMPORTANT: Skip saving if this is an OAuth callback (would overwrite good params).
 */
function saveParamsBeforeLogin(): void {
  // Don't overwrite saved params when returning from OAuth
  if (isOAuthCallback()) {
    return;
  }

  const params = getParamsFromLiffUrl();
  if (params.g || params.e) {
    sessionStorage.setItem(LIFF_PARAMS_KEY, JSON.stringify(params));
  }
}

/**
 * Retrieve saved LIFF params from sessionStorage after login.
 * Clears the storage after retrieval.
 */
function getSavedParams(): Record<string, string> | null {
  const saved = sessionStorage.getItem(LIFF_PARAMS_KEY);
  if (saved) {
    sessionStorage.removeItem(LIFF_PARAMS_KEY);
    return JSON.parse(saved) as Record<string, string>;
  }
  return null;
}

export function useLiffSession(liffId: string): LiffState {
  const [state, setState] = useState<LiffState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    // CRITICAL: Save params BEFORE liff.init() because OAuth redirect loses them
    saveParamsBeforeLogin();

    async function initLiff() {
      try {
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();

        // Try to get params from URL first, then fall back to saved params
        let params = getParamsFromLiffUrl();
        if (!params.g && !params.e) {
          const savedParams = getSavedParams();
          if (savedParams) {
            params = savedParams;
          }
        }

        const groupId = params.g || params.groupId || null;
        const eventId = params.e || params.eventId || null;

        if (!cancelled) {
          setState({
            status: "ready",
            session: {
              lineUserId: profile.userId,
              lineDisplayName: profile.displayName,
              lineGroupId: groupId,
              eventId: eventId,
            },
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    initLiff();

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return state;
}
