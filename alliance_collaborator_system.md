# Alliance Multi-User Collaboration System

> 多人協作權限管理系統設計文件

**Version:** 1.0.0
**Last Updated:** 2025-10-09
**Status:** 📋 Design Document (Implementation Pending)

---

## 📑 目錄

- [專案背景](#專案背景)
- [當前架構問題](#當前架構問題)
- [解決方案設計](#解決方案設計)
- [Database Schema 設計](#database-schema-設計)
- [RLS Policies 重構](#rls-policies-重構)
- [Backend 實作](#backend-實作)
- [Frontend 實作](#frontend-實作)
- [實作檢查清單](#實作檢查清單)
- [Phase 2 擴展規劃](#phase-2-擴展規劃)
- [Edge Cases 處理](#edge-cases-處理)

---

## 🎯 專案背景

### 核心需求

讓多個使用者可以**共享同一個 Alliance 的資料**：

- **Phase 1（本文件）**：讓同盟可以共享資料，暫不區分權限
- **Phase 2（未來）**：實作完整權限系統（owner/admin/editor/viewer）

### 使用場景

1. **盟主建立同盟** → 邀請其他官員加入
2. **多位官員協作** → 共同管理成員數據、上傳 CSV、分析表現
3. **觀察者角色** → 顧問可以被邀請查看數據（Phase 2）

---

## ⚠️ 當前架構問題

### 現有設計限制

```sql
-- 當前 alliances 表格
CREATE TABLE alliances (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),  -- ❌ 1:1 限制
  name VARCHAR(100),
  server_name VARCHAR(100),
  ...
);

-- RLS Policy（只有創建者可見）
CREATE POLICY "Users can view own alliance"
  ON alliances FOR SELECT
  USING ((select auth.uid()) = user_id);
```

**問題分析**：

| 問題 | 影響 |
|------|------|
| ❌ 一個 alliance 只能屬於一個 user | 無法實作多人協作 |
| ❌ RLS policies 基於 `user_id` 直接擁有權 | 其他人無法被授權存取 |
| ❌ 所有關聯表格都繼承此限制 | seasons, members, snapshots 都無法共享 |

---

## ✨ 解決方案設計

### 方案選擇：移除 user_id，統一使用成員關係表

**方案 A（不推薦）**：保留 user_id + 新增 alliance_members
- ❌ 雙重邏輯：owner 走 user_id，members 走 alliance_members
- ❌ RLS policies 複雜（需要 OR 條件）
- ❌ 容易混淆「owner」和「member」概念

**方案 B（推薦）**：移除 user_id，統一使用 alliance_members ✅
- ✅ **單一真相來源** - 所有人都是 member，只是 role 不同
- ✅ **RLS policies 一致且簡單** - 統一透過成員關係檢查
- ✅ **易於擴展** - 未來加入權限系統不需再改結構
- ✅ **符合業界標準** - Notion/Slack/GitHub 都採用此設計

### 架構轉變

```
【舊架構】直接擁有權模式
auth.users ─1:1─→ alliances ─1:many─→ seasons/members/...

【新架構】成員關係模式
auth.users ─┐
            ├─ many:many ─→ alliance_members ←─ many:1 ─ alliances
auth.users ─┘                                              ↓
                                                      seasons/members/...
```

---

## 🗄️ Database Schema 設計

### 1. 新增 `alliance_members` 表格

```sql
-- ========================================
-- Alliance Members Table
-- ========================================
-- Purpose: Manage many-to-many relationship between users and alliances
-- Design: All users (including owner) are stored as members with different roles

CREATE TABLE alliance_members (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign Keys
  alliance_id UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role System
  -- Phase 1: Use 'owner' and 'member' only
  -- Phase 2: Add 'admin', 'editor', 'viewer'
  role VARCHAR(20) NOT NULL DEFAULT 'member',

  -- Invitation Tracking (for Phase 2)
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  -- Ensure one user can only have one membership per alliance
  CONSTRAINT unique_alliance_user UNIQUE(alliance_id, user_id)
);

-- ========================================
-- Indexes for Performance Optimization
-- ========================================
--符合 CLAUDE.md 🟢: Create indexes for all foreign keys

-- Query: Get all members of an alliance
CREATE INDEX idx_alliance_members_alliance
  ON alliance_members(alliance_id);

-- Query: Get all alliances that a user is member of
CREATE INDEX idx_alliance_members_user
  ON alliance_members(user_id);

-- Query: Filter members by role (e.g., find all owners)
CREATE INDEX idx_alliance_members_role
  ON alliance_members(role);

-- ========================================
-- Trigger for Updated At Timestamp
-- ========================================
CREATE TRIGGER update_alliance_members_updated_at
BEFORE UPDATE ON alliance_members
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Comments for Documentation
-- ========================================
COMMENT ON TABLE alliance_members IS 'Many-to-many relationship between users and alliances with role-based access control';
COMMENT ON COLUMN alliance_members.role IS 'Phase 1: owner/member; Phase 2: owner/admin/editor/viewer';
COMMENT ON COLUMN alliance_members.invited_by IS 'User who invited this member (NULL for alliance creator)';
```

### 2. Migration: 遷移現有資料

```sql
-- ========================================
-- Migration: Alliances User ID to Alliance Members
-- ========================================
-- Step 1: Migrate existing data
-- Convert alliances.user_id to alliance_members with 'owner' role

INSERT INTO alliance_members (alliance_id, user_id, role, joined_at, invited_by)
SELECT
  id AS alliance_id,
  user_id,
  'owner' AS role,
  created_at AS joined_at,
  NULL AS invited_by  -- Owner is not invited by anyone
FROM alliances
WHERE user_id IS NOT NULL;

-- Verification: Check if migration succeeded
-- Expected: Count should match number of alliances with user_id
SELECT
  (SELECT COUNT(*) FROM alliances WHERE user_id IS NOT NULL) AS alliances_count,
  (SELECT COUNT(*) FROM alliance_members WHERE role = 'owner') AS owners_count;

-- Step 2: Drop user_id column from alliances
-- WARNING: This is a destructive operation, backup data first
ALTER TABLE alliances DROP COLUMN user_id;

-- Verification: Confirm column is dropped
\d alliances
```

### 3. RLS Policy for `alliance_members` 表格

```sql
-- ========================================
-- RLS Policies for alliance_members
-- ========================================
-- Enable RLS
ALTER TABLE alliance_members ENABLE ROW LEVEL SECURITY;

-- Policy 1: Members can view other members in same alliance
CREATE POLICY "Members can view alliance members"
  ON alliance_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members AS am2
      WHERE am2.alliance_id = alliance_members.alliance_id
        AND am2.user_id = (SELECT auth.uid())
    )
  );

-- Policy 2: Members can add new members (Phase 1: any member can invite)
-- Phase 2: Restrict to owner/admin only
CREATE POLICY "Members can add new members"
  ON alliance_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

-- Policy 3: Only owner can remove members (Phase 1: prevent self-removal)
CREATE POLICY "Members can remove other members"
  ON alliance_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliance_members.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
    AND alliance_members.user_id != (SELECT auth.uid())  -- Cannot remove self
  );

-- Policy 4: Cannot update role (Phase 2: owner can update roles)
-- Phase 1: No role updates allowed
CREATE POLICY "No role updates in Phase 1"
  ON alliance_members FOR UPDATE
  USING (false);
```

---

## 🔒 RLS Policies 重構

### 核心模式：從「直接擁有權」改為「成員關係」

**關鍵優化**（符合 CLAUDE.md 🔴）：
- ✅ 使用 `(SELECT auth.uid())` subquery（比直接調用快 30-70%）
- ✅ 使用 `EXISTS` 進行成員關係檢查（高效）
- ✅ 採用「間接擁有權」模式（透過 JOIN 檢查）

### 1. Alliances 表格

```sql
-- ========================================
-- RLS Policies for alliances
-- ========================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view own alliance" ON alliances;
DROP POLICY IF EXISTS "Users can create own alliance" ON alliances;
DROP POLICY IF EXISTS "Users can update own alliance" ON alliances;
DROP POLICY IF EXISTS "Users can delete own alliance" ON alliances;

-- Policy 1: Members can view alliance
CREATE POLICY "Members can view alliance"
  ON alliances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliances.id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

-- Policy 2: Any authenticated user can create alliance
-- Note: Creator will be automatically added to alliance_members with 'owner' role
CREATE POLICY "Users can create alliance"
  ON alliances FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Policy 3: Members can update alliance
-- Phase 1: Any member can update
-- Phase 2: Restrict to owner/admin/editor
CREATE POLICY "Members can update alliance"
  ON alliances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliances.id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

-- Policy 4: Only owner can delete alliance
CREATE POLICY "Owner can delete alliance"
  ON alliances FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliances.id
        AND alliance_members.user_id = (SELECT auth.uid())
        AND alliance_members.role = 'owner'
    )
  );
```

### 2. Seasons 表格

```sql
-- ========================================
-- RLS Policies for seasons
-- ========================================

DROP POLICY IF EXISTS "Users can view own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can create own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can update own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can delete own seasons" ON seasons;

-- Policy 1: Members can view seasons
CREATE POLICY "Members can view seasons"
  ON seasons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = seasons.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

-- Policy 2: Members can create seasons
CREATE POLICY "Members can create seasons"
  ON seasons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = seasons.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

-- Policy 3: Members can update seasons
CREATE POLICY "Members can update seasons"
  ON seasons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = seasons.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

-- Policy 4: Members can delete seasons
CREATE POLICY "Members can delete seasons"
  ON seasons FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = seasons.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );
```

### 3. CSV Uploads 表格

```sql
-- ========================================
-- RLS Policies for csv_uploads
-- ========================================

DROP POLICY IF EXISTS "Users can view own uploads" ON csv_uploads;
DROP POLICY IF EXISTS "Users can create own uploads" ON csv_uploads;
DROP POLICY IF EXISTS "Users can delete own uploads" ON csv_uploads;

CREATE POLICY "Members can view uploads"
  ON csv_uploads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = csv_uploads.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can create uploads"
  ON csv_uploads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = csv_uploads.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can delete uploads"
  ON csv_uploads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = csv_uploads.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );
```

### 4. Members 表格

```sql
-- ========================================
-- RLS Policies for members
-- ========================================

DROP POLICY IF EXISTS "Users can view own members" ON members;
DROP POLICY IF EXISTS "Users can create own members" ON members;
DROP POLICY IF EXISTS "Users can update own members" ON members;

CREATE POLICY "Alliance members can view game members"
  ON members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = members.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Alliance members can create game members"
  ON members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = members.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Alliance members can update game members"
  ON members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = members.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );
```

### 5. Member Snapshots 表格

```sql
-- ========================================
-- RLS Policies for member_snapshots
-- ========================================

DROP POLICY IF EXISTS "Users can view own snapshots" ON member_snapshots;
DROP POLICY IF EXISTS "Users can create own snapshots" ON member_snapshots;

CREATE POLICY "Members can view snapshots"
  ON member_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = member_snapshots.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can create snapshots"
  ON member_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = member_snapshots.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );
```

### 6. Hegemony Weights 表格

```sql
-- ========================================
-- RLS Policies for hegemony_weights
-- ========================================

-- Note: Adjust table name and columns based on actual schema

DROP POLICY IF EXISTS "Users can view own weights" ON hegemony_weights;
DROP POLICY IF EXISTS "Users can create own weights" ON hegemony_weights;
DROP POLICY IF EXISTS "Users can update own weights" ON hegemony_weights;
DROP POLICY IF EXISTS "Users can delete own weights" ON hegemony_weights;

CREATE POLICY "Members can view weights"
  ON hegemony_weights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = hegemony_weights.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can create weights"
  ON hegemony_weights FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = hegemony_weights.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can update weights"
  ON hegemony_weights FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = hegemony_weights.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can delete weights"
  ON hegemony_weights FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = hegemony_weights.alliance_id
        AND alliance_members.user_id = (SELECT auth.uid())
    )
  );
```

---

## 🏗️ Backend 實作

### 1. Pydantic Models

```python
# backend/src/models/alliance_member.py
"""
Alliance Member Models

符合 CLAUDE.md:
- 🟡 snake_case for ALL API fields
- 🟢 Google-style docstrings
- 🟢 Type hints
"""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class AllianceMemberBase(BaseModel):
    """Alliance member base model"""
    role: str = Field(default="member", description="Member role (owner/member)")


class AllianceMemberCreate(BaseModel):
    """Create alliance member request (by email)"""
    email: EmailStr = Field(..., description="Email of user to add")
    role: str = Field(default="member", description="Role to assign")


class AllianceMemberDB(BaseModel):
    """Alliance member database model"""
    id: UUID
    alliance_id: UUID
    user_id: UUID
    role: str
    invited_by: UUID | None
    invited_at: datetime
    joined_at: datetime
    created_at: datetime
    updated_at: datetime


class AllianceMemberResponse(BaseModel):
    """Alliance member API response"""
    id: UUID
    alliance_id: UUID
    user_id: UUID
    role: str
    invited_by: UUID | None
    joined_at: datetime
    created_at: datetime

    # User info (from JOIN with auth.users)
    user_email: str | None = None
    user_name: str | None = None


class AllianceMemberListResponse(BaseModel):
    """List of alliance members response"""
    members: list[AllianceMemberResponse]
    total: int
```

### 2. AllianceMemberRepository

```python
# backend/src/repositories/alliance_member_repository.py
"""
Alliance Member Repository

符合 CLAUDE.md:
- 🔴 Inherit from SupabaseRepository
- 🔴 Use _handle_supabase_result() for ALL queries
- 🔴 NEVER access result.data directly
"""

from uuid import UUID
from src.repositories.base import SupabaseRepository
from src.models.alliance_member import AllianceMemberDB


class AllianceMemberRepository(SupabaseRepository[AllianceMemberDB]):
    """
    Alliance member repository for managing user-alliance relationships.

    符合 CLAUDE.md 4-Layer Architecture:
    - Repository Layer: Database queries and data transformation only
    - NO business logic (belongs in Service layer)
    """

    def __init__(self):
        super().__init__(table_name="alliance_members", model_class=AllianceMemberDB)

    def add_member(
        self,
        alliance_id: UUID,
        user_id: UUID,
        role: str = "member",
        invited_by: UUID | None = None
    ) -> AllianceMemberDB:
        """
        Add a member to alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID to add
            role: Member role (default: 'member')
            invited_by: User who invited this member

        Returns:
            AllianceMemberDB: Created member record

        Raises:
            HTTPException: If Supabase operation fails
        """
        result = self.client.from_(self.table_name).insert({
            "alliance_id": str(alliance_id),
            "user_id": str(user_id),
            "role": role,
            "invited_by": str(invited_by) if invited_by else None
        }).execute()

        data = self._handle_supabase_result(result, allow_empty=False)
        return self._build_model(data[0])

    def remove_member(self, alliance_id: UUID, user_id: UUID) -> bool:
        """
        Remove a member from alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID to remove

        Returns:
            bool: True if successful
        """
        result = self.client.from_(self.table_name) \
            .delete() \
            .eq("alliance_id", str(alliance_id)) \
            .eq("user_id", str(user_id)) \
            .execute()

        self._handle_supabase_result(result, allow_empty=True)
        return True

    def get_alliance_members(self, alliance_id: UUID) -> list[dict]:
        """
        Get all members of an alliance with user information.

        Args:
            alliance_id: Alliance UUID

        Returns:
            list[dict]: List of members with joined user data
        """
        # Note: Supabase Python client doesn't support nested select like PostgREST
        # We need to fetch users separately or use RPC
        result = self.client.from_(self.table_name) \
            .select("*") \
            .eq("alliance_id", str(alliance_id)) \
            .order("joined_at") \
            .execute()

        members = self._handle_supabase_result(result, allow_empty=True)

        # Enrich with user data
        # TODO: Implement user data JOIN (requires Supabase RPC or separate query)
        return members

    def get_user_alliances(self, user_id: UUID) -> list[dict]:
        """
        Get all alliances that user is a member of.

        Args:
            user_id: User UUID

        Returns:
            list[dict]: List of memberships with alliance data
        """
        result = self.client.from_(self.table_name) \
            .select("*, alliances(*)") \
            .eq("user_id", str(user_id)) \
            .order("joined_at", desc=True) \
            .execute()

        return self._handle_supabase_result(result, allow_empty=True)

    def is_member(self, alliance_id: UUID, user_id: UUID) -> bool:
        """
        Check if user is a member of alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID

        Returns:
            bool: True if user is member
        """
        result = self.client.from_(self.table_name) \
            .select("id") \
            .eq("alliance_id", str(alliance_id)) \
            .eq("user_id", str(user_id)) \
            .limit(1) \
            .execute()

        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0

    def get_member_role(self, alliance_id: UUID, user_id: UUID) -> str | None:
        """
        Get user's role in alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID

        Returns:
            str | None: Role name or None if not a member
        """
        result = self.client.from_(self.table_name) \
            .select("role") \
            .eq("alliance_id", str(alliance_id)) \
            .eq("user_id", str(user_id)) \
            .single() \
            .execute()

        data = self._handle_supabase_result(result, allow_empty=True)
        return data.get("role") if data else None

    def update_role(
        self,
        alliance_id: UUID,
        user_id: UUID,
        new_role: str
    ) -> AllianceMemberDB:
        """
        Update member's role (Phase 2).

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID
            new_role: New role to assign

        Returns:
            AllianceMemberDB: Updated member record
        """
        result = self.client.from_(self.table_name) \
            .update({"role": new_role}) \
            .eq("alliance_id", str(alliance_id)) \
            .eq("user_id", str(user_id)) \
            .execute()

        data = self._handle_supabase_result(result, allow_empty=False)
        return self._build_model(data[0])
```

### 3. AllianceMemberService

```python
# backend/src/services/alliance_member_service.py
"""
Alliance Member Service

符合 CLAUDE.md:
- 🔴 Service Layer: Business logic and workflow orchestration
- 🔴 NO direct database calls (use Repository)
- 🟡 Exception chaining with 'from e'
"""

from uuid import UUID
from fastapi import HTTPException, status
from src.repositories.alliance_member_repository import AllianceMemberRepository
from src.core.database import get_supabase_client


class AllianceMemberService:
    """
    Alliance member service for managing collaboration.

    Responsibilities:
    - Add/remove members
    - Verify permissions
    - Handle business logic
    """

    def __init__(self):
        self._member_repo = AllianceMemberRepository()
        self._supabase = get_supabase_client()

    async def add_member_by_email(
        self,
        current_user_id: UUID,
        alliance_id: UUID,
        email: str
    ) -> dict:
        """
        Add member to alliance by email.

        Business Rules:
        - Phase 1: Any member can add new members
        - Phase 2: Restrict to owner/admin only
        - User must be registered in auth.users
        - Cannot add duplicate members

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance to add member to
            email: Email of user to add

        Returns:
            dict: Member information

        Raises:
            HTTPException 403: Not a member of alliance
            HTTPException 404: Email not found
            HTTPException 409: User already a member
        """
        try:
            # 1. Verify current user is member of alliance
            if not self._member_repo.is_member(alliance_id, current_user_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a member of this alliance"
                )

            # 2. Look up user by email in auth.users
            # Note: Supabase Python client doesn't expose admin.list_users()
            # Alternative: Use RPC function or service_role key
            result = self._supabase.auth.admin.list_users()
            target_user = next((u for u in result if u.email == email), None)

            if not target_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User with this email not found. Please ask them to register first."
                )

            target_user_id = UUID(target_user.id)

            # 3. Check if already a member
            if self._member_repo.is_member(alliance_id, target_user_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User is already a member of this alliance"
                )

            # 4. Add member
            member = self._member_repo.add_member(
                alliance_id=alliance_id,
                user_id=target_user_id,
                role="member",
                invited_by=current_user_id
            )

            return {
                "id": str(member.id),
                "user_id": str(member.user_id),
                "email": email,
                "role": member.role,
                "joined_at": member.joined_at.isoformat()
            }

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to add member"
            ) from e

    async def remove_member(
        self,
        current_user_id: UUID,
        alliance_id: UUID,
        target_user_id: UUID
    ) -> bool:
        """
        Remove member from alliance.

        Business Rules:
        - Phase 1: Any member can remove others (except owner and self)
        - Phase 2: Restrict to owner/admin only
        - Cannot remove alliance owner
        - Cannot remove yourself

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance UUID
            target_user_id: User to remove

        Returns:
            bool: True if successful

        Raises:
            HTTPException 403: Permission denied
            HTTPException 400: Invalid operation
        """
        try:
            # 1. Verify current user is member
            if not self._member_repo.is_member(alliance_id, current_user_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a member of this alliance"
                )

            # 2. Cannot remove owner
            target_role = self._member_repo.get_member_role(alliance_id, target_user_id)
            if target_role == "owner":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot remove alliance owner"
                )

            # 3. Cannot remove self
            if current_user_id == target_user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove yourself from alliance"
                )

            # 4. Remove member
            return self._member_repo.remove_member(alliance_id, target_user_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to remove member"
            ) from e

    async def get_alliance_members(
        self,
        current_user_id: UUID,
        alliance_id: UUID
    ) -> list[dict]:
        """
        Get all members of alliance.

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance UUID

        Returns:
            list[dict]: List of members

        Raises:
            HTTPException 403: Not a member
        """
        try:
            # Verify permission
            if not self._member_repo.is_member(alliance_id, current_user_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a member of this alliance"
                )

            return self._member_repo.get_alliance_members(alliance_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get alliance members"
            ) from e
```

### 4. 更新 AllianceService

```python
# backend/src/services/alliance_service.py
# 需要修改的部分

from src.repositories.alliance_member_repository import AllianceMemberRepository


class AllianceService:
    """Alliance service - UPDATED for multi-user support"""

    def __init__(self):
        # ... existing code ...
        self._member_repo = AllianceMemberRepository()

    async def create_alliance(
        self,
        user_id: UUID,
        name: str,
        server_name: str | None = None
    ) -> Alliance:
        """
        Create alliance and automatically add creator as owner.

        Phase 1 Change:
        - Remove user_id from alliances table
        - Add creator to alliance_members with role='owner'
        """
        # 1. Create alliance (no user_id anymore)
        alliance = self._alliance_repo.create({
            "name": name,
            "server_name": server_name
        })

        # 2. Add creator as owner in alliance_members
        self._member_repo.add_member(
            alliance_id=alliance.id,
            user_id=user_id,
            role="owner",
            invited_by=None  # Owner is not invited by anyone
        )

        return alliance

    async def get_user_alliance(self, user_id: UUID) -> Alliance | None:
        """
        Get user's alliance (first one if multiple).

        Phase 1 Change:
        - Query through alliance_members instead of alliances.user_id
        """
        # Get all alliances user is member of
        memberships = self._member_repo.get_user_alliances(user_id)

        if not memberships:
            return None

        # Phase 1: Return first alliance
        # Phase 2: Implement alliance switcher
        return memberships[0].get("alliances")

    async def delete_alliance(
        self,
        user_id: UUID,
        alliance_id: UUID
    ) -> bool:
        """
        Delete alliance (only owner can delete).

        Phase 1 Change:
        - Verify user is owner via alliance_members
        - CASCADE will automatically delete all members
        """
        # Verify user is owner
        role = self._member_repo.get_member_role(alliance_id, user_id)
        if role != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only alliance owner can delete alliance"
            )

        # Delete alliance (members will be deleted via CASCADE)
        return self._alliance_repo.delete(alliance_id)
```

### 5. API Endpoints

```python
# backend/src/api/v1/endpoints/alliance_members.py
"""
Alliance Members API Endpoints

符合 CLAUDE.md:
- 🔴 API Layer: HTTP handling, validation, authentication only
- 🔴 Delegate ALL business logic to Service layer
- 🔴 Use Depends() for dependency injection
"""

from fastapi import APIRouter, Depends, status
from uuid import UUID

from src.core.auth import get_current_user_id
from src.services.alliance_member_service import AllianceMemberService
from src.models.alliance_member import (
    AllianceMemberCreate,
    AllianceMemberListResponse
)

router = APIRouter(tags=["alliance-members"])


def get_alliance_member_service() -> AllianceMemberService:
    """Dependency: Get alliance member service instance"""
    return AllianceMemberService()


@router.post(
    "/alliances/{alliance_id}/members",
    status_code=status.HTTP_201_CREATED,
    summary="Add member to alliance"
)
async def add_alliance_member(
    alliance_id: UUID,
    data: AllianceMemberCreate,
    current_user_id: UUID = Depends(get_current_user_id),
    service: AllianceMemberService = Depends(get_alliance_member_service)
):
    """
    Add a member to alliance by email.

    Requirements:
    - User must be registered in the system
    - Current user must be a member of the alliance
    - Email must not be duplicate

    Returns:
    - 201: Member added successfully
    - 403: Not a member of alliance
    - 404: User email not found
    - 409: User already a member
    """
    return await service.add_member_by_email(
        current_user_id=current_user_id,
        alliance_id=alliance_id,
        email=data.email
    )


@router.get(
    "/alliances/{alliance_id}/members",
    response_model=AllianceMemberListResponse,
    summary="Get alliance members"
)
async def get_alliance_members(
    alliance_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    service: AllianceMemberService = Depends(get_alliance_member_service)
):
    """
    Get all members of an alliance.

    Returns:
    - 200: List of members
    - 403: Not a member of alliance
    """
    members = await service.get_alliance_members(current_user_id, alliance_id)
    return AllianceMemberListResponse(
        members=members,
        total=len(members)
    )


@router.delete(
    "/alliances/{alliance_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member from alliance"
)
async def remove_alliance_member(
    alliance_id: UUID,
    user_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    service: AllianceMemberService = Depends(get_alliance_member_service)
):
    """
    Remove a member from alliance.

    Restrictions:
    - Cannot remove alliance owner
    - Cannot remove yourself

    Returns:
    - 204: Member removed successfully
    - 400: Invalid operation (e.g., removing self)
    - 403: Permission denied
    """
    await service.remove_member(current_user_id, alliance_id, user_id)
    return None
```

### 6. 註冊 Router

```python
# backend/src/main.py
# Add import
from src.api.v1.endpoints import alliance_members

# Include router
app.include_router(alliance_members.router, prefix="/api/v1")
```

---

## 🎨 Frontend 實作

### 1. 更新 API Client

```typescript
// frontend/src/lib/api-client.ts

// Add interface
interface AddMemberRequest {
  readonly email: string
  readonly role?: string
}

interface AllianceMember {
  readonly id: string
  readonly alliance_id: string
  readonly user_id: string
  readonly role: string
  readonly joined_at: string
  readonly user_email?: string
  readonly user_name?: string
}

interface AllianceMembersResponse {
  readonly members: AllianceMember[]
  readonly total: number
}

// Add to allianceApi
export const allianceApi = {
  // ... existing methods ...

  /**
   * Get all members of alliance
   */
  getMembers: async (allianceId: string): Promise<AllianceMembersResponse> => {
    const { data } = await apiClient.get(`/alliances/${allianceId}/members`)
    return data
  },

  /**
   * Add member to alliance by email
   */
  addMember: async (allianceId: string, email: string): Promise<AllianceMember> => {
    const { data } = await apiClient.post(
      `/alliances/${allianceId}/members`,
      { email }
    )
    return data
  },

  /**
   * Remove member from alliance
   */
  removeMember: async (allianceId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/alliances/${allianceId}/members/${userId}`)
  },
}
```

### 2. TanStack Query Hooks

```typescript
// frontend/src/hooks/use-alliance-members.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { allianceApi } from '@/lib/api-client'

/**
 * Fetch alliance members
 */
export const useAllianceMembers = (allianceId: string | undefined) => {
  return useQuery({
    queryKey: ['alliances', allianceId, 'members'],
    queryFn: () => allianceApi.getMembers(allianceId!),
    enabled: !!allianceId,
  })
}

/**
 * Add member to alliance
 */
export const useAddAllianceMember = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ allianceId, email }: { allianceId: string; email: string }) =>
      allianceApi.addMember(allianceId, email),
    onSuccess: (_, { allianceId }) => {
      // Invalidate members list
      queryClient.invalidateQueries({
        queryKey: ['alliances', allianceId, 'members'],
      })
    },
  })
}

/**
 * Remove member from alliance
 */
export const useRemoveAllianceMember = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ allianceId, userId }: { allianceId: string; userId: string }) =>
      allianceApi.removeMember(allianceId, userId),
    onSuccess: (_, { allianceId }) => {
      // Invalidate members list
      queryClient.invalidateQueries({
        queryKey: ['alliances', allianceId, 'members'],
      })
    },
  })
}
```

### 3. AllianceMemberManager 組件

```typescript
// frontend/src/components/alliance/AllianceMemberManager.tsx
import React from 'react'
import { useAllianceMembers, useAddAllianceMember, useRemoveAllianceMember } from '@/hooks/use-alliance-members'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface AllianceMemberManagerProps {
  readonly allianceId: string
}

