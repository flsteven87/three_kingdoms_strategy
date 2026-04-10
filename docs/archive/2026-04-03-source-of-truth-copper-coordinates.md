## Plan: Source of Truth 銅礦坐標

### TL;DR
新增 `copper_mine_coordinates` 參考資料表，儲存每個遊戲賽季（PK20、PK23 等）的官方銅礦位置。Alliance 的 season 新增 `game_season_tag` 欄位來關聯對應的遊戲賽季。註冊邏輯在有 source of truth 時驗證坐標有效性並覆蓋等級；LIFF 和 Dashboard 搜尋增加按郡/縣名搜尋功能。

---

### Steps

#### Phase 1: Database Schema (1 commit)

1. **建立 `copper_mine_coordinates` 表** — 官方銅礦參考資料
   - 欄位：`id` (UUID PK), `game_season_tag` (VARCHAR, 如 'PK23'), `county` (VARCHAR, 郡), `district` (VARCHAR, 縣), `coord_x` (INT), `coord_y` (INT), `level` (INT, 8/9/10)
   - Unique constraint: `(game_season_tag, coord_x, coord_y)`
   - Index: `(game_season_tag, district)`, `(game_season_tag, county)`

2. **ALTER `seasons` 表** — 新增 `game_season_tag VARCHAR NULL`
   - NULL 表示該賽季無 source of truth 資料

3. 產出：`backend/migrations/20260403_add_copper_mine_coordinates.sql`

#### Phase 2: Import Script (1 commit)

4. **建立匯入腳本** `backend/scripts/import_copper_coordinates.py`
   - 用 `openpyxl` 讀取 Excel，解析欄位：資源名稱、等級、坐標 "(x, y)"、郡、縣
   - CLI: `uv run python backend/scripts/import_copper_coordinates.py --file path.xlsx --season-tag PK23`

5. **新增依賴** `uv add openpyxl`

#### Phase 3: Backend Models & Repository (1 commit)

6. **新 model** `backend/src/models/copper_mine_coordinate.py` — Entity + Response models

7. **新 repository** `backend/src/repositories/copper_mine_coordinate_repository.py`
   - `get_by_coords(game_season_tag, coord_x, coord_y)` — 座標查詢
   - `has_data(game_season_tag)` — 檢查該 tag 是否有任何資料存在
   - `search_by_location(game_season_tag, query)` — 搜尋郡/縣名（ilike）
   - 繼承 `SupabaseRepository`

8. **更新 Season model** — `SeasonBase` 加 `game_season_tag: str | None = None`

#### Phase 4: Backend Service Logic (1 commit)

9. **更新 `CopperMineService.register_mine()`**
   - 取得 season 的 `game_season_tag`
   - 有 tag 且該 tag 在 `copper_mine_coordinates` 有資料 → 查 source of truth：座標存在則覆蓋等級，不存在則拒絕（400）
   - 無 tag 或該 tag 無資料 → 維持現行邏輯（使用用戶提供的等級）
   - **同時更新 `create_ownership()`**（Dashboard）使用相同邏輯

10. **新 method** `search_copper_coordinates(line_group_id, query)`
    - 查詢可用的 9/10 級銅礦（排除已註冊的）
    - 按郡/縣名搜尋

#### Phase 5: Backend API Endpoints (1 commit)

11. **新 LIFF endpoint** `GET /copper/search?g={groupId}&q={query}` — 在 `linebot.py`

12. **新 Dashboard endpoint** `GET /copper-mines/coordinates/search?q={query}&season_id={uuid}` — 在 `copper_mines.py`

13. **更新 `CopperMineListResponse`** — 新增 `has_source_data: bool` 讓前端決定是否顯示縣名搜尋
    - `has_source_data` = season 有 `game_season_tag` 且該 tag 在 `copper_mine_coordinates` 有資料

#### Phase 6: Frontend — Season Config (1 commit)

14. **更新 Season type** — 加 `game_season_tag: string | null`
15. **更新 Season 建立/編輯表單** — 新增 `game_season_tag` 下拉選單

#### Phase 7: Frontend — LIFF 搜尋增強 (1 commit)

16. **更新 copper mine types** — 新增搜尋結果型別、`has_source_data`
17. **更新 LIFF API client** — 新增 `searchCopperCoordinates()`
18. **新增 LIFF hook** — `useLiffCopperSearch()` 帶防抖搜尋
19. **更新 `CopperTab.tsx`** — 智慧搜尋框：
    - 偵測輸入是數字（座標）還是文字（郡/縣名）
    - 文字輸入 → 呼叫搜尋 API → 顯示可用銅礦下拉列表
    - 選取後自動填入 X、Y、等級（等級變唯讀）
    - 數字輸入 → 保持現有座標搜尋

#### Phase 8: Frontend — Dashboard 增強 (1 commit)

