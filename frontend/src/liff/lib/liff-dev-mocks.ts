/**
 * LIFF Dev Mocks
 *
 * Fixture-based response interceptor for LIFF API endpoints.
 * Active ONLY when:
 *   1. `import.meta.env.DEV` (tree-shaken from production builds)
 *   2. URL contains `?dev=1`
 *
 * Lets designers preview LIFF UI in a regular browser without LINE context
 * or backend availability. NOT a test double — fixtures are static and
 * mutations are stored in module-local state for the session.
 */

import type {
  CopperCoordinateLookupResult,
  CopperCoordinateSearchResult,
  CopperMine,
  CopperMineListResponse,
  CopperMineRule,
  MemberCandidatesResponse,
  MemberInfoResponse,
  RegisterCopperResponse,
  SimilarMembersResponse,
} from "./liff-api-client";

export function isDevMockActive(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("dev") === "1";
}

// ---- Mutable session state ----

let mineIdCounter = 1000;
const mockMines: CopperMine[] = [
  {
    id: "mine-1",
    game_id: "玄德",
    coord_x: 200,
    coord_y: 300,
    level: 9,
    status: "active",
    notes: null,
    registered_at: "2026-04-20T10:00:00Z",
    claimed_tier: 1,
  },
  {
    id: "mine-2",
    game_id: "玄德",
    coord_x: 310,
    coord_y: 420,
    level: 10,
    status: "active",
    notes: null,
    registered_at: "2026-04-22T10:00:00Z",
    claimed_tier: 2,
  },
  {
    id: "mine-3",
    game_id: "孟德",
    coord_x: 50,
    coord_y: 80,
    level: 10,
    status: "active",
    notes: null,
    registered_at: "2026-04-23T10:00:00Z",
    claimed_tier: 1,
  },
  {
    id: "mine-4",
    game_id: "周郎",
    coord_x: 410,
    coord_y: 520,
    level: 9,
    status: "active",
    notes: null,
    registered_at: "2026-04-19T10:00:00Z",
    claimed_tier: 1,
  },
  {
    id: "mine-5",
    game_id: "雲長",
    coord_x: 88,
    coord_y: 99,
    level: 10,
    status: "active",
    notes: null,
    registered_at: "2026-04-18T10:00:00Z",
    claimed_tier: 1,
  },
];

// ---- Static fixtures ----

const memberInfo: MemberInfoResponse = {
  has_registered: true,
  registered_ids: [
    {
      game_id: "玄德",
      display_name: "劉備",
      is_verified: true,
      created_at: "2026-04-01T00:00:00Z",
    },
    {
      game_id: "孟德",
      display_name: null,
      is_verified: false,
      created_at: "2026-04-15T00:00:00Z",
    },
  ],
  alliance_name: "桃園盟",
};

const rules: CopperMineRule[] = [
  { tier: 1, required_merit: 0, allowed_level: "nine" },
  { tier: 2, required_merit: 50_000, allowed_level: "ten" },
  { tier: 3, required_merit: 100_000, allowed_level: "ten" },
  { tier: 4, required_merit: 200_000, allowed_level: "ten" },
];

const merit: Record<string, number> = {
  玄德: 250_000,
  孟德: 80_000,
};

// Pretend coords: (123,456) hits source as Lv.10; (200,300) is taken;
// (999,*) is outside source (manual level required).
const sourceCoords: Record<string, { level: number; county: string; district: string }> = {
  "123,456": { level: 10, county: "沛國", district: "沛縣" },
  "124,460": { level: 10, county: "沛國", district: "沛縣" },
  "130,470": { level: 9, county: "沛國", district: "蕭縣" },
  "310,420": { level: 10, county: "河內", district: "野王" },
  "200,300": { level: 9, county: "陳留", district: "許昌" },
  "88,99": { level: 10, county: "汝南", district: "平輿" },
  "410,520": { level: 9, county: "陳留", district: "雍丘" },
  "50,80": { level: 10, county: "涿郡", district: "涿縣" },
};

// ---- Handlers ----

function buildListResponse(): CopperMineListResponse {
  const counts: Record<string, number> = {};
  for (const m of mockMines) counts[m.game_id] = (counts[m.game_id] ?? 0) + 1;
  return {
    mines: [...mockMines],
    total: mockMines.length,
    mine_counts_by_game_id: counts,
    merit_by_game_id: { ...merit },
    max_allowed: 4,
    has_source_data: true,
    current_game_season_tag: "PK23",
    available_counties: ["沛國", "陳留", "河內", "汝南", "涿郡"],
  };
}

