/**
 * Detects when the running bundle is older than the deployed bundle.
 *
 * The browser / LINE WebView may keep a stale index.html in cache, so even
 * after a fresh deploy, returning users can stay on the old JS hash. We poll
 * /build-info.json (served no-cache) when the tab becomes visible and prompt
 * the user to reload when the deployed buildId differs from the embedded one.
 *
 * No initial check on boot — a freshly-loaded page is by definition on the
 * latest build, so the first check would always be a no-op.
 */

import { toast } from "sonner";

const BUILD_INFO_URL = "/build-info.json";
const MIN_POLL_INTERVAL_MS = 30_000;
const CURRENT_BUILD_ID = __BUILD_ID__;

let initialized = false;
let lastCheckAt = 0;
let promptedBuildId: string | null = null;

type BuildInfo = { buildId?: string };

async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const response = await fetch(BUILD_INFO_URL, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as BuildInfo;
    return typeof data.buildId === "string" ? data.buildId : null;
  } catch {
    return null;
  }
}

function promptReload(deployedBuildId: string) {
  if (promptedBuildId === deployedBuildId) return;

  toast("有新版本可用", {
    description: "點擊「立即更新」載入最新功能。",
    duration: Infinity,
    action: {
      label: "立即更新",
      onClick: () => {
        window.location.reload();
      },
    },
  });
  // Set after toast() succeeds so a transient throw lets the next visibility
  // change retry instead of silently locking the user out of the prompt.
  promptedBuildId = deployedBuildId;
}

async function checkOnce() {
  const now = Date.now();
  if (now - lastCheckAt < MIN_POLL_INTERVAL_MS) return;
  lastCheckAt = now;

  const deployed = await fetchDeployedBuildId();
  if (!deployed) return;
  if (deployed === CURRENT_BUILD_ID) return;
  promptReload(deployed);
}

export function startBuildVersionCheck() {
  if (initialized) return;
  if (typeof document === "undefined") return;
  initialized = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkOnce();
  });
}
