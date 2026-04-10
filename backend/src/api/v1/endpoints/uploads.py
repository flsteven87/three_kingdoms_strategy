"""
CSV Upload API Endpoints

符合 CLAUDE.md 🔴:
- API Layer delegates to Service Layer
- Uses Provider Pattern for dependency injection
- Returns proper HTTP status codes
- JWT authentication required
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile

from src.core.dependencies import CSVUploadServiceDep, UserIdDep
from src.utils.csv_io import read_csv_upload

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("")
async def upload_csv(
    user_id: UserIdDep,
    service: CSVUploadServiceDep,
    season_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    snapshot_date: Annotated[str | None, Form()] = None,
):
    """
    Upload CSV file for a season

    Args:
        season_id: Season UUID (as string from form)
        file: CSV file upload
        snapshot_date: Optional custom snapshot datetime (ISO format)
        service: CSV upload service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Upload result with statistics

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    # Parse season_id string to UUID
    season_uuid = UUID(season_id)

    csv_content = await read_csv_upload(file)

    # Upload CSV
    result = await service.upload_csv(
        user_id=user_id,
        season_id=season_uuid,
        filename=file.filename,
        csv_content=csv_content,
        custom_snapshot_date=snapshot_date,
    )
    return result


@router.get("")
async def list_uploads(
    user_id: UserIdDep,
    service: CSVUploadServiceDep,
    season_id: UUID,
):
    """
    Get all CSV uploads for a season

    Args:
        season_id: Season UUID
        service: CSV upload service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        List of upload records

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    uploads = await service.get_uploads_by_season(user_id=user_id, season_id=season_id)

    return {"uploads": uploads, "total": len(uploads)}


@router.delete("/{upload_id}")
async def delete_upload(
    user_id: UserIdDep,
    service: CSVUploadServiceDep,
    upload_id: UUID,
):
    """
    Delete a CSV upload (with cascading snapshots) and recalculate periods

    Args:
        upload_id: CSV upload UUID
        service: CSV upload service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Deletion result with recalculated periods count

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    result = await service.delete_upload(user_id=user_id, upload_id=upload_id)

    return {
        "message": "Upload deleted successfully",
        "upload_id": upload_id,
        "recalculated_periods": result["recalculated_periods"],
    }
