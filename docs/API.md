# API 完整文件

## Base URL

```
http://localhost:8087/api/v1
```

## 認證

所有受保護的 API 需要在 Header 中帶 JWT token：

```bash
Authorization: Bearer <access_token>
```

---

## 1. Alliance Management

### GET `/alliances`
取得當前用戶同盟

**Response**:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "蜀漢軍團",
  "server_name": "S1 魏興",
  "created_at": "2025-10-09T...",
  "updated_at": "2025-10-09T..."
}
```

### POST `/alliances`
建立同盟

**Request Body**:
```json
{
  "name": "蜀漢軍團",
  "server_name": "S1 魏興"
}
```

### PATCH `/alliances`
更新同盟

**Request Body**:
```json
{
  "name": "新名稱",
  "server_name": "新伺服器"
}
```

### DELETE `/alliances`
刪除同盟

**Response**: 204 No Content

---

## 2. Season Management

### GET `/seasons`
列出所有賽季

**Query Parameters**:
- `active_only`: boolean (optional) - 只返回活躍賽季

**Response**:
```json
[
  {
    "id": "uuid",
    "alliance_id": "uuid",
    "name": "S1 賽季",
    "start_date": "2025-01-01",
    "end_date": "2025-06-30",
    "is_active": true,
    "created_at": "2025-10-09T..."
  }
]
```

### GET `/seasons/active`
取得活躍賽季

**Response**: Season object or null

### GET `/seasons/{season_id}`
取得特定賽季

**Response**: Season object

### POST `/seasons`
建立賽季

**Request Body**:
```json
{
  "name": "S2 賽季",
  "start_date": "2025-07-01",
  "end_date": "2025-12-31"
}
```

### PATCH `/seasons/{season_id}`
更新賽季

**Request Body**:
```json
{
  "name": "新名稱",
  "end_date": "2025-12-31"
}
```

### DELETE `/seasons/{season_id}`
刪除賽季

**Response**: 204 No Content

### POST `/seasons/{season_id}/activate`
設定為活躍賽季（會自動停用其他賽季）

**Response**: Updated Season object

---

## 3. CSV Upload Management

### POST `/uploads`
上傳 CSV 檔案

**Request** (multipart/form-data):
- `season_id`: UUID (required)
- `file`: File (required) - CSV 檔案
- `snapshot_date`: string (optional) - ISO format datetime

**Response**:
```json
{
  "upload_id": "uuid",
  "season_id": "uuid",
  "alliance_id": "uuid",
  "snapshot_date": "2025-10-09T10:13:09",
  "filename": "同盟統計2025年10月09日10时13分09秒.csv",
  "total_members": 201,
  "total_snapshots": 201,
  "replaced_existing": false
}
```

### GET `/uploads`
列出上傳記錄

**Query Parameters**:
- `season_id`: UUID (required)

**Response**:
```json
{
  "uploads": [
    {
      "id": "uuid",
      "season_id": "uuid",
      "alliance_id": "uuid",
      "snapshot_date": "2025-10-09T10:13:09",
      "file_name": "同盟統計2025年10月09日10时13分09秒.csv",
      "total_members": 201,
      "uploaded_at": "2025-10-09T..."
    }
  ],
  "total": 1
}
```

### DELETE `/uploads/{upload_id}`
刪除上傳記錄（會級聯刪除 snapshots）

**Response**:
```json
{
  "message": "Upload deleted successfully",
  "upload_id": "uuid"
}
```

---

## 4. Hegemony Weight Management

### GET `/hegemony-weights`
取得權重設定

**Query Parameters**:
- `season_id`: UUID (required)

**Response**:
```json
[
  {
    "id": "uuid",
    "csv_upload_id": "uuid",
    "season_id": "uuid",
    "alliance_id": "uuid",
    "weight_contribution": 1.0,
    "weight_merit": 1.0,
    "weight_assist": 1.0,
    "weight_donation": 1.0,
    "created_at": "2025-10-09T...",
    "snapshot_date": "2025-10-09T10:13:09"
  }
]
```

### GET `/hegemony-weights/summary`
取得權重摘要

**Query Parameters**:
- `season_id`: UUID (required)

**Response**:
```json
{
  "season_id": "uuid",
  "total_snapshots": 5,
  "configured_snapshots": 3,
  "unconfigured_snapshots": 2,
  "snapshots": [
    {
      "snapshot_date": "2025-10-09T10:13:09",
      "has_weights": true
    }
  ]
}
```

### POST `/hegemony-weights/initialize`
初始化預設權重（為所有未設定的 CSV uploads 建立預設權重）

**Query Parameters**:
- `season_id`: UUID (required)

**Response**: Array of created HegemonyWeight objects

### POST `/hegemony-weights`
建立權重設定

**Query Parameters**:
- `season_id`: UUID (required)

**Request Body**:
```json
{
  "csv_upload_id": "uuid",
  "weight_contribution": 1.0,
  "weight_merit": 2.0,
  "weight_assist": 1.5,
  "weight_donation": 0.5
}
```

### PATCH `/hegemony-weights/{weight_id}`
更新權重設定

**Request Body**:
```json
{
  "weight_contribution": 1.5,
  "weight_merit": 2.5
}
```

### DELETE `/hegemony-weights/{weight_id}`
刪除權重設定

**Response**: 204 No Content

### GET `/hegemony-weights/preview`
預覽霸業積分計算（Top N 成員）

**Query Parameters**:
- `season_id`: UUID (required)
- `limit`: integer (optional, default: 10) - 返回前 N 名成員

**Response**:
```json
[
  {
    "member_id": "uuid",
    "member_name": "大地英豪",
    "total_hegemony_score": 15234.5,
    "snapshot_count": 5,
    "avg_contribution": 1000000,
    "avg_merit": 50000,
    "avg_assist": 1000,
    "avg_donation": 500000
  }
]
```

---

## 5. Alliance Collaborator Management

### GET `/alliances/{alliance_id}/collaborators`
取得協作者列表

**Response**:
```json
{
  "collaborators": [
    {
      "id": "uuid",
      "alliance_id": "uuid",
      "user_id": "uuid",
      "role": "collaborator",
      "created_at": "2025-10-09T...",
      "user_email": "user@example.com"
    }
  ],
  "total": 1
}
```

### POST `/alliances/{alliance_id}/collaborators`
新增協作者（透過 email 邀請）

**Request Body**:
```json
{
  "email": "user@example.com",
  "role": "collaborator"
}
```

### DELETE `/alliances/{alliance_id}/collaborators/{user_id}`
移除協作者

**Response**: 204 No Content

### PATCH `/alliances/{alliance_id}/collaborators/{user_id}/role`
更新協作者角色

**Query Parameters**:
- `new_role`: string (required) - "collaborator" or "member"

**Response**:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "role": "member",
  "updated_at": "2025-10-09T..."
}
```

### GET `/alliances/{alliance_id}/my-role`
取得當前使用者在同盟中的角色

**Response**:
```json
{
  "role": "owner"
}
```

### POST `/collaborators/process-invitations`
處理待處理的邀請（登入後自動執行）

**Response**:
```json
{
  "processed_count": 2,
  "message": "Successfully processed 2 pending invitations"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Invalid request body"
}
```

### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

### 403 Forbidden
```json
{
  "detail": "You are not a member of this alliance"
}
```

### 404 Not Found
```json
{
  "detail": "Alliance not found"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error"
}
```

---

## Rate Limiting

目前未實作 rate limiting，建議生產環境使用 Nginx / Cloudflare 實作。

---

**Last Updated**: 2025-10-10
