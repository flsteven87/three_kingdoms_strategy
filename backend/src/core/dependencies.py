"""
FastAPI dependency injection providers

符合 CLAUDE.md 🟡: 2025 Standard - Annotated type aliases for reusability and testability

This module provides type-safe dependency injection aliases for:
- Database clients
- Service layer instances
- Authentication utilities

Usage:
    from src.core.dependencies import AllianceServiceDep, UserIdDep

    @router.get("")
    async def get_alliance(
        service: AllianceServiceDep,
        user_id: UserIdDep,
    ):
        return await service.get_user_alliance(user_id)
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends
from supabase import Client

from src.core.auth import get_current_user_id
from src.core.database import get_supabase_client
from src.services.alliance_collaborator_service import AllianceCollaboratorService
from src.services.alliance_service import AllianceService
from src.services.analytics_service import AnalyticsService
from src.services.battle_event_service import BattleEventService
from src.services.csv_upload_service import CSVUploadService
from src.services.hegemony_weight_service import HegemonyWeightService
from src.services.line_binding_service import LineBindingService
from src.services.period_metrics_service import PeriodMetricsService
from src.services.permission_service import PermissionService
from src.services.season_service import SeasonService

# ============================================================================
# Provider Functions (called by Type Aliases)
# ============================================================================

def get_db() -> Client:
    """Get Supabase database client"""
    return get_supabase_client()


def get_alliance_service() -> AllianceService:
    """Get alliance service instance"""
    return AllianceService()


def get_csv_upload_service() -> CSVUploadService:
    """Get CSV upload service instance"""
    return CSVUploadService()


def get_season_service() -> SeasonService:
    """Get season service instance"""
    return SeasonService()


def get_alliance_collaborator_service() -> AllianceCollaboratorService:
    """Get alliance collaborator service instance"""
    return AllianceCollaboratorService()


def get_permission_service() -> PermissionService:
    """Get permission service instance"""
    return PermissionService()


def get_hegemony_weight_service() -> HegemonyWeightService:
    """Get hegemony weight service instance"""
    return HegemonyWeightService()


def get_period_metrics_service() -> PeriodMetricsService:
    """Get period metrics service instance"""
    return PeriodMetricsService()


def get_analytics_service() -> AnalyticsService:
    """Get analytics service instance"""
    return AnalyticsService()


def get_battle_event_service() -> BattleEventService:
    """Get battle event service instance"""
    return BattleEventService()


def get_line_binding_service() -> LineBindingService:
    """Get LINE binding service instance"""
    return LineBindingService()


# ============================================================================
# Type Aliases for Dependency Injection (2025 Standard)
# 符合 CLAUDE.md 🟡: Annotated[Type, Depends()] pattern
# ============================================================================

# Database
DbClientDep = Annotated[Client, Depends(get_db)]

# Authentication
UserIdDep = Annotated[UUID, Depends(get_current_user_id)]

# Services
AllianceServiceDep = Annotated[AllianceService, Depends(get_alliance_service)]
SeasonServiceDep = Annotated[SeasonService, Depends(get_season_service)]
CSVUploadServiceDep = Annotated[CSVUploadService, Depends(get_csv_upload_service)]
AllianceCollaboratorServiceDep = Annotated[
    AllianceCollaboratorService,
    Depends(get_alliance_collaborator_service)
]
PermissionServiceDep = Annotated[PermissionService, Depends(get_permission_service)]
HegemonyWeightServiceDep = Annotated[
    HegemonyWeightService,
    Depends(get_hegemony_weight_service)
]
PeriodMetricsServiceDep = Annotated[
    PeriodMetricsService,
    Depends(get_period_metrics_service)
]
AnalyticsServiceDep = Annotated[AnalyticsService, Depends(get_analytics_service)]
BattleEventServiceDep = Annotated[BattleEventService, Depends(get_battle_event_service)]
LineBindingServiceDep = Annotated[LineBindingService, Depends(get_line_binding_service)]
