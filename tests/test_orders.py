"""
Integration tests for Order endpoints.

Tests listing session orders, fetching order detail with bearer token ownership,
and access control validation (401, 403, 404).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.fixture
async def placed_order(client: AsyncClient) -> dict:
    # 1. Create session
    sess_resp = await client.post("/api/v1/sessions")
    sess_data = sess_resp.json()["data"]
    session_id = sess_data["session_id"]
    headers = {"Authorization": f"Bearer {sess_data['access_token']}"}

    # 2. Get product & add to cart
    prod_resp = await client.get("/api/v1/products?page_size=1")
    product = prod_resp.json()["data"]["items"][0]
    await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product["id"], "quantity": 1},
        headers=headers,
    )

    # 3. Preview & confirm
    prev_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    token = prev_resp.json()["data"]["preview_token"]

    conf_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": token},
        headers=headers,
    )
    order = conf_resp.json()["data"]
    return {
        "order": order,
        "session_id": session_id,
        "headers": headers,
    }


@pytest.mark.asyncio
async def test_list_session_orders(client: AsyncClient, placed_order: dict) -> None:
    session_id = placed_order["session_id"]
    headers = placed_order["headers"]
    expected_order_id = placed_order["order"]["id"]

    resp = await client.get(f"/api/v1/sessions/{session_id}/orders", headers=headers)
    assert resp.status_code == 200
    orders = resp.json()["data"]
    assert len(orders) >= 1
    assert any(o["id"] == expected_order_id for o in orders)


@pytest.mark.asyncio
async def test_get_order_detail(client: AsyncClient, placed_order: dict) -> None:
    expected_order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    resp = await client.get(f"/api/v1/orders/{expected_order_id}", headers=headers)
    assert resp.status_code == 200
    order = resp.json()["data"]
    assert order["id"] == expected_order_id
    assert order["status"] == "pending_payment"
    assert len(order["items"]) == 1


@pytest.mark.asyncio
async def test_get_order_detail_missing_token_returns_401(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    resp = await client.get(f"/api/v1/orders/{order_id}")
    assert resp.status_code == 401
    assert resp.json()["errors"][0]["code"] == "SESSION_TOKEN_MISSING"


@pytest.mark.asyncio
async def test_get_order_detail_invalid_token_returns_403(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    bad_headers = {"Authorization": "Bearer pp_sess_invalidfake1234567890"}
    resp = await client.get(f"/api/v1/orders/{order_id}", headers=bad_headers)
    assert resp.status_code == 403
    assert resp.json()["errors"][0]["code"] == "SESSION_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_get_order_detail_cross_session_forbidden(
    client: AsyncClient, placed_order: dict
) -> None:
    # Create a second, unrelated session
    other_sess = await client.post("/api/v1/sessions")
    other_token = other_sess.json()["data"]["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Attempt to read placed_order using other session's token
    order_id = placed_order["order"]["id"]
    resp = await client.get(f"/api/v1/orders/{order_id}", headers=other_headers)
    assert resp.status_code == 403
    assert resp.json()["errors"][0]["code"] == "SESSION_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_get_order_detail_not_found(client: AsyncClient, placed_order: dict) -> None:
    headers = placed_order["headers"]
    resp = await client.get("/api/v1/orders/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["errors"][0]["code"] == "ORDER_NOT_FOUND"
