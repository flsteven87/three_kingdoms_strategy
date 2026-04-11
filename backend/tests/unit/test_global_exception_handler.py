"""
Global exception handler — integration tests.

Verifies the catch-all Exception handler in main.py:
- returns JSON (not plain text) with status 500
- does not leak stack traces or the raw exception message to the client
- is triggered for exceptions that have no specific handler (e.g. RuntimeError)
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app() -> FastAPI:
    """Build a throwaway app that reuses only the handler we're testing."""
    from src.main import unhandled_exception_handler  # handler we will add

    test_app = FastAPI()
    test_app.add_exception_handler(Exception, unhandled_exception_handler)

    @test_app.get("/boom")
    async def boom():
        raise RuntimeError("secret internal detail: db=foo password=bar")

    return test_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    # raise_server_exceptions=False lets the handler run instead of
    # re-raising through TestClient.
    return TestClient(app, raise_server_exceptions=False)


def test_returns_json_500(client: TestClient):
    response = client.get("/boom")
    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")


def test_does_not_leak_exception_message(client: TestClient):
    response = client.get("/boom")
    body = response.json()
    assert "detail" in body
    assert "secret internal detail" not in body["detail"]
    assert "password" not in body["detail"]