20. **更新 `CopperMineFormDialog.tsx`** — 新增座標搜尋功能
21. **更新 Dashboard hooks/API** — 新增搜尋 hook 和 API call

---

### Relevant Files

**新檔案**
- `backend/migrations/20260403_add_copper_mine_coordinates.sql`
- `backend/src/models/copper_mine_coordinate.py`
- `backend/src/repositories/copper_mine_coordinate_repository.py`
- `backend/scripts/import_copper_coordinates.py`

**修改檔案 — Backend**
- `backend/src/models/season.py` — 加 `game_season_tag`
- `backend/src/models/copper_mine.py` — 加 `has_source_data`、搜尋 response models
- `backend/src/services/copper_mine_service.py` — 核心：source of truth 驗證、等級覆蓋、搜尋
- `backend/src/repositories/__init__.py` — Export 新 repository
- `backend/src/core/dependencies.py` — DI 注入新 repository 到 service
- `backend/src/api/v1/endpoints/linebot.py` — 新 `/copper/search` endpoint
- `backend/src/api/v1/endpoints/copper_mines.py` — 新搜尋 endpoint
- `backend/pyproject.toml` — 加 `openpyxl`

**修改檔案 — Frontend**
- Season type 定義檔 — 加 `game_season_tag`
- `frontend/src/types/copper-mine.ts` — 搜尋結果型別
- `frontend/src/liff/lib/liff-api-client.ts` — 搜尋 API
- `frontend/src/liff/hooks/use-liff-copper.ts` — 搜尋 hook
- `frontend/src/liff/pages/CopperTab.tsx` — 智慧搜尋 UI
- `frontend/src/lib/api/copper-mine-api.ts` — Dashboard 搜尋 API
- `frontend/src/hooks/use-copper-mines.ts` — Dashboard 搜尋 hook
- `frontend/src/components/copper-mines/CopperMineFormDialog.tsx` — Dashboard 表單搜尋
- Season 建立/編輯表單元件 — `game_season_tag` dropdown

---

### Verification

1. **Migration** — SQL Editor 執行後驗證表建立、seasons alter 成功
2. **Import** — 用範例 Excel 執行腳本，驗證 "(x, y)" 格式正確解析
3. **有 source of truth 的註冊** — 有效座標 → 等級被覆蓋；無效座標 → 400 錯誤
4. **無 source of truth 的註冊** — 現行行為不變
5. **LIFF 搜尋** — 輸入縣名 → 顯示可用 9/10 銅礦列表 → 選取自動填入
6. **Dashboard 搜尋** — 同上
7. **Lint** — `uv run ruff check .` 和 `npm run lint` 通過

---

### Decisions

- **Source of truth 表是全域的**（非 per-alliance）—— 銅礦座標是遊戲全局的，所有同盟在同一遊戲賽季共用
- **`game_season_tag` 可為 NULL** —— NULL = 無 source data，向後相容
- **有 tag 不等於有資料** —— season 設了 `game_season_tag` 但 `copper_mine_coordinates` 無該 tag 資料時，視同無 tag 處理
- **等級 8 也存入** source of truth 表，但搜尋只回傳 9/10
- **座標驗證是嚴格的** —— 有 source of truth 時，不在表中的座標會被拒絕
- **等級覆蓋是靜默的** —— 後端覆蓋不報錯，前端在 response 中看到正確等級
- **匯入用 script** —— 不建 Dashboard 上傳 UI，避免不必要的複雜度
- **seasons 到 copper_mine_coordinates 無 FK** —— 允許彈性的資料載入順序

### Game Season Tags

| Tag | Name |
|-----|------|
| PK1 | 群雄割據 |
| PK2 | 天下爭鋒 |
| PK3 | 英雄露穎 |
| PK4 | 赤壁之戰 |
| PK5 | 軍爭地利 |
| PK6 | 興師伐亂 |
| PK7 | 北定中原 |
| PK8 | 官渡之戰 |
| PK9 | 王師秉節 |
| PK10 | 英雄集結 |
| PK11 | 兵戰四時 |
| PK12 | 襄樊之戰 |
| PK13 | 雲起龍襄 |
| PK14 | 天師舉義 |
| PK15 | 陳倉之戰 |
| PK16 | 潼關之戰 |
| PK17 | 奇門八陣 |
| PK18 | 亂世烽煙 |
| PK19 | 兗州之戰 |
| PK20 | 定軍山之戰 |
| PK21 | 霸王討逆 |
| PK22 | 長安之亂 |
| PK23 | 英雄命世 |
| PK24 | 漢焰長明 |

---

### Progress

- [X] Phase 1: Database Schema
- [X] Phase 2: Import Script
- [X] Phase 3: Backend Models & Repository
- [X] Phase 4: Backend Service Logic
- [X] Phase 5: Backend API Endpoints
- [X] Phase 6: Frontend — Season Config
- [X] Phase 7: Frontend — LIFF 搜尋增強
- [X] Phase 8: Frontend — Dashboard 增強