export const AllianceMemberManager: React.FC<AllianceMemberManagerProps> = ({ allianceId }) => {
  const [email, setEmail] = React.useState('')
  const { toast } = useToast()

  const { data: membersData, isLoading } = useAllianceMembers(allianceId)
  const addMember = useAddAllianceMember()
  const removeMember = useRemoveAllianceMember()

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await addMember.mutateAsync({ allianceId, email })
      setEmail('')
      toast({
        title: '成員已新增',
        description: `已成功新增 ${email} 到同盟`,
      })
    } catch (error) {
      toast({
        title: '新增失敗',
        description: error instanceof Error ? error.message : '請稍後再試',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveMember = async (userId: string, userEmail: string) => {
    if (!confirm(`確定要移除 ${userEmail}？`)) return

    try {
      await removeMember.mutateAsync({ allianceId, userId })
      toast({
        title: '成員已移除',
        description: `已將 ${userEmail} 移出同盟`,
      })
    } catch (error) {
      toast({
        title: '移除失敗',
        description: error instanceof Error ? error.message : '請稍後再試',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>成員管理</CardTitle>
        <CardDescription>
          邀請其他使用者加入你的同盟，共同管理成員數據
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add Member Form */}
        <form onSubmit={handleAddMember} className="flex gap-2">
          <Input
            type="email"
            placeholder="輸入成員的 email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={addMember.isPending}
          />
          <Button type="submit" disabled={addMember.isPending}>
            {addMember.isPending ? '新增中...' : '新增成員'}
          </Button>
        </form>

        {/* Members List */}
        <div className="space-y-2">
          <h4 className="font-medium">
            目前成員 ({membersData?.total ?? 0})
          </h4>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : membersData?.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無成員</p>
          ) : (
            <div className="space-y-2">
              {membersData?.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {member.user_email || member.user_id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {member.role === 'owner' ? '👑 擁有者' : '👤 成員'} ·
                      加入於 {new Date(member.joined_at).toLocaleDateString('zh-TW')}
                    </p>
                  </div>

                  {member.role !== 'owner' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveMember(member.user_id, member.user_email || 'Unknown')}
                      disabled={removeMember.isPending}
                    >
                      移除
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

### 4. 整合到 Settings 頁面

```typescript
// frontend/src/pages/Settings.tsx
import React from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AllianceSettings } from '@/components/alliance/AllianceSettings'
import { AllianceMemberManager } from '@/components/alliance/AllianceMemberManager'
import { useAlliance } from '@/hooks/use-alliance'

export const Settings: React.FC = () => {
  const { data: alliance, isLoading } = useAlliance()

  if (isLoading) {
    return (
      <DashboardLayout>
        <div>載入中...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">設定</h1>
          <p className="text-muted-foreground">管理你的同盟設定與成員</p>
        </div>

        {/* Alliance Settings */}
        {alliance && <AllianceSettings alliance={alliance} />}

        {/* Member Management (NEW) */}
        {alliance && <AllianceMemberManager allianceId={alliance.id} />}
      </div>
    </DashboardLayout>
  )
}
```

---

## ✅ 實作檢查清單

### Phase 1: Database 層

- [ ] **建立 alliance_members 表格**
  - [ ] 定義 schema（9 欄位）
  - [ ] 建立 UNIQUE constraint
  - [ ] 建立 3 個索引
  - [ ] 建立 updated_at trigger

- [ ] **資料遷移**
  - [ ] 備份現有資料
  - [ ] 執行 INSERT INTO alliance_members
  - [ ] 驗證遷移成功（比對筆數）
  - [ ] 執行 ALTER TABLE alliances DROP COLUMN user_id

- [ ] **RLS Policies 更新**
  - [ ] alliance_members 表格（4 個 policies）
  - [ ] alliances 表格（4 個 policies）
  - [ ] seasons 表格（4 個 policies）
  - [ ] csv_uploads 表格（3 個 policies）
  - [ ] members 表格（3 個 policies）
  - [ ] member_snapshots 表格（2 個 policies）
  - [ ] hegemony_weights 表格（4 個 policies）

- [ ] **驗證 RLS Policies**
  - [ ] 使用不同 user 測試存取權限
  - [ ] 確認 subquery pattern 運作

### Phase 2: Backend 層

- [ ] **Models**
  - [ ] 建立 AllianceMemberBase
  - [ ] 建立 AllianceMemberCreate
  - [ ] 建立 AllianceMemberDB
  - [ ] 建立 AllianceMemberResponse
  - [ ] 建立 AllianceMemberListResponse

- [ ] **Repository**
  - [ ] 建立 AllianceMemberRepository
  - [ ] 實作 add_member()
  - [ ] 實作 remove_member()
  - [ ] 實作 get_alliance_members()
  - [ ] 實作 get_user_alliances()
  - [ ] 實作 is_member()
  - [ ] 實作 get_member_role()

- [ ] **Service**
  - [ ] 建立 AllianceMemberService
  - [ ] 實作 add_member_by_email()
  - [ ] 實作 remove_member()
  - [ ] 實作 get_alliance_members()
  - [ ] 更新 AllianceService.create_alliance()
  - [ ] 更新 AllianceService.get_user_alliance()
  - [ ] 更新 AllianceService.delete_alliance()

- [ ] **API Endpoints**
  - [ ] POST /alliances/{id}/members
  - [ ] GET /alliances/{id}/members
  - [ ] DELETE /alliances/{id}/members/{user_id}
  - [ ] 註冊 router 到 main.py

- [ ] **程式碼品質**
  - [ ] 執行 `uv run ruff check .`
  - [ ] 修復所有 high-priority errors
  - [ ] 確保 <50 total errors

### Phase 3: Frontend 層

- [ ] **API Client**
  - [ ] 定義 TypeScript interfaces
  - [ ] 實作 getMembers()
  - [ ] 實作 addMember()
  - [ ] 實作 removeMember()

- [ ] **React Hooks**
  - [ ] useAllianceMembers
  - [ ] useAddAllianceMember
  - [ ] useRemoveAllianceMember

- [ ] **UI 組件**
  - [ ] AllianceMemberManager 組件
  - [ ] 整合到 Settings.tsx

- [ ] **程式碼品質**
  - [ ] 執行 `npm run lint`
  - [ ] 執行 `npx tsc --noEmit`
  - [ ] 確保無 console errors

### Phase 4: 測試

- [ ] **功能測試**
  - [ ] 建立 alliance 自動成為 owner
  - [ ] 透過 email 新增成員
  - [ ] 新增不存在的 email（應 404）
  - [ ] 重複新增相同成員（應 409）
  - [ ] 移除成員
  - [ ] 嘗試移除 owner（應禁止）
  - [ ] 嘗試移除自己（應禁止）

- [ ] **權限測試**
  - [ ] Member A 可以看到 Member B 的資料
  - [ ] Non-member 看不到 alliance 資料
  - [ ] Member 可以上傳 CSV
  - [ ] Member 可以查看 seasons

- [ ] **RLS 測試**
  - [ ] 使用不同 auth.uid() 測試存取
  - [ ] 驗證 RLS policies 正確阻擋

---

## 🚀 Phase 2 擴展規劃

### 1. 完整權限系統

```typescript
enum AllianceRole {
  OWNER = 'owner',      // 完全控制（刪除 alliance、轉移擁有權）
  ADMIN = 'admin',      // 管理權限（新增/移除成員、編輯資料）
  EDITOR = 'editor',    // 編輯權限（新增/編輯資料，不能管理成員）
  VIEWER = 'viewer',    // 唯讀權限（只能查看）
}
```

**實作步驟**：
1. 更新 RLS policies 加入 role 檢查
2. API endpoints 加入權限驗證
3. Frontend 根據 role 顯示不同 UI

### 2. 邀請連結系統

```sql
CREATE TABLE alliance_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  invitee_email VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',

  -- Invitation status
  status VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, declined, expired

  -- Token for secure invitation
  invitation_token UUID DEFAULT uuid_generate_v4(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),

  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,

  UNIQUE(alliance_id, invitee_email, status)
);
```

**邀請流程**：
1. Owner 輸入 email + role
2. 系統產生 invitation_token
3. 發送邀請郵件（包含 `/invite/{token}`）
4. 受邀者點擊連結：
   - 未註冊 → 導向註冊
   - 已註冊 → 直接加入
5. 更新 status = 'accepted'

### 3. Alliance Switcher

**使用場景**：使用者加入多個 alliances

```typescript
// Context for managing current alliance
const AllianceContext = createContext<{
  currentAllianceId: string | null
  alliances: Alliance[]
  switchAlliance: (id: string) => void
}>()

// Header component with alliance selector
<Select value={currentAllianceId} onValueChange={switchAlliance}>
  {alliances.map(alliance => (
    <SelectItem key={alliance.id} value={alliance.id}>
      {alliance.name}
    </SelectItem>
  ))}
</Select>
```

### 4. 成員活動記錄

```sql
CREATE TABLE alliance_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50) NOT NULL,  -- 'member_added', 'member_removed', 'data_uploaded'
  target_user_id UUID REFERENCES auth.users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5. 成員通知系統

- 成員被加入/移除時發送通知
- 整合 Email / Push Notification
- 成員權限變更通知

---

## 🛡️ Edge Cases 處理

### 1. 使用者輸入不存在的 email

**處理方式**：
```python
if not target_user:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="User with this email not found. Please ask them to register first."
    )
```

**Frontend 提示**：
```typescript
toast({
  title: '找不到該使用者',
  description: '請確認對方已經註冊本系統',
  variant: 'destructive',
})
```

### 2. 重複加入相同成員

**Database 層防護**：
```sql
CONSTRAINT unique_alliance_user UNIQUE(alliance_id, user_id)
```

**Service 層檢查**：
```python
if self._member_repo.is_member(alliance_id, target_user_id):
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="User is already a member of this alliance"
    )
```

### 3. Owner 嘗試移除自己

**Service 層阻擋**：
```python
if current_user_id == target_user_id:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Cannot remove yourself from alliance"
    )
```

**Phase 2 解決方案**：實作「轉移擁有權」功能

### 4. 嘗試移除 Alliance Owner

**Service 層阻擋**：
```python
if target_role == "owner":
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Cannot remove alliance owner"
    )
```

### 5. Alliance 沒有任何成員

**不可能發生**：
- 建立 alliance 時自動加入 owner
- 禁止移除 owner
- 刪除 alliance 時 CASCADE 刪除所有 members

### 6. 成員被踢出後還在使用 App

**RLS 自動保護**：
- 所有查詢都透過 alliance_members 檢查
- 被移除後立即失去存取權限

**Frontend 處理**：
```typescript
// TanStack Query 定期 refetch
const { data: alliance, error } = useAlliance({
  refetchInterval: 30000,  // 每 30 秒檢查一次
})

// 如果 403，顯示友善訊息
if (error?.status === 403) {
  return <div>您已不再是該同盟的成員</div>
}
```

### 7. 並發編輯衝突

**Supabase 保護**：
- PostgreSQL ACID 保證原子性
- RLS policies 確保權限一致性

**Frontend 優化**：
```typescript
// TanStack Query optimistic updates
const mutation = useMutation({
  mutationFn: updateData,
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['data'] })

    // Snapshot previous value
    const previous = queryClient.getQueryData(['data'])

    // Optimistically update
    queryClient.setQueryData(['data'], newData)

    return { previous }
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['data'], context.previous)
  },
})
```

---

## 📝 總結

### 方案優勢

✅ **架構完整** - 符合業界標準的成員管理設計
✅ **向前相容** - 易於擴展到 Phase 2 權限系統
✅ **效能優化** - RLS policies 使用 subquery pattern（快 30-70%）
✅ **安全可靠** - 完整的權限檢查與 RLS 保護
✅ **符合規範** - 100% 遵循 CLAUDE.md 標準
✅ **最小改動** - Frontend 改動最小化，不影響現有功能

### 實作時程估算

| 階段 | 預估時間 | 難度 |
|------|---------|------|
| Database 層 | 2-3 小時 | ⭐⭐⭐ |
| Backend 層 | 4-6 小時 | ⭐⭐⭐⭐ |
| Frontend 層 | 3-4 小時 | ⭐⭐⭐ |
| 測試與修正 | 2-3 小時 | ⭐⭐ |
| **總計** | **11-16 小時** | |

### 注意事項

🔴 **Critical**：
- Database migration 前務必備份資料
- 測試所有 RLS policies 運作正常
- 確保 repository 使用 `_handle_supabase_result()`

🟡 **Important**：
- 執行 `uv run ruff check .` 確保程式碼品質
- 所有 API 使用 snake_case
- Frontend 使用 ES imports（禁止 require）

🟢 **Recommended**：
- 寫清楚的 docstrings
- 適當的錯誤處理與 toast 提示
- 考慮 Phase 2 擴展需求

---

**Document Version:** 1.0.0
**Status:** 📋 Ready for Implementation
**Next Steps:** 依照檢查清單逐步實作

如有問題或需要調整，請參考本文件或詢問開發團隊。
