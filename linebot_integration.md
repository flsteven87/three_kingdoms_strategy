# LINE Bot Integration Design Document

> **Status**: Phase 1 In Progress
> **Date**: 2025-01-02
> **Author**: Claude
> **Scope**: LINE Bot integration for member ID binding
> **Last Updated**: 2025-01-02

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Integration Architecture](#3-integration-architecture)
4. [Data Model Design](#4-data-model-design)
5. [API Design](#5-api-design)
6. [User Experience Design](#6-user-experience-design)
7. [Security Considerations](#7-security-considerations)
8. [Implementation Phases](#8-implementation-phases)
9. [Technical Decisions](#9-technical-decisions)
10. [Risks and Mitigations](#10-risks-and-mitigations)

---

## 1. Executive Summary

### 1.1 Objective

Integrate a LINE Bot service to enable alliance members to bind their LINE accounts with their in-game IDs. This allows the web application to display LINE information alongside member performance data, facilitating better communication within LINE groups.

### 1.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bot Ownership | Unified (project-owned) | Eliminates user configuration complexity |
| Backend Integration | Merge into existing | Single codebase, shared database |
| LIFF Frontend | Keep separate deployment | Simpler maintenance, LINE-specific UX |
| Binding Mechanism | One-time code | Secure, user-friendly, time-limited |

### 1.3 Core User Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BINDING FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Web App (Owner)              LINE Group                LIFF Page       │
│  ──────────────              ──────────               ──────────        │
│       │                           │                        │            │
│  1. Generate                      │                        │            │
│     binding code ──────────────>  │                        │            │
│     (ABC123)                      │                        │            │
│       │                           │                        │            │
│       │                      2. Invite Bot                 │            │
│       │                      3. Send /綁定 ABC123          │            │
│       │                           │                        │            │
│       │                      4. Bot confirms               │            │
│       │                         alliance binding           │            │
│       │                           │                        │            │
│       │                           │                        │            │
│       │                      5. Member sends               │            │
│       │                         /綁定ID                    │            │
│       │                           │                        │            │
│       │                      6. Bot sends ──────────────>  │            │
│       │                         LIFF link                  │            │
│       │                           │                        │            │
│       │                           │              7. Enter game ID       │
│       │                           │                 and submit          │
│       │                           │                        │            │
│  8. View member                   │                        │            │
│     LINE info  <─────────────────────────────────────────  │            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Current State Analysis

### 2.1 three_kingdoms_strategy (Main Project)

**Architecture Overview:**

```
Backend (FastAPI)
├── src/
│   ├── api/v1/endpoints/   # HTTP handlers
│   ├── services/           # Business logic
│   ├── repositories/       # Data access
│   ├── models/             # Pydantic models
│   └── core/               # Config, auth, DI

Frontend (React + TypeScript)
├── src/
│   ├── pages/              # Route pages
│   ├── components/         # UI components
│   ├── hooks/              # Custom hooks
│   └── lib/                # API client
```

**Key Entities:**

| Entity | Purpose |
|--------|---------|
| Alliance | User-owned alliance |
| Season | Time-bounded competition period |
| Member | Game member (from CSV) |
| MemberSnapshot | Point-in-time member stats |

**Authentication:** Supabase Auth (OAuth: Google, etc.)

### 2.2 liff-web (LINE Frontend)

**Current Implementation:**

```typescript
// LIFF Session Hook
const liffState = useLiffSession(ENV.LIFF_ID);
// → { lineUserId, lineDisplayName, lineGroupId }

// API Calls
api.registerAccount({ groupId, userId, gameId, displayName })
api.fetchAccountInfo(userId, groupId)
```

**Key Features:**
- LIFF SDK for LINE authentication
- Game ID registration (roster management)
- Copper mine registration (out of scope for Phase 1)
- Admin configuration

**Current API Types:**

```typescript
type AccountInfoResponse = {
  has_registered: boolean;
  isAdmin: boolean;
  registered_ids?: RegisteredAccountRaw[];
  registered_coppers?: CopperMine[];
};

type RegisteredAccountRaw = {
  game_id: string;
  display_name?: string;
  created_at: string;
};
```

### 2.3 Gap Analysis

| Aspect | Current State | Required State |
|--------|--------------|----------------|
| LINE ↔ Alliance link | None | Group-to-alliance binding |
| Member LINE info | None | LINE user ID, display name |
| Bot infrastructure | Exists in liff-web | Needs backend integration |
| LIFF backend | Separate/unknown | Unified with main backend |

---

## 3. Integration Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────┐    ┌─────────────────┐                    │
│   │   Web App       │    │   LIFF App      │                    │
│   │   (React)       │    │   (React)       │                    │
│   │                 │    │                 │                    │
│   │ • Settings      │    │ • ID Binding    │                    │
│   │ • Members view  │    │ • Status check  │                    │
│   └────────┬────────┘    └────────┬────────┘                    │
│            │                      │                             │
│            │ Supabase JWT         │ LINE User ID + Group ID     │
│            │                      │                             │
├────────────┼──────────────────────┼─────────────────────────────┤
│            │                      │                             │
│            ▼                      ▼                             │
│   ┌─────────────────────────────────────────────────────┐       │
│   │              FastAPI Backend                        │       │
│   │                                                     │       │
│   │   /api/v1/                                          │       │
│   │   ├── alliances/*      (Supabase JWT auth)          │       │
│   │   ├── seasons/*        (Supabase JWT auth)          │       │
│   │   ├── analytics/*      (Supabase JWT auth)          │       │
│   │   │                                                 │       │
│   │   └── linebot/*        (LINE auth / webhook)        │       │
│   │       ├── /webhook     (LINE signature verify)      │       │
│   │       ├── /bind        (Binding code verify)        │       │
│   │       └── /member/*    (LINE Group ID auth)         │       │
│   │                                                     │       │
│   └─────────────────────────┬───────────────────────────┘       │
│                             │                                   │
├─────────────────────────────┼───────────────────────────────────┤
│                             │                                   │
│                             ▼                                   │
│   ┌─────────────────────────────────────────────────────┐       │
│   │              Supabase (PostgreSQL)                  │       │
│   │                                                     │       │
│   │   Existing:              New:                       │       │
│   │   • alliances            • line_binding_codes       │       │
│   │   • members              • line_group_bindings      │       │
│   │   • member_snapshots     • member_line_bindings     │       │
│   │   • ...                                             │       │
│   │                                                     │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Authentication Flow Comparison

**Web App Authentication (Existing):**
```
User → Supabase OAuth → JWT Token → Backend validates JWT → Extract user_id
```

**LINE Bot Authentication (New):**
```
LINE User → LIFF SDK → LINE User ID + Group ID → Backend looks up alliance → Execute action
```

**Webhook Authentication (New):**
```
LINE Platform → Webhook → X-Line-Signature header → Validate with channel secret → Process event
```

### 3.3 Service Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Existing Services          New Services                        │
│  ─────────────────          ────────────                        │
│  AllianceService            LineBotService                      │
│  SeasonService              LineBindingService                  │
│  MemberService              LineWebhookService                  │
│  AnalyticsService                                               │
│                                                                 │
│                    ┌─────────────────────┐                      │
│                    │  LineBotService     │                      │
│                    │  ───────────────    │                      │
│                    │  • generateCode()   │                      │
│                    │  • bindGroup()      │                      │
│                    │  • getGroupInfo()   │                      │
│                    └─────────┬───────────┘                      │
│                              │                                  │
│                    ┌─────────▼───────────┐                      │
│                    │ LineBindingService  │                      │
│                    │ ────────────────    │                      │
│                    │ • registerMember()  │                      │
│                    │ • getMemberInfo()   │                      │
│                    │ • matchWithMember() │                      │
│                    └─────────┬───────────┘                      │
│                              │                                  │
│                    ┌─────────▼───────────┐                      │
│                    │ LineWebhookService  │                      │
│                    │ ─────────────────   │                      │
│                    │ • handleMessage()   │                      │
│                    │ • handleFollow()    │                      │
│                    │ • handleJoin()      │                      │
│                    └─────────────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model Design

### 4.1 New Tables

#### 4.1.1 `line_binding_codes`

Temporary storage for one-time binding codes.

```sql
CREATE TABLE line_binding_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_id UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    code VARCHAR(8) NOT NULL UNIQUE,
    created_by UUID NOT NULL,  -- Supabase auth.uid()
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for code lookup
CREATE INDEX idx_binding_codes_code ON line_binding_codes(code) WHERE used_at IS NULL;

-- Auto-cleanup expired codes (optional trigger or cron)
```

#### 4.1.2 `line_group_bindings`

Links LINE groups to alliances.

```sql
CREATE TABLE line_group_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_id UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    line_group_id VARCHAR(64) NOT NULL UNIQUE,
    group_name VARCHAR(255),
    bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    bound_by_line_user_id VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure one active binding per alliance
CREATE UNIQUE INDEX idx_active_alliance_binding
    ON line_group_bindings(alliance_id)
    WHERE is_active = true;
```

#### 4.1.3 `member_line_bindings`

Links LINE users to game IDs within an alliance.

```sql
CREATE TABLE member_line_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_id UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    line_user_id VARCHAR(64) NOT NULL,
    line_display_name VARCHAR(255) NOT NULL,
    game_id VARCHAR(100) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each LINE user can only bind one game_id per alliance
    UNIQUE(alliance_id, line_user_id, game_id)
);

-- Index for member lookup
CREATE INDEX idx_member_line_bindings_member ON member_line_bindings(member_id);
CREATE INDEX idx_member_line_bindings_alliance ON member_line_bindings(alliance_id);
```

### 4.2 RLS Policies

```sql
-- line_binding_codes: Only alliance owners/admins can create
ALTER TABLE line_binding_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alliance admins can manage binding codes"
    ON line_binding_codes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM alliance_collaborators ac
            WHERE ac.alliance_id = line_binding_codes.alliance_id
            AND ac.user_id = (SELECT auth.uid())
            AND ac.role IN ('owner', 'admin')
        )
    );

-- line_group_bindings: Read by alliance members, write by admins
ALTER TABLE line_group_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alliance members can view group bindings"
    ON line_group_bindings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM alliance_collaborators ac
            WHERE ac.alliance_id = line_group_bindings.alliance_id
            AND ac.user_id = (SELECT auth.uid())
        )
    );

-- member_line_bindings: Read by alliance members
ALTER TABLE member_line_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alliance members can view line bindings"
    ON member_line_bindings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM alliance_collaborators ac
            WHERE ac.alliance_id = member_line_bindings.alliance_id
            AND ac.user_id = (SELECT auth.uid())
        )
    );
```

### 4.3 Entity Relationship

```
                    ┌──────────────────┐
                    │    alliances     │
                    │    ──────────    │
                    │    id (PK)       │
                    │    name          │
                    └────────┬─────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ line_binding_    │ │ line_group_      │ │    members       │
│ codes            │ │ bindings         │ │    ────────      │
│ ──────────────   │ │ ─────────────    │ │    id (PK)       │
│ code             │ │ line_group_id    │ │    name          │
│ expires_at       │ │ group_name       │ └────────┬─────────┘
│ used_at          │ │ bound_at         │          │
└──────────────────┘ └──────────────────┘          │
                                                   │
                                         ┌─────────▼─────────┐
                                         │ member_line_      │
                                         │ bindings          │
                                         │ ───────────────   │
                                         │ line_user_id      │
                                         │ line_display_name │
                                         │ game_id           │
                                         │ member_id (FK)    │
                                         └───────────────────┘
```

### 4.4 Pydantic Models

```python
# src/models/line_binding.py

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class LineBindingCodeCreate(BaseModel):
    """Request to generate a binding code"""
    pass  # No fields needed, alliance_id from auth


class LineBindingCode(BaseModel):
    """Binding code response"""
    model_config = ConfigDict(from_attributes=True)

    code: str
    expires_at: datetime
    created_at: datetime


class LineGroupBindingCreate(BaseModel):
    """Internal: Create group binding after code validation"""
    alliance_id: UUID
    line_group_id: str
    group_name: str | None = None
    bound_by_line_user_id: str


class LineGroupBinding(BaseModel):
    """Group binding response"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    line_group_id: str
    group_name: str | None
    bound_at: datetime
    is_active: bool


class MemberLineBindingCreate(BaseModel):
    """Request to bind LINE user to game ID"""
    line_group_id: str
    line_user_id: str
    line_display_name: str
    game_id: str = Field(..., min_length=1, max_length=100)


class MemberLineBinding(BaseModel):
    """Member LINE binding response"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    member_id: UUID | None
    line_user_id: str
    line_display_name: str
    game_id: str
    is_verified: bool
    bound_at: datetime


class MemberLineInfo(BaseModel):
    """LINE info for member display"""
    line_user_id: str
    line_display_name: str
    game_ids: list[str]
    is_verified: bool
```

---

## 5. API Design

### 5.1 Endpoint Overview

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/v1/linebot/codes` | Supabase JWT | Generate binding code |
| `GET /api/v1/linebot/binding` | Supabase JWT | Get current binding status |
| `DELETE /api/v1/linebot/binding` | Supabase JWT | Unbind LINE group |
| `POST /api/v1/linebot/webhook` | LINE Signature | Handle LINE events |
| `GET /api/v1/linebot/member/info` | LINE Group ID | Get member bind info |
| `POST /api/v1/linebot/member/register` | LINE Group ID | Register game ID |

### 5.2 Web App Endpoints (Supabase JWT Auth)

#### Generate Binding Code

```
POST /api/v1/linebot/codes

Request: (empty body)
Headers:
  Authorization: Bearer <supabase_jwt>

Response 201:
{
  "code": "ABC123",
  "expires_at": "2025-01-02T11:00:00Z",
  "created_at": "2025-01-02T10:55:00Z"
}

Response 400:
{
  "detail": "Alliance already has active LINE group binding"
}

Response 403:
{
  "detail": "Only alliance owner or admin can generate binding codes"
}
```

#### Get Binding Status

```
GET /api/v1/linebot/binding

Request: (empty)
Headers:
  Authorization: Bearer <supabase_jwt>

Response 200 (bound):
{
  "is_bound": true,
  "binding": {
    "id": "uuid",
    "line_group_id": "Cxxxxxxxxxx",
    "group_name": "三國志大群",
    "bound_at": "2025-01-01T10:00:00Z",
    "member_count": 42
  }
}

Response 200 (not bound):
{
  "is_bound": false,
  "binding": null
}
```

#### Unbind LINE Group

```
DELETE /api/v1/linebot/binding

Request: (empty)
Headers:
  Authorization: Bearer <supabase_jwt>

Response 204: (no content)

Response 404:
{
  "detail": "No active LINE group binding found"
}
```

### 5.3 LIFF Endpoints (LINE Group ID Auth)

#### Get Member Info

```
GET /api/v1/linebot/member/info?u={lineUserId}&g={lineGroupId}

Request: Query params
  u: LINE user ID
  g: LINE group ID

Response 200:
{
  "has_registered": true,
  "registered_ids": [
    {
      "game_id": "張三",
      "display_name": "張小明",
      "created_at": "2025-01-01T10:00:00Z"
    }
  ],
  "alliance_name": "天下第一盟"
}

Response 404:
{
  "detail": "Group not bound to any alliance"
}
```

#### Register Game ID

```
POST /api/v1/linebot/member/register

Request:
{
  "groupId": "Cxxxxxxxxxx",
  "userId": "Uxxxxxxxxxx",
  "gameId": "張三",
  "displayName": "張小明"
}

Response 201:
{
  "has_registered": true,
  "registered_ids": [
    {
      "game_id": "張三",
      "display_name": "張小明",
      "created_at": "2025-01-02T10:00:00Z"
    }
  ]
}

Response 404:
{
  "detail": "Group not bound to any alliance"
}

Response 409:
{
  "detail": "Game ID already registered by another user"
}
```

### 5.4 LINE Webhook Endpoint

```
POST /api/v1/linebot/webhook

Headers:
  X-Line-Signature: <signature>
  Content-Type: application/json

Request: (LINE webhook event)
{
  "events": [
    {
      "type": "message",
      "replyToken": "...",
      "source": {
        "type": "group",
        "groupId": "Cxxxxxxxxxx",
        "userId": "Uxxxxxxxxxx"
      },
      "message": {
        "type": "text",
        "text": "/綁定 ABC123"
      }
    }
  ]
}

Response 200: "OK"
```

### 5.5 Bot Commands

| Command | Description | Response |
|---------|-------------|----------|
| `/綁定 {code}` | Bind group to alliance | Success/Error message |
| `/綁定ID` | Open LIFF for ID binding | Flex message with button |
| `/狀態` | Check binding status | Current bindings info |
| `/幫助` | Show help | Commands list |

---

## 6. User Experience Design

### 6.1 Web App: Settings Page

Add new tab to existing Settings page:

```
┌─────────────────────────────────────────────────────────────────┐
│ 設定                                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌──────────────┬──────────────┬──────────────┬────────────────┐ │
│ │   同盟設定   │   權限管理   │   帳戶設定   │  LINE 整合     │ │
│ └──────────────┴──────────────┴──────────────┴────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                     LINE 群組綁定                           │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │  [未綁定狀態]                                               │ │
│ │                                                             │ │
│ │  📱 連結您的 LINE 群組                                      │ │
│ │                                                             │ │
│ │  透過綁定 LINE 群組，盟友可以直接在群組內註冊遊戲 ID，     │ │
│ │  系統會自動關聯成員資料，方便您追蹤盟友表現。              │ │
│ │                                                             │ │
│ │  ┌─────────────────────────────────────────────────────┐   │ │
│ │  │  步驟說明：                                         │   │ │
│ │  │                                                     │   │ │
│ │  │  1. 點擊「生成綁定碼」                              │   │ │
│ │  │  2. 在 LINE 群組中加入我們的 Bot                    │   │ │
│ │  │     (點擊下方 QR Code 或搜尋 @xxx)                  │   │ │
│ │  │  3. 在群組中發送：/綁定 [綁定碼]                    │   │ │
│ │  │                                                     │   │ │
│ │  └─────────────────────────────────────────────────────┘   │ │
│ │                                                             │ │
│ │  ┌────────────────────────────────────┐                    │ │
│ │  │        [ 生成綁定碼 ]              │                    │ │
│ │  └────────────────────────────────────┘                    │ │
│ │                                                             │ │
│ │  ┌─────────────────────────────────────────────────────┐   │ │
│ │  │  Bot QR Code                     Bot ID: @xxx        │   │ │
│ │  │  ┌─────────┐                     [ 加入好友 ]        │   │ │
│ │  │  │ ▓▓▓▓▓▓▓ │                                         │   │ │
│ │  │  │ ▓▓▓▓▓▓▓ │                                         │   │ │
│ │  │  │ ▓▓▓▓▓▓▓ │                                         │   │ │
│ │  │  └─────────┘                                         │   │ │
│ │  └─────────────────────────────────────────────────────┘   │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                    [綁定碼已生成]                           │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │  您的綁定碼：                                               │ │
│ │                                                             │ │
│ │  ┌───────────────────────────────────────────────────────┐ │ │
│ │  │                                                       │ │ │
│ │  │              ABC123              [ 複製 ]             │ │ │
│ │  │                                                       │ │ │
│ │  │              有效期限：4:32                           │ │ │
│ │  │                                                       │ │ │
│ │  └───────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │  請在 LINE 群組中發送：/綁定 ABC123                         │ │
│ │                                                             │ │
│ │  ┌────────────────────────────────────┐                    │ │
│ │  │        [ 重新生成 ]                │                    │ │
│ │  └────────────────────────────────────┘                    │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                     [已綁定狀態]                            │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │  ✅ 已綁定 LINE 群組                                        │ │
│ │                                                             │ │
│ │  群組名稱：三國志大群                                       │ │
│ │  綁定時間：2025-01-01 10:30                                 │ │
│ │  已綁定成員：42 人                                          │ │
│ │                                                             │ │
│ │  ┌────────────────────────────────────┐                    │ │
│ │  │        [ 解除綁定 ]                │                    │ │
│ │  └────────────────────────────────────┘                    │ │
│ │                                                             │ │
│ │  ⚠️ 解除綁定後，所有成員的 LINE 關聯將被保留，            │ │
│ │     但無法再進行新的綁定。                                  │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 LIFF Page (Simplified)

Keep liff-web but simplify for Phase 1:

```
┌─────────────────────────────────────────┐
│                                         │
│           SLGS 小助理                   │
│         遊戲同盟管理工具                │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  [首次登記提示 - 未註冊時顯示]          │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  👋 歡迎使用！                    │  │
│  │                                   │  │
│  │  請輸入您的遊戲 ID 以完成綁定     │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 輸入遊戲ID                  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │           註冊              │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [已註冊帳號列表]                       │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  已註冊帳號 (2)                   │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 張三                        │  │  │
│  │  │ 2025-01-01 註冊             │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 張三小號                    │  │  │
│  │  │ 2025-01-02 註冊             │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [新增更多帳號]                         │
│  ┌───────────────────────────────────┐  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 輸入遊戲ID                  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌───────────┐                   │  │
│  │  │   新增    │                   │  │
│  │  └───────────┘                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 6.3 Member Performance Enhancement

Add LINE info column to existing member tables:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  成員表現分析                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 成員名稱    │ LINE     │ 貢獻    │ 戰功    │ 助攻    │ 排名     │  │
│  ├─────────────┼──────────┼─────────┼─────────┼─────────┼──────────┤  │
│  │ 張三        │ ✅ 小明  │ 12,345  │ 5,678   │ 890     │ 1        │  │
│  │ 李四        │ ✅ 阿強  │ 11,234  │ 4,567   │ 780     │ 2        │  │
│  │ 王五        │ ⚪ --    │ 10,123  │ 3,456   │ 670     │ 3        │  │
│  │ 趙六        │ ✅ 大頭  │ 9,012   │ 2,345   │ 560     │ 4        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ✅ = 已綁定 LINE   ⚪ = 未綁定                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Considerations

### 7.1 Authentication Matrix

| Endpoint Type | Auth Method | Verification |
|---------------|-------------|--------------|
| Web App APIs | Supabase JWT | `verify_supabase_token()` |
| LIFF APIs | LINE Group ID | Lookup `line_group_bindings` |
| Webhook | X-Line-Signature | HMAC-SHA256 with channel secret |

### 7.2 Binding Code Security

```python
# Secure code generation
import secrets
import string

def generate_binding_code() -> str:
    """Generate cryptographically secure 6-character code"""
    alphabet = string.ascii_uppercase + string.digits
    # Remove confusing characters: 0, O, I, 1
    alphabet = alphabet.replace('0', '').replace('O', '').replace('I', '').replace('1', '')
    return ''.join(secrets.choice(alphabet) for _ in range(6))
```

**Security measures:**
- 6-character alphanumeric (case-insensitive)
- 5-minute expiration
- Single use (marked as used after successful binding)
- Rate limiting: max 3 codes per hour per alliance

### 7.3 Webhook Signature Verification

```python
import hmac
import hashlib
import base64

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """Verify LINE webhook signature"""
    hash_value = hmac.new(
        channel_secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).digest()
    expected_signature = base64.b64encode(hash_value).decode('utf-8')
    return hmac.compare_digest(signature, expected_signature)
```

### 7.4 Sensitive Data Protection

**Environment Variables (Backend):**
```
LINE_CHANNEL_ID=xxxxxxxxxx
LINE_CHANNEL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LINE_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIFF_ID=xxxx-xxxxxxxx
```

**Frontend (Public):**
```
VITE_LIFF_ID=xxxx-xxxxxxxx
VITE_API_BASE=https://api.example.com/api/v1/linebot
```

### 7.5 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /codes` | 3 | 1 hour |
| `POST /member/register` | 10 | 1 hour per user |
| `POST /webhook` | 1000 | 1 minute |

---

## 8. Implementation Phases

### 8.1 Phase 1: Core Integration (MVP)

**Duration:** 1-2 weeks

**Backend Tasks:**
- [x] Create database migrations (3 tables + RLS) ✅ 2025-01-02
- [ ] Implement `LineBindingRepository`
- [ ] Implement `LineBotService`
- [ ] Implement `LineWebhookService`
- [ ] Create `/api/v1/linebot/*` endpoints
- [ ] Add LINE SDK dependency (`line-bot-sdk`)

**Frontend Tasks:**
- [x] Create LINE 三國小幫手獨立頁面 (`/line-binding`) ✅ 2025-01-02
- [x] Implement binding code generation UI ✅ 2025-01-02
- [x] Implement binding status display ✅ 2025-01-02
- [x] Add unbind confirmation dialog ✅ 2025-01-02
- [x] Add countdown timer for code expiry ✅ 2025-01-02
- [x] Add copy-to-clipboard functionality ✅ 2025-01-02

**liff-web Tasks:**
- [ ] Update `API_BASE` environment variable
- [ ] Remove copper-related features (or hide)
- [ ] Test with new backend endpoints

**Deliverables:**
- Alliance owners can bind LINE groups
- Members can register game IDs via LIFF
- Basic webhook handling for commands

### 8.2 Phase 2: Member Integration

**Duration:** 1 week

**Tasks:**
- [ ] Auto-match `member_line_bindings.game_id` with `members.name`
- [ ] Add LINE info column to member tables
- [ ] Implement member-binding management UI
- [ ] Add manual linking capability for admins

**Deliverables:**
- CSV members automatically linked with LINE bindings
- Member performance shows LINE display names
- Admins can manually link/unlink members

### 8.3 Phase 3: Advanced Features

**Duration:** 2+ weeks

**Potential Features:**
- [ ] Group announcements via Bot
- [ ] Copper mine management integration
- [ ] Push notifications for important events
- [ ] Rich message cards for stats sharing

---

## 9. Technical Decisions

### 9.1 Why Unified Backend?

| Approach | Pros | Cons |
|----------|------|------|
| **Unified (chosen)** | Single codebase, shared DB, consistent auth | More initial work |
| Separate + sync | Faster initial deploy | Data consistency issues, double maintenance |

**Decision:** Unified backend for long-term maintainability.

### 9.2 Why Separate LIFF Frontend?

| Approach | Pros | Cons |
|----------|------|------|
| Merge into main frontend | Single deployment | LINE-specific routing complexity |
| **Separate (chosen)** | Clean separation, LINE-specific UX | Two deployments |

**Decision:** Keep LIFF separate for simplicity, just update API endpoint.

### 9.3 Why Binding Codes?

| Approach | Pros | Cons |
|----------|------|------|
| **Binding codes (chosen)** | Simple, secure, no OAuth complexity | Extra step for user |
| OAuth redirect | Seamless linking | Complex, requires LIFF login |
| Manual group ID input | Simple | User doesn't know group ID |

**Decision:** Binding codes balance security and usability.

### 9.4 LINE SDK Choice

**Python:** `line-bot-sdk` (official)

```python
# pyproject.toml addition
dependencies = [
    ...
    "line-bot-sdk>=3.0.0",
]
```

---

## 10. Risks and Mitigations

### 10.1 Risk Matrix

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LINE API rate limits | Medium | Low | Implement caching, batch operations |
| Webhook delivery failures | Medium | Low | Idempotent handlers, retry logic |
| User confusion with binding flow | Medium | Medium | Clear UI instructions, help command |
| LIFF compatibility issues | Low | Low | Test across LINE versions |
| Binding code brute force | Low | Low | Rate limiting, short expiry |

### 10.2 Fallback Strategies

**If LINE API is down:**
- Cache binding status locally
- Queue webhook events for retry
- Show "LINE 服務暫時無法使用" in UI

**If binding code expires:**
- Allow regeneration immediately
- Show clear expiry countdown

**If member matching fails:**
- Allow manual linking by admin
- Show unmatched bindings in separate list

---

## Appendix A: File Structure

```
backend/src/
├── api/v1/endpoints/
│   └── linebot.py              # NEW: LINE Bot endpoints
├── models/
│   └── line_binding.py         # NEW: Pydantic models
├── repositories/
│   └── line_binding_repository.py  # NEW: Data access
├── services/
│   ├── linebot_service.py      # NEW: Bot logic
│   └── line_binding_service.py # NEW: Binding logic
└── core/
    └── line_auth.py            # NEW: LINE auth utilities

frontend/src/
├── pages/
│   └── LineBinding.tsx         # NEW: LINE 三國小幫手獨立頁面 ✅
├── hooks/
│   └── use-line-binding.ts     # NEW: LINE binding hooks ✅
└── types/
    └── line-binding.ts         # NEW: TypeScript types ✅
```

---

## Appendix B: Environment Variables

**Backend (.env):**
```bash
# Existing
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_JWT_SECRET=...

# New for LINE Bot
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_channel_secret
LINE_ACCESS_TOKEN=your_access_token
LIFF_ID=your_liff_id
```

**liff-web (.env):**
```bash
VITE_LIFF_ID=your_liff_id
VITE_API_BASE=https://your-domain.com/api/v1/linebot
```

---

## Appendix C: Bot Message Templates

### Binding Success
```
✅ 綁定成功！

本群組已成功綁定到同盟「{alliance_name}」

盟友們可以發送 /綁定ID 來註冊您的遊戲帳號，
讓盟主能更方便追蹤您的表現！

輸入 /幫助 查看更多指令
```

### ID Registration Button (Flex Message)
```json
{
  "type": "bubble",
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "註冊遊戲 ID",
        "weight": "bold",
        "size": "lg"
      },
      {
        "type": "text",
        "text": "點擊下方按鈕註冊您的遊戲帳號",
        "size": "sm",
        "color": "#666666",
        "margin": "md"
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "button",
        "action": {
          "type": "uri",
          "label": "開始註冊",
          "uri": "https://liff.line.me/{liff_id}?g={group_id}"
        },
        "style": "primary"
      }
    ]
  }
}
```

---

*Document End*
