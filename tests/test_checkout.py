"""
Integration tests for Checkout workflow: preview and confirm.

Tests token binding to cart version, server-side price revalidation,
stock decrementing, failure rejection modes, expired token distinction,
and pricing integrity.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.product import Product
from app.models.stock import StockReservation
from app.utils.security import sign_preview_token


@pytest.fixture
async def session_with_item(client: AsyncClient) -> dict:
    # 1. Create session
    sess_resp = await client.post("/api/v1/sessions")
    sess_data = sess_resp.json()["data"]
    session_id = sess_data["session_id"]
    headers = {"Authorization": f"Bearer {sess_data['access_token']}"}

    # 2. Get a product
    prod_resp = await client.get("/api/v1/products?page_size=1")
    product = prod_resp.json()["data"]["items"][0]

    # 3. Add to cart
    await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product["id"], "quantity": 2},
        headers=headers,
    )

    return {
        "session_id": session_id,
        "headers": headers,
        "product": product,
    }


@pytest.mark.asyncio
async def test_checkout_preview_empty_cart_fails(client: AsyncClient) -> None:
    sess_resp = await client.post("/api/v1/sessions")
    data = sess_resp.json()["data"]
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    resp = await client.post(
        f"/api/v1/sessions/{data['session_id']}/checkout/preview",
        headers=headers,
    )
    assert resp.status_code == 422
    assert resp.json()["errors"][0]["code"] == "CART_EMPTY"


@pytest.mark.asyncio
async def test_checkout_preview_success(
    client: AsyncClient, session_with_item: dict
) -> None:
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]
    product = session_with_item["product"]

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    assert resp.status_code == 200
    preview = resp.json()["data"]

    assert "preview_token" in preview
    assert preview["subtotal_minor"] == 2 * product["price_minor"]
    assert preview["total_minor"] == preview["subtotal_minor"]
    assert preview["cart_version"] >= 2
    assert len(preview["order_summary"]) == 1


@pytest.mark.asyncio
async def test_checkout_confirm_happy_path(
    client: AsyncClient, session_with_item: dict, db_session: AsyncSession
) -> None:
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]
    product = session_with_item["product"]
    initial_stock = product["stock_qty"]

    # 1. Preview
    preview_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    preview_token = preview_resp.json()["data"]["preview_token"]

    # 2. Confirm
    confirm_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": preview_token},
        headers=headers,
    )
    assert confirm_resp.status_code == 200
    order = confirm_resp.json()["data"]

    assert order["status"] == "pending_payment"
    assert order["confirmed_by_shopper"] is True
    assert order["order_number"].startswith("PP-")
    assert order["total_minor"] == 2 * product["price_minor"]
    assert len(order["items"]) == 1
    assert order["stock_reserved_until"] is not None

    # 3. Verify cart is now empty
    cart_resp = await client.get(f"/api/v1/sessions/{session_id}/cart", headers=headers)
    assert cart_resp.json()["data"]["items"] == []

    # 4. Verify stock was held (decremented by 2)
    prod_stmt = select(Product).where(Product.id == product["id"])
    refreshed_prod = (await db_session.execute(prod_stmt)).scalar_one()
    assert refreshed_prod.stock_qty == initial_stock - 2

    # 5. Verify stock reservation row created
    res_stmt = select(StockReservation).where(StockReservation.order_id == order["id"])
    reservation = (await db_session.execute(res_stmt)).scalar_one()
    assert reservation.quantity == 2
    assert reservation.status == "held"


@pytest.mark.asyncio
async def test_confirm_uses_validated_preview_price_not_stale_cart_price(
    client: AsyncClient, session_with_item: dict, db_session: AsyncSession
) -> None:
    """Ensure order total and line items use the price approved in the preview, not stale cart price."""
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]
    product = session_with_item["product"]
    old_price = product["price_minor"]
    new_price = old_price + 2500  # Price increased after item added to cart

    # 1. Update product price in catalog
    await db_session.execute(
        update(Product)
        .where(Product.id == product["id"])
        .values(price_minor=new_price)
    )
    await db_session.commit()

    # 2. Generate checkout preview (reflects new price)
    preview_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    assert preview_resp.status_code == 200
    preview_data = preview_resp.json()["data"]
    assert preview_data["subtotal_minor"] == 2 * new_price
    assert len(preview_data["price_changes"]) == 1
    assert preview_data["price_changes"][0]["old_price_minor"] == old_price
    assert preview_data["price_changes"][0]["new_price_minor"] == new_price

    preview_token = preview_data["preview_token"]

    # 3. Confirm checkout
    confirm_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": preview_token},
        headers=headers,
    )
    assert confirm_resp.status_code == 200
    order = confirm_resp.json()["data"]

    # Must be persisted with the approved preview price, NOT the stale cart price
    assert order["total_minor"] == 2 * new_price
    assert order["items"][0]["unit_price_minor"] == new_price
    assert order["items"][0]["line_total_minor"] == 2 * new_price


@pytest.mark.asyncio
async def test_confirm_rejects_cart_modified(
    client: AsyncClient, session_with_item: dict
) -> None:
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]
    product = session_with_item["product"]

    # 1. Preview
    preview_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    preview_token = preview_resp.json()["data"]["preview_token"]

    # 2. Modify cart after preview (add 1 more quantity)
    await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": product["id"], "quantity": 1},
        headers=headers,
    )

    # 3. Confirm with stale preview token
    confirm_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": preview_token},
        headers=headers,
    )
    assert confirm_resp.status_code == 409
    assert confirm_resp.json()["errors"][0]["code"] == "CART_MODIFIED"


@pytest.mark.asyncio
async def test_confirm_rejects_price_changed(
    client: AsyncClient, session_with_item: dict, db_session: AsyncSession
) -> None:
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]
    product = session_with_item["product"]

    # 1. Preview
    preview_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    preview_token = preview_resp.json()["data"]["preview_token"]

    # 2. Live price changes behind the scenes after preview
    await db_session.execute(
        update(Product)
        .where(Product.id == product["id"])
        .values(price_minor=product["price_minor"] + 5000)
    )
    await db_session.commit()

    # 3. Confirm should be rejected because price changed
    confirm_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": preview_token},
        headers=headers,
    )
    assert confirm_resp.status_code == 409
    assert confirm_resp.json()["errors"][0]["code"] == "PRICE_CHANGED"


@pytest.mark.asyncio
async def test_confirm_rejects_invalid_preview_token(
    client: AsyncClient, session_with_item: dict
) -> None:
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]

    confirm_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": "forged.signature1234"},
        headers=headers,
    )
    assert confirm_resp.status_code == 400
    assert confirm_resp.json()["errors"][0]["code"] == "PREVIEW_INVALID"


@pytest.mark.asyncio
async def test_confirm_rejects_expired_preview_token(
    client: AsyncClient, session_with_item: dict
) -> None:
    """Distinguish expired token from invalid token (HTTP 410 vs 400)."""
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]
    product = session_with_item["product"]
    settings = get_settings()

    # Create signed preview token that is already expired (negative TTL)
    expired_token, _ = sign_preview_token(
        secret_key=settings.app_secret_key,
        session_id=str(session_id),
        cart_version=2,
        item_fingerprint=[{"product_id": str(product["id"]), "quantity": 2, "price_minor": product["price_minor"]}],
        currency="USD",
        ttl_minutes=-5,
    )

    confirm_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        json={"preview_token": expired_token},
        headers=headers,
    )
    assert confirm_resp.status_code == 410
    assert confirm_resp.json()["errors"][0]["code"] == "PREVIEW_EXPIRED"


@pytest.mark.asyncio
async def test_checkout_rejected_for_inactive_session(
    client: AsyncClient, session_with_item: dict
) -> None:
    session_id = session_with_item["session_id"]
    headers = session_with_item["headers"]

    # End the session
    end_resp = await client.post(f"/api/v1/sessions/{session_id}/end", headers=headers)
    assert end_resp.status_code == 200

    # Attempts to preview or confirm on completed session must be rejected with 403 SESSION_INACTIVE
    prev_resp = await client.post(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        headers=headers,
    )
    assert prev_resp.status_code == 403
    assert prev_resp.json()["errors"][0]["code"] == "SESSION_INACTIVE"
