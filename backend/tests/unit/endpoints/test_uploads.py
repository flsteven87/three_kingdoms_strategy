"""
Unit Tests for CSV Upload Endpoints

Tests verify the HTTP contract of the /uploads router:
- Route existence and method matching
- Authentication enforcement (401 when no/invalid token)
- Proper delegation to CSVUploadService
- Status codes and response shapes for happy paths
- Error propagation from service and from csv_io utilities

Following project conventions:
- AAA (Arrange-Act-Assert)
- DI override via app.dependency_overrides
- Service layer mocked — no business logic tested here
"""

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.uploads import router
from src.core.dependencies import get_csv_upload_service, get_current_user_id
from src.services.csv_upload_service import CSVUploadService


def _add_production_exception_handlers(test_app: FastAPI) -> None:
    """Register the same global ValueError handler that production uses.

    The endpoint relies on this handler to convert ValueError from read_csv_upload
    into 400 responses instead of crashing. Tests that exercise those code paths
    need the handler present.
    """

    @test_app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        detail = str(exc)
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": detail})


# =============================================================================
# Constants
# =============================================================================

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
UPLOAD_ID = UUID("55555555-5555-5555-5555-555555555555")

VALID_FILENAME = "同盟統計2025年10月09日10时13分09秒.csv"
MINIMAL_CSV = (
    "成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週,"
    " 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組\n"
    "張飛, 1, 100, 200, 10, 50, 1000, 2000, 100, 500, 10000, 徐州, 前鋒隊\n"
)

UPLOAD_RESULT = {
    "upload_id": str(UPLOAD_ID),
    "season_id": str(SEASON_ID),
    "filename": VALID_FILENAME,
    "snapshot_date": "2025-10-09T10:13:09+08:00",
    "members_processed": 1,
    "snapshots_created": 1,
    "periods_recalculated": 1,
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_csv_upload_service() -> MagicMock:
    """Mock CSVUploadService for DI override."""
    svc = MagicMock(spec=CSVUploadService)
    svc.upload_csv = AsyncMock(return_value=UPLOAD_RESULT)
    svc.get_uploads_by_season = AsyncMock(return_value=[UPLOAD_RESULT])
    svc.delete_upload = AsyncMock(return_value={"recalculated_periods": 2})
    return svc


@pytest.fixture
def app(mock_csv_upload_service: MagicMock) -> FastAPI:
    """Test FastAPI app with uploads router and DI overrides.

    Registers the same global ValueError handler as production so tests that
    exercise read_csv_upload error paths receive 400 responses instead of crashing.
    """
    test_app = FastAPI()
    _add_production_exception_handlers(test_app)
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_csv_upload_service] = lambda: mock_csv_upload_service
    test_app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
