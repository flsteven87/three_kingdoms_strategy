"""
Base repository with Supabase error handling

符合 CLAUDE.md 🔴 Critical:
- ALL repositories MUST inherit from this base class
- MUST use _handle_supabase_result() for ALL query results
- NEVER access result.data directly
- Uses asyncio.to_thread() to avoid blocking event loop
"""

import asyncio
from collections.abc import Callable
from typing import Any
from uuid import UUID

from postgrest.types import CountMethod
from pydantic import BaseModel
from supabase import Client

from src.core.database import get_supabase_client


class SupabaseRepository[T: BaseModel]:
    """
    Base repository for Supabase data access

    符合 CLAUDE.md: Repository Pattern with error handling

    Note: Supabase Python SDK execute() is synchronous.
    We use asyncio.to_thread() to run in thread pool and avoid blocking.
    """

    def __init__(self, table_name: str, model_class: type[T], client: Client | None = None):
        """
        Initialize repository

        Args:
            table_name: Supabase table name
            model_class: Pydantic model class for data validation
            client: Optional Supabase client (uses global if not provided)
        """
        self.table_name = table_name
        self.model_class = model_class
        self.client = client or get_supabase_client()

    async def _execute_async[R](self, func: Callable[[], R]) -> R:
        """
        Execute synchronous Supabase operation in thread pool

        Args:
            func: Synchronous function to execute

        Returns:
            Result from the function

        Note: Supabase Python SDK is synchronous. This wrapper prevents
        blocking the async event loop during database operations.
        """
        return await asyncio.to_thread(func)

    def _handle_supabase_result(
        self, result: Any, allow_empty: bool = False, expect_single: bool = False
    ) -> list[dict] | dict:
        """
        Handle Supabase query result with error checking

        Args:
            result: Supabase query result
            allow_empty: Allow empty result (default: False)
            expect_single: Expect single row result (default: False)

        Returns:
            Query data (list or dict)

        Raises:
            ValueError: If result is empty and not allowed, or single expected but multiple returned

        符合 CLAUDE.md 🔴: MANDATORY error handling for all Supabase queries
        """
        if not result.data:
            if allow_empty:
                return [] if not expect_single else {}
            raise ValueError(f"No data found in {self.table_name}")

        if expect_single:
            if len(result.data) > 1:
                raise ValueError(
                    f"Expected single result from {self.table_name}, got {len(result.data)}"
                )
            return result.data[0]

        return result.data

    def _build_models(self, data: list[dict]) -> list[T]:
        """
        Build Pydantic models from query results

        Args:
            data: List of dictionaries from database

        Returns:
            List of validated Pydantic models
        """
        return [self.model_class(**row) for row in data]

    def _build_model(self, data: dict) -> T:
        """
        Build single Pydantic model from query result

        Args:
            data: Dictionary from database

        Returns:
            Validated Pydantic model
        """
        return self.model_class(**data)

    async def get_by_id(self, record_id: UUID | str) -> T | None:
        """
        Get single record by ID

        Args:
            record_id: Record UUID or string ID

        Returns:
            Model instance or None if not found
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("id", str(record_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        return self._build_model(data)

    async def get_by_ids(self, record_ids: list[UUID | str]) -> list[T]:
        """
        Get multiple records by IDs in a single query.

        P2 修復: 批次查詢避免 N+1 問題

        Args:
            record_ids: List of record UUIDs or string IDs

        Returns:
            List of model instances (may be fewer than input if some IDs not found)
        """
        if not record_ids:
            return []

        id_strings = [str(rid) for rid in record_ids]

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).select("*").in_("id", id_strings).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_all(self, limit: int = 100) -> list[T]:
        """
        Get all records (with limit)

        Args:
            limit: Maximum number of records to return

        Returns:
            List of model instances
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).select("*").limit(limit).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def count(self) -> int:
        """
        Count total records in table

        Returns:
            Total record count
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*", count=CountMethod.exact)
            .execute()
        )

        return result.count or 0