function lookupCoord(x: number, y: number): CopperCoordinateLookupResult {
  const key = `${x},${y}`;
  const taken = mockMines.some((m) => m.coord_x === x && m.coord_y === y);
  const src = sourceCoords[key];
  if (taken) {
    return {
      coord_x: x,
      coord_y: y,
      level: src?.level ?? null,
      county: src?.county ?? null,
      district: src?.district ?? null,
      is_taken: true,
      can_register: false,
      requires_manual_level: false,
      message: "此座標已被註冊",
    };
  }
  if (src) {
    return {
      coord_x: x,
      coord_y: y,
      level: src.level,
      county: src.county,
      district: src.district,
      is_taken: false,
      can_register: true,
      requires_manual_level: false,
      message: null,
    };
  }
  return {
    coord_x: x,
    coord_y: y,
    level: null,
    county: null,
    district: null,
    is_taken: false,
    can_register: true,
    requires_manual_level: true,
    message: "座標不在官方資料中，請確認等級",
  };
}

function searchCounty(q: string): CopperCoordinateSearchResult[] {
  if (!q) return [];
  const results: CopperCoordinateSearchResult[] = [];
  for (const [key, info] of Object.entries(sourceCoords)) {
    if (info.county.includes(q) || info.district.includes(q)) {
      const [x, y] = key.split(",").map(Number);
      const taken = mockMines.some((m) => m.coord_x === x && m.coord_y === y);
      results.push({
        coord_x: x,
        coord_y: y,
        level: info.level,
        county: info.county,
        district: info.district,
        is_taken: taken,
      });
    }
  }
  return results.sort((a, b) => a.coord_x - b.coord_x);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Match a request URL to a fixture handler. Returns null if no fixture exists,
 * letting the real network call proceed (still 401 in dev).
 */
export async function handleDevMock(
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  const u = new URL(url, "http://localhost");
  const path = u.pathname;
  const method = (init.method || "GET").toUpperCase();

  // Member
  if (path.endsWith("/api/v1/linebot/member/info") && method === "GET") {
    return jsonResponse(memberInfo);
  }
  if (path.endsWith("/api/v1/linebot/member/candidates") && method === "GET") {
    const data: MemberCandidatesResponse = {
      candidates: [
        { name: "玄德", group_name: "蜀組" },
        { name: "孟德", group_name: "魏組" },
        { name: "仲謀", group_name: "吳組" },
      ],
    };
    return jsonResponse(data);
  }
  if (path.endsWith("/api/v1/linebot/member/similar") && method === "GET") {
    const data: SimilarMembersResponse = { similar: [], has_exact_match: true };
    return jsonResponse(data);
  }

  // Copper
  if (path.endsWith("/api/v1/linebot/copper/list") && method === "GET") {
    return jsonResponse(buildListResponse());
  }
  if (path.endsWith("/api/v1/linebot/copper/rules") && method === "GET") {
    return jsonResponse(rules);
  }
  if (path.endsWith("/api/v1/linebot/copper/lookup") && method === "GET") {
    const x = Number(u.searchParams.get("x"));
    const y = Number(u.searchParams.get("y"));
    return jsonResponse(lookupCoord(x, y));
  }
  if (path.endsWith("/api/v1/linebot/copper/search") && method === "GET") {
    const q = u.searchParams.get("q") || "";
    return jsonResponse(searchCounty(q));
  }
  if (path.endsWith("/api/v1/linebot/copper/register") && method === "POST") {
    const body = init.body ? JSON.parse(init.body as string) : {};
    // Mirror backend: pick lowest unclaimed tier matching level/merit if no
    // explicit claimedTier was sent, otherwise honor the user's choice.
    const claimedByThisMember = new Set(
      mockMines
        .filter((m) => m.game_id === body.gameId && m.claimed_tier != null)
        .map((m) => m.claimed_tier!),
    );
    let assignedTier: number | null = body.claimedTier ?? null;
    if (assignedTier === null) {
      const sorted = [...rules].sort((a, b) => a.tier - b.tier);
      const memberMerit = merit[body.gameId] ?? 0;
      for (const r of sorted) {
        if (claimedByThisMember.has(r.tier)) continue;
        if (memberMerit < r.required_merit) continue;
        const levelOk =
          r.allowed_level === "both" ||
          (r.allowed_level === "nine" && body.level === 9) ||
          (r.allowed_level === "ten" && body.level === 10);
        if (!levelOk) continue;
        assignedTier = r.tier;
        break;
      }
    }
    const newMine: CopperMine = {
      id: `mine-${++mineIdCounter}`,
      game_id: body.gameId,
      coord_x: body.coordX,
      coord_y: body.coordY,
      level: body.level,
      status: "active",
      notes: body.notes ?? null,
      registered_at: new Date().toISOString(),
      claimed_tier: assignedTier,
    };
    mockMines.unshift(newMine);
    const data: RegisterCopperResponse = {
      success: true,
      mine: newMine,
      message: null,
    };
    return jsonResponse(data);
  }
  if (path.match(/\/api\/v1\/linebot\/copper\/[^/]+$/) && method === "DELETE") {
    const id = path.split("/").pop()!;
    const idx = mockMines.findIndex((m) => m.id === id);
    if (idx >= 0) mockMines.splice(idx, 1);
    return new Response(null, { status: 204 });
  }

  return null;
}