def app_no_auth(mock_csv_upload_service: MagicMock) -> FastAPI:
    """Test FastAPI app WITHOUT auth override — exercises real 401 path."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_csv_upload_service] = lambda: mock_csv_upload_service
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def unauthed_client(app_no_auth: FastAPI) -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app_no_auth), base_url="http://test") as c:
        yield c


def _csv_multipart(
    filename: str = VALID_FILENAME,
    content: str = MINIMAL_CSV,
    season_id: str = str(SEASON_ID),
    snapshot_date: str | None = None,
) -> dict:
    """Build multipart form data for a CSV upload request."""
    files = {"file": (filename, BytesIO(content.encode("utf-8")), "text/csv")}
    data: dict = {"season_id": season_id}
    if snapshot_date is not None:
        data["snapshot_date"] = snapshot_date
    return {"files": files, "data": data}


# =============================================================================
# POST /api/v1/uploads — upload_csv
# =============================================================================


class TestUploadCsvEndpoint:
    """Tests for POST /api/v1/uploads"""

    async def test_returns_200_with_upload_result(self, client, mock_csv_upload_service):
        """Happy path: valid CSV file returns 200 and upload statistics."""
        kwargs = _csv_multipart()

        response = await client.post("/api/v1/uploads", **kwargs)

        assert response.status_code == 200
        body = response.json()
        assert body["upload_id"] == str(UPLOAD_ID)
        assert body["members_processed"] == 1

    async def test_delegates_to_service_with_correct_args(self, client, mock_csv_upload_service):
        """Service.upload_csv must be called with user_id, season_id, filename, csv_content."""
        kwargs = _csv_multipart()

        await client.post("/api/v1/uploads", **kwargs)

        mock_csv_upload_service.upload_csv.assert_awaited_once()
        call_kwargs = mock_csv_upload_service.upload_csv.await_args.kwargs
        assert call_kwargs["user_id"] == USER_ID
        assert call_kwargs["season_id"] == SEASON_ID
        assert call_kwargs["filename"] == VALID_FILENAME

    async def test_passes_optional_snapshot_date_to_service(self, client, mock_csv_upload_service):
        """When snapshot_date form field is provided it should be forwarded to the service."""
        custom_date = "2025-10-09T10:00:00+08:00"
        kwargs = _csv_multipart(snapshot_date=custom_date)

        await client.post("/api/v1/uploads", **kwargs)

        call_kwargs = mock_csv_upload_service.upload_csv.await_args.kwargs
        assert call_kwargs["custom_snapshot_date"] == custom_date

    async def test_snapshot_date_defaults_to_none_when_omitted(
        self, client, mock_csv_upload_service
    ):
        """When snapshot_date is not sent, service receives None."""
        kwargs = _csv_multipart()

        await client.post("/api/v1/uploads", **kwargs)

        call_kwargs = mock_csv_upload_service.upload_csv.await_args.kwargs
        assert call_kwargs["custom_snapshot_date"] is None

    async def test_returns_422_for_missing_season_id(self, client):
        """Missing required form field season_id → 422 Unprocessable Entity."""
        response = await client.post(
            "/api/v1/uploads",
            files={"file": (VALID_FILENAME, BytesIO(MINIMAL_CSV.encode()), "text/csv")},
        )

        assert response.status_code == 422

    async def test_returns_422_for_missing_file(self, client):
        """Missing required file field → 422 Unprocessable Entity."""
        response = await client.post(
            "/api/v1/uploads",
            data={"season_id": str(SEASON_ID)},
        )

        assert response.status_code == 422

    async def test_returns_400_for_invalid_season_id_format(self, client):
        """Non-UUID season_id string → 400.

        season_id arrives as a form string and is parsed by UUID() inside the
        endpoint body. UUID() raises ValueError, which the global handler
        converts to 400 Bad Request.
        """
        response = await client.post(
            "/api/v1/uploads",
            files={"file": (VALID_FILENAME, BytesIO(MINIMAL_CSV.encode()), "text/csv")},
            data={"season_id": "not-a-uuid"},
        )

        assert response.status_code == 400

    async def test_non_csv_file_returns_400(self, client):
        """Uploading a non-.csv file → 400.

        read_csv_upload raises ValueError("File must be a CSV file") which the
        global handler converts to 400 Bad Request.
        """
        response = await client.post(
            "/api/v1/uploads",
            files={"file": ("data.txt", BytesIO(b"hello"), "text/plain")},
            data={"season_id": str(SEASON_ID)},
        )

        assert response.status_code == 400
        assert "CSV" in response.json()["detail"]

    async def test_service_403_propagates(self, client, mock_csv_upload_service):
        """Service raising 403 HTTPException propagates as-is."""
        mock_csv_upload_service.upload_csv = AsyncMock(
            side_effect=HTTPException(status_code=403, detail="Permission denied")
        )

        kwargs = _csv_multipart()
        response = await client.post("/api/v1/uploads", **kwargs)

        assert response.status_code == 403
        assert "Permission denied" in response.json()["detail"]

    async def test_service_404_propagates(self, client, mock_csv_upload_service):
        """Service raising 404 HTTPException propagates as-is."""
        mock_csv_upload_service.upload_csv = AsyncMock(
            side_effect=HTTPException(status_code=404, detail="Season not found")
        )

        kwargs = _csv_multipart()
        response = await client.post("/api/v1/uploads", **kwargs)

        assert response.status_code == 404

    async def test_requires_authentication(self, unauthed_client):
        """Endpoint must reject requests without a Bearer token → 403 (HTTPBearer rejects)."""
        kwargs = _csv_multipart()
        response = await unauthed_client.post("/api/v1/uploads", **kwargs)

        assert response.status_code in (401, 403)

    async def test_returns_200_for_gbk_encoded_csv(self, client, mock_csv_upload_service):
        """GBK-encoded CSV files are accepted (read_csv_upload handles encoding fallback)."""
        gbk_content = MINIMAL_CSV.encode("gbk")
        response = await client.post(
            "/api/v1/uploads",
            files={"file": (VALID_FILENAME, BytesIO(gbk_content), "text/csv")},
            data={"season_id": str(SEASON_ID)},
        )

        assert response.status_code == 200

    async def test_large_file_over_limit_returns_400(self, client):
        """Files exceeding 5 MB limit → 400.

        read_csv_upload raises ValueError with a size-limit message which the
        global handler converts to 400 Bad Request.
        """
        oversized = b"x" * (5 * 1024 * 1024 + 1)
        response = await client.post(
            "/api/v1/uploads",
            files={"file": (VALID_FILENAME, BytesIO(oversized), "text/csv")},
            data={"season_id": str(SEASON_ID)},
        )

        assert response.status_code == 400
        assert "MB" in response.json()["detail"]


# =============================================================================
# GET /api/v1/uploads — list_uploads
# =============================================================================


class TestListUploadsEndpoint:
    """Tests for GET /api/v1/uploads"""

    async def test_returns_200_with_uploads_list(self, client, mock_csv_upload_service):
        """Happy path: returns list of uploads and total count."""
        response = await client.get("/api/v1/uploads", params={"season_id": str(SEASON_ID)})

        assert response.status_code == 200
        body = response.json()
        assert "uploads" in body
        assert "total" in body
        assert body["total"] == 1

    async def test_total_matches_uploads_length(self, client, mock_csv_upload_service):
        """total field must equal len(uploads)."""
        mock_csv_upload_service.get_uploads_by_season = AsyncMock(
            return_value=[UPLOAD_RESULT, UPLOAD_RESULT]
        )

        response = await client.get("/api/v1/uploads", params={"season_id": str(SEASON_ID)})

        body = response.json()
        assert body["total"] == 2
        assert len(body["uploads"]) == 2

    async def test_returns_empty_list_when_no_uploads(self, client, mock_csv_upload_service):
        """Returns total=0 and empty uploads list when season has no uploads."""
        mock_csv_upload_service.get_uploads_by_season = AsyncMock(return_value=[])

        response = await client.get("/api/v1/uploads", params={"season_id": str(SEASON_ID)})

        body = response.json()
        assert body["total"] == 0
        assert body["uploads"] == []

    async def test_delegates_to_service_with_correct_args(self, client, mock_csv_upload_service):
        """Service.get_uploads_by_season must receive user_id and season_id."""
        await client.get("/api/v1/uploads", params={"season_id": str(SEASON_ID)})

        mock_csv_upload_service.get_uploads_by_season.assert_awaited_once()
        call_kwargs = mock_csv_upload_service.get_uploads_by_season.await_args.kwargs
        assert call_kwargs["user_id"] == USER_ID
        assert call_kwargs["season_id"] == SEASON_ID

    async def test_returns_422_for_missing_season_id(self, client):
        """Missing required query param season_id → 422."""
        response = await client.get("/api/v1/uploads")

        assert response.status_code == 422

    async def test_returns_422_for_invalid_season_id_format(self, client):
        """Non-UUID season_id query param → 422."""
        response = await client.get("/api/v1/uploads", params={"season_id": "bad-uuid"})

        assert response.status_code == 422

    async def test_requires_authentication(self, unauthed_client):
        """Endpoint must reject unauthenticated requests."""
        response = await unauthed_client.get(
            "/api/v1/uploads", params={"season_id": str(SEASON_ID)}
        )

        assert response.status_code in (401, 403)

    async def test_service_403_propagates(self, client, mock_csv_upload_service):
        """Service 403 propagates to caller."""
        mock_csv_upload_service.get_uploads_by_season = AsyncMock(
            side_effect=HTTPException(status_code=403, detail="Forbidden")
        )

        response = await client.get("/api/v1/uploads", params={"season_id": str(SEASON_ID)})

        assert response.status_code == 403


# =============================================================================
# DELETE /api/v1/uploads/{upload_id} — delete_upload
# =============================================================================


class TestDeleteUploadEndpoint:
    """Tests for DELETE /api/v1/uploads/{upload_id}"""

    async def test_returns_200_with_deletion_message(self, client, mock_csv_upload_service):
        """Happy path: valid upload_id returns 200 with message and recalculated_periods."""
        response = await client.delete(f"/api/v1/uploads/{UPLOAD_ID}")

        assert response.status_code == 200
        body = response.json()
        assert body["message"] == "Upload deleted successfully"
        assert body["upload_id"] == str(UPLOAD_ID)
        assert body["recalculated_periods"] == 2

    async def test_delegates_to_service_with_correct_args(self, client, mock_csv_upload_service):
        """Service.delete_upload must receive user_id and upload_id."""
        await client.delete(f"/api/v1/uploads/{UPLOAD_ID}")

        mock_csv_upload_service.delete_upload.assert_awaited_once()
        call_kwargs = mock_csv_upload_service.delete_upload.await_args.kwargs
        assert call_kwargs["user_id"] == USER_ID
        assert call_kwargs["upload_id"] == UPLOAD_ID

    async def test_upload_id_in_response_matches_path_param(self, client, mock_csv_upload_service):
        """upload_id in response body must match the path parameter."""
        other_id = uuid4()
        response = await client.delete(f"/api/v1/uploads/{other_id}")

        assert response.json()["upload_id"] == str(other_id)

    async def test_returns_422_for_invalid_upload_id_format(self, client):
        """Non-UUID path param → 422."""
        response = await client.delete("/api/v1/uploads/not-a-uuid")

        assert response.status_code == 422

    async def test_requires_authentication(self, unauthed_client):
        """Endpoint must reject unauthenticated requests."""
        response = await unauthed_client.delete(f"/api/v1/uploads/{UPLOAD_ID}")

        assert response.status_code in (401, 403)

    async def test_service_403_propagates(self, client, mock_csv_upload_service):
        """Service 403 propagates — e.g. user doesn't own the upload."""
        mock_csv_upload_service.delete_upload = AsyncMock(
            side_effect=HTTPException(status_code=403, detail="Not your upload")
        )

        response = await client.delete(f"/api/v1/uploads/{UPLOAD_ID}")

        assert response.status_code == 403

    async def test_service_404_propagates(self, client, mock_csv_upload_service):
        """Service 404 propagates when upload_id does not exist."""
        mock_csv_upload_service.delete_upload = AsyncMock(
            side_effect=HTTPException(status_code=404, detail="Upload not found")
        )

        response = await client.delete(f"/api/v1/uploads/{UPLOAD_ID}")

        assert response.status_code == 404

    async def test_recalculated_periods_zero_is_valid(self, client, mock_csv_upload_service):
        """recalculated_periods=0 is a valid response (no periods affected)."""
        mock_csv_upload_service.delete_upload = AsyncMock(return_value={"recalculated_periods": 0})

        response = await client.delete(f"/api/v1/uploads/{UPLOAD_ID}")

        assert response.status_code == 200
        assert response.json()["recalculated_periods"] == 0
