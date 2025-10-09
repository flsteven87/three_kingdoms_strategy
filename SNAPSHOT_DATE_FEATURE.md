# Snapshot Date Feature - 快照日期功能

## ✨ 功能概覽

實作了智能快照日期管理功能，讓使用者可以：
1. **自動解析** - 從 CSV 檔名自動提取日期
2. **直接顯示** - 選擇檔案後立即顯示可編輯的日期選擇器
3. **彈性調整** - 可以手動修改快照日期
4. **範圍驗證** - 確保日期在賽季範圍內

---

## 🎯 使用流程

### 1️⃣ 選擇 CSV 檔案
用戶點擊選擇檔案，系統自動：
- 驗證檔案格式（.csv）
- 解析檔名中的日期（`同盟統計YYYY年MM月DD日HH时MM分SS秒.csv`）
- 驗證日期是否在賽季範圍內

### 2️⃣ 顯示快照日期
自動顯示：
- ✅ 成功提示：「已選擇檔案：xxx.csv」
- 📅 日期選擇器：預設為解析的日期
- 💡 提示文字：「預設為檔名解析的日期，可自行調整」

### 3️⃣ 調整日期（可選）
用戶可以：
- 直接點擊日期選擇器修改
- 日期選擇器有 `min` 和 `max` 限制（賽季範圍）
- 只顯示日期，不顯示時間

### 4️⃣ 上傳
點擊上傳按鈕：
- 使用選擇的日期（預設 00:00:00）
- 傳送到後端 API

---

## 🔧 技術實作

### **Backend Changes**

#### 1. API Endpoint (`uploads.py`)
```python
@router.post("")
async def upload_csv(
    season_id: Annotated[UUID, Form()],
    file: Annotated[UploadFile, File()],
    snapshot_date: Annotated[str | None, Form()] = None,  # 新增
    ...
):
```

#### 2. Service Layer (`csv_upload_service.py`)
```python
async def upload_csv(
    self,
    user_id: UUID,
    season_id: UUID,
    filename: str,
    csv_content: str,
    custom_snapshot_date: str | None = None,  # 新增
) -> dict:
    # 優先使用自訂日期，否則從檔名解析
    if custom_snapshot_date:
        snapshot_date = datetime.fromisoformat(custom_snapshot_date.replace('Z', '+00:00'))
    else:
        snapshot_date = self._parser.extract_datetime_from_filename(filename)
```

---

### **Frontend Changes**

#### 1. API Client (`api-client.ts`)
```typescript
async uploadCsv(
  seasonId: string,
  file: File,
  snapshotDate?: string  // 新增可選參數
): Promise<CsvUploadResponse>
```

#### 2. Hooks (`use-csv-uploads.ts`)
```typescript
mutationFn: ({
  seasonId,
  file,
  snapshotDate  // 新增
}: {
  seasonId: string
  file: File
  snapshotDate?: string
}) => apiClient.uploadCsv(seasonId, file, snapshotDate)
```

#### 3. Component (`CSVUploadCard.tsx`)

**State 管理**：
```typescript
const [selectedFile, setSelectedFile] = useState<File | null>(null)
const [parsedDate, setParsedDate] = useState<Date | null>(null)
const [snapshotDate, setSnapshotDate] = useState<string>('')  // YYYY-MM-DD
```

**檔案選擇處理**：
```typescript
const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const fileDate = extractDateFromFilename(file.name)

  // 驗證範圍
  if (!validateDateInSeason(fileDate)) {
    setDateError('日期超出範圍...')
    return
  }

  // 設定狀態
  setSelectedFile(file)
  setParsedDate(fileDate)
  setSnapshotDate(fileDate.toISOString().split('T')[0])  // YYYY-MM-DD
}, [season])
```

**上傳處理**：
```typescript
const handleUpload = useCallback(async () => {
  if (!selectedFile || !snapshotDate) return

  // 轉換為 ISO 格式（加上時間）
  const dateWithTime = `${snapshotDate}T00:00:00`

  await onUpload(selectedFile, dateWithTime)
}, [selectedFile, snapshotDate, onUpload])
```

---

## 🎨 UI 設計

### **優化前（複雜）**
❌ 勾選「自訂快照日期」checkbox
❌ 顯示 datetime-local 選擇器
❌ 需要額外步驟

