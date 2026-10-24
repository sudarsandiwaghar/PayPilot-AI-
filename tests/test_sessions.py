"""
Integration tests for Shopping Sessions.

Tests session creation, token issuance, metadata updates, termination,
and anonymous bearer-token ownership security.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_session(client: AsyncClient) -> None:
    response = await client.post("/api/v1/sessions", json={"metadata_json": {"shopper_intent": "headphones"}})
    assert response.status_code == 200
    payload = response.json()
    assert payload["errors"] == []

    data = payload["data"]
    assert "session_id" in data
    assert "access_token" in data
    assert data["access_token"].startswith("pp_sess_")
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_get_session_authenticated(client: AsyncClient) -> None:
    # 1. Create session
    create_resp = await client.post("/api/v1/sessions")
    data = create_resp.json()["data"]
    session_id = data["session_id"]
    token = data["access_token"]

    # 2. Get session with Bearer token
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.get(f"/api/v1/sessions/{session_id}", headers=headers)
    assert response.status_code == 200
    res_data = response.json()["data"]
    assert res_data["session_id"] == session_id
    assert res_data["status"] == "active"
    # Verify access_token is NEVER leaked on GET
    assert "access_token" not in res_data


@pytest.mark.asyncio
async def test_get_session_missing_token_returns_401(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/sessions")
    session_id = create_resp.json()["data"]["session_id"]

    # Request without Authorization header
    response = await client.get(f"/api/v1/sessions/{session_id}")
    assert response.status_code == 401
    payload = response.json()
    assert payload["errors"][0]["code"] == "SESSION_TOKEN_MISSING"


@pytest.mark.asyncio
async def test_get_session_invalid_token_returns_403(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/sessions")
    session_id = create_resp.json()["data"]["session_id"]

    # Request with invalid token
    headers = {"Authorization": "Bearer pp_sess_invalidtoken1234567890"}
    response = await client.get(f"/api/v1/sessions/{session_id}", headers=headers)
    assert response.status_code == 403
    payload = response.json()
    assert payload["errors"][0]["code"] == "SESSION_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_cross_session_token_rejected_with_403(client: AsyncClient) -> None:
    # Create two separate sessions
    resp_a = await client.post("/api/v1/sessions")
    resp_b = await client.post("/api/v1/sessions")

    session_a_id = resp_a.json()["data"]["session_id"]
    token_b = resp_b.json()["data"]["access_token"]

    # Attempt to access session A using token B
    headers = {"Authorization": f"Bearer {token_b}"}
    response = await client.get(f"/api/v1/sessions/{session_a_id}", headers=headers)
    assert response.status_code == 403
    assert response.json()["errors"][0]["code"] == "SESSION_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_update_session_metadata(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/sessions")
    data = create_resp.json()["data"]
    session_id = data["session_id"]
    token = data["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    patch_resp = await client.patch(
        f"/api/v1/sessions/{session_id}",
        json={"metadata_json": {"budget_minor": 50000, "category_preference": "Audio"}},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    meta = patch_resp.json()["data"]["metadata_json"]
    assert meta["budget_minor"] == 50000
    assert meta["category_preference"] == "Audio"


@pytest.mark.asyncio
async def test_end_session(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/sessions")
    data = create_resp.json()["data"]
    session_id = data["session_id"]
    token = data["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    end_resp = await client.post(f"/api/v1/sessions/{session_id}/end", headers=headers)
    assert end_resp.status_code == 200
    assert end_resp.json()["data"]["status"] == "completed"
