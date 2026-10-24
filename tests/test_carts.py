"""
Integration tests for Shopping Cart endpoints.

Tests cart viewing, adding items, stock constraints, quantity updates, item removal,
cart clearing, version incrementing, and token authorization.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_view_empty_cart(client: AsyncClient, active_session: dict) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    resp = await client.get(f"/api/v1/sessions/{session_id}/cart", headers=headers)
    assert resp.status_code == 200
    cart = resp.json()["data"]

    assert cart["session_id"] == session_id
    assert cart["version"] == 1
    assert cart["items"] == []
    assert cart["subtotal_minor"] == 0
    assert cart["item_count"] == 0


@pytest.mark.asyncio
async def test_add_item_to_cart_and_version_increments(
    client: AsyncClient, active_session: dict, sample_product: dict
) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]
    product_id = sample_product["id"]
    unit_price = sample_product["price_minor"]

    # 1. Add item
    add_resp = await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product_id, "quantity": 2},
        headers=headers,
    )
    assert add_resp.status_code == 200
    cart = add_resp.json()["data"]

    assert cart["version"] == 2  # Incremented from 1
    assert cart["item_count"] == 2
    assert len(cart["items"]) == 1
    item = cart["items"][0]
    assert item["product_id"] == product_id
    assert item["quantity"] == 2
    assert item["unit_price_minor"] == unit_price
    assert item["line_total_minor"] == 2 * unit_price
    assert cart["subtotal_minor"] == 2 * unit_price


@pytest.mark.asyncio
async def test_add_item_insufficient_stock_fails(
    client: AsyncClient, active_session: dict, sample_product: dict
) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]
    product_id = sample_product["id"]

    # Request more than available stock
    huge_qty = 99
    # sample products have stock 6..50
    resp = await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product_id, "quantity": huge_qty},
        headers=headers,
    )
    # If huge_qty > stock_qty, it should fail with 409
    if sample_product["stock_qty"] < huge_qty:
        assert resp.status_code == 409
        assert resp.json()["errors"][0]["code"] == "INSUFFICIENT_STOCK"


@pytest.mark.asyncio
async def test_update_item_quantity(
    client: AsyncClient, active_session: dict, sample_product: dict
) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]
    product_id = sample_product["id"]

    # Add 1
    add_resp = await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product_id, "quantity": 1},
        headers=headers,
    )
    item_id = add_resp.json()["data"]["items"][0]["id"]
    ver_after_add = add_resp.json()["data"]["version"]

    # Update to 3
    patch_resp = await client.patch(
        f"/api/v1/sessions/{session_id}/cart/items/{item_id}",
        json={"quantity": 3},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    cart = patch_resp.json()["data"]
    assert cart["version"] == ver_after_add + 1
    assert cart["item_count"] == 3
    assert cart["items"][0]["quantity"] == 3


@pytest.mark.asyncio
async def test_remove_item(
    client: AsyncClient, active_session: dict, sample_product: dict
) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]
    product_id = sample_product["id"]

    add_resp = await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product_id, "quantity": 1},
        headers=headers,
    )
    item_id = add_resp.json()["data"]["items"][0]["id"]

    del_resp = await client.delete(
        f"/api/v1/sessions/{session_id}/cart/items/{item_id}",
        headers=headers,
    )
    assert del_resp.status_code == 200
    cart = del_resp.json()["data"]
    assert cart["items"] == []
    assert cart["item_count"] == 0


@pytest.mark.asyncio
async def test_clear_cart(
    client: AsyncClient, active_session: dict, sample_product: dict
) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]
    product_id = sample_product["id"]

    await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product_id, "quantity": 2},
        headers=headers,
    )

    clear_resp = await client.delete(
        f"/api/v1/sessions/{session_id}/cart",
        headers=headers,
    )
    assert clear_resp.status_code == 200
    cart = clear_resp.json()["data"]
    assert cart["items"] == []
    assert cart["subtotal_minor"] == 0


@pytest.mark.asyncio
async def test_cart_requires_token_auth(
    client: AsyncClient, active_session: dict
) -> None:
    session_id = active_session["session_id"]

    # No token
    resp = await client.get(f"/api/v1/sessions/{session_id}/cart")
    assert resp.status_code == 401
    assert resp.json()["errors"][0]["code"] == "SESSION_TOKEN_MISSING"

    # Bad token
    bad_resp = await client.get(
        f"/api/v1/sessions/{session_id}/cart",
        headers={"Authorization": "Bearer badtoken"},
    )
    assert bad_resp.status_code == 403
    assert bad_resp.json()["errors"][0]["code"] == "SESSION_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_cart_rejected_for_inactive_session(
    client: AsyncClient, active_session: dict, sample_product: dict
) -> None:
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    # End session
    end_resp = await client.post(f"/api/v1/sessions/{session_id}/end", headers=headers)
    assert end_resp.status_code == 200

    # GET /cart should be rejected
    get_resp = await client.get(f"/api/v1/sessions/{session_id}/cart", headers=headers)
    assert get_resp.status_code == 403
    assert get_resp.json()["errors"][0]["code"] == "SESSION_INACTIVE"

    # POST /cart/items should be rejected
    add_resp = await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": sample_product["id"], "quantity": 1},
        headers=headers,
    )
    assert add_resp.status_code == 403
    assert add_resp.json()["errors"][0]["code"] == "SESSION_INACTIVE"