### **優化後（簡潔）** ✅
```tsx
{selectedFile && !dateError && parsedDate && (
  <div className="space-y-3">
    {/* 成功提示 */}
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertDescription>
        已選擇檔案：{selectedFile.name}
      </AlertDescription>
    </Alert>

    {/* 日期選擇器 */}
    <div className="space-y-2">
      <label className="text-sm font-medium">快照日期</label>
      <input
        type="date"
        value={snapshotDate}
        onChange={(e) => setSnapshotDate(e.target.value)}
        min={season.start_date}
        max={season.end_date || undefined}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
      />
      <p className="text-xs text-muted-foreground">
        預設為檔名解析的日期，可自行調整
      </p>
    </div>
  </div>
)}
```

---

## 📊 資料流程

```
1. 使用者選擇檔案
   ↓
2. extractDateFromFilename()
   解析檔名 → Date object
   ↓
3. validateDateInSeason()
   驗證日期範圍 → true/false
   ↓
4. 成功：
   - setSelectedFile(file)
   - setParsedDate(fileDate)
   - setSnapshotDate(YYYY-MM-DD)
   ↓
5. 顯示 UI：
   - Alert: 已選擇檔案
   - Input: type="date" (可編輯)
   ↓
6. 使用者可選擇性修改日期
   ↓
7. 點擊上傳：
   - dateWithTime = `${snapshotDate}T00:00:00`
   - onUpload(file, dateWithTime)
   ↓
8. API: FormData
   - season_id
   - file
   - snapshot_date (可選)
   ↓
9. Backend: 優先使用 custom_snapshot_date
   否則從檔名解析
```

---

## ✅ 優點

### **使用者體驗**
- ✨ **直覺簡單** - 選擇檔案後自動顯示日期
- 📅 **彈性調整** - 可以直接修改日期
- 🔒 **範圍限制** - 日期選擇器有 min/max 約束
- 📱 **原生體驗** - 使用 HTML5 date input

### **技術優勢**
- 🎯 **向下相容** - snapshot_date 為可選參數
- 🔄 **預設行為** - 不傳則使用檔名解析（原有邏輯）
- 🛡️ **型別安全** - 完整 TypeScript 支援
- 📝 **清晰邏輯** - 單一職責，易於維護

---

## 🧪 測試案例

### **正常流程**
1. ✅ 選擇正確格式的 CSV 檔案
2. ✅ 自動顯示解析的日期
3. ✅ 日期在賽季範圍內
4. ✅ 可以修改日期
5. ✅ 上傳成功

### **邊界測試**
1. ✅ 檔名格式錯誤 → 顯示錯誤訊息
2. ✅ 日期超出範圍 → 顯示錯誤訊息
3. ✅ 選擇非 CSV 檔案 → 顯示錯誤訊息
4. ✅ 修改日期後上傳 → 使用修改後的日期
5. ✅ 不修改日期上傳 → 使用解析的日期

---

## 📝 API 規格

### **Request**
```typescript
POST /api/v1/uploads
Content-Type: multipart/form-data

FormData:
  season_id: string (UUID)
  file: File (.csv)
  snapshot_date?: string (ISO 8601 format, optional)
    例如: "2025-10-09T00:00:00"
```

### **Response**
```typescript
{
  upload_id: string
  season_id: string
  alliance_id: string
  snapshot_date: string  // ISO 8601
  filename: string
  total_members: number
  total_snapshots: number
  replaced_existing: boolean
}
```

---

## 🚀 未來優化建議

### **增強功能**
1. 📊 顯示檔名解析的原始日期時間（僅顯示）
2. ⏰ 支援時間選擇（optional）
3. 🔄 批次上傳時自動推斷日期序列
4. 📅 日曆視圖顯示已上傳的日期

### **驗證增強**
1. ⚠️ 檢查該日期是否已有上傳記錄
2. 🔔 覆蓋提示更明顯
3. 📈 顯示連續性檢查（缺失的日期）

---

## ✅ 完成清單

- [x] Backend API 支援 `snapshot_date` 參數
- [x] Service layer 優先使用自訂日期
- [x] Frontend API client 傳遞日期參數
- [x] Hooks 支援日期參數
- [x] Component 自動解析並顯示日期
- [x] 移除多餘的 checkbox 步驟
- [x] 使用 `type="date"` 而非 `datetime-local`
- [x] 設定日期選擇器的 min/max
- [x] 轉換日期格式（YYYY-MM-DD → ISO）
- [x] TypeScript 編譯通過
- [x] ESLint 檢查通過

---

**實作完成日期**: 2025-10-09
**版本**: 0.2.1
**狀態**: ✅ 完成並優化
