"""
Tests for Phase 15 PayPal Checkout Reliability & Session Recovery.

Tests:
1. HMAC recovery token generation, tampering detection, and expiry.
2. Embedding of recovery_token in PayPal return_url / approval_url.
3. Cross-browser / Incognito return resolution (session re-hydration from blank storage).
4. Tampered and mismatched recovery token rejection.
5. Re-reservation of expired stock for approved PayPal orders when stock is available.
6. Clean failure without PayPal capture when stock is exhausted.
7. Capture idempotency and repeat redirect resilience.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.order import Order
from app.models.payment import PaymentAttempt
from app.models.product import Product
from app.models.stock import StockReservation
from app.services.stock_service import StockService
from app.utils.security import (
    decode_recovery_token_signature,
    sign_recovery_token,
    verify_recovery_token,
)


@pytest.fixture
async def placed_order(client: AsyncClient) -> dict:
    """Helper fixture to create a valid confirmed order in mock payment mode."""
    # 1. Create session
    sess_resp = await client.post("/api/v1/sessions")
    sess_data = sess_resp.json()["data"]
    session_id = sess_data["session_id"]
    headers = {"Authorization": f"Bearer {sess_data['access_token']}"}

    # 2. Add product to cart
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
        "product_id": product["id"],
        "headers": headers,
    }


def test_hmac_recovery_token_crypto():
    """Verify HMAC recovery token signing, decoding, and tamper resistance."""
    settings = get_settings()
    order_id = str(uuid4())
    attempt_id = str(uuid4())
    session_id = str(uuid4())
    paypal_order_id = "TEST-PAYPAL-12345"

    token, expires_at = sign_recovery_token(
        secret_key=settings.app_secret_key,
        order_id=order_id,
        attempt_id=attempt_id,
        session_id=session_id,
        paypal_order_id=paypal_order_id,
        ttl_minutes=10,
    )

    # 1. Valid token verifies
    payload = verify_recovery_token(settings.app_secret_key, token)
    assert payload is not None
    assert payload["order_id"] == order_id
    assert payload["attempt_id"] == attempt_id
    assert payload["session_id"] == session_id
    assert payload["paypal_order_id"] == paypal_order_id
    assert payload["purpose"] == "paypal_return_recovery"

    # 2. Tampered signature is rejected
    tampered_sig_token = token[:-4] + "ffff"
    assert verify_recovery_token(settings.app_secret_key, tampered_sig_token) is None

    # 3. Tampered payload is rejected
    parts = token.split(".")
    tampered_payload_bytes = base64.urlsafe_b64encode(b'{"order_id":"hacked"}').decode("ascii")
    tampered_token = f"{tampered_payload_bytes}.{parts[1]}"
    assert verify_recovery_token(settings.app_secret_key, tampered_token) is None

    # 4. Expired token is rejected
    expired_token, _ = sign_recovery_token(
        secret_key=settings.app_secret_key,
        order_id=order_id,
        attempt_id=attempt_id,
        session_id=session_id,
        paypal_order_id=paypal_order_id,
        ttl_minutes=-5,  # 5 minutes in past
    )
    assert verify_recovery_token(settings.app_secret_key, expired_token) is None


@pytest.mark.asyncio
async def test_create_payment_embeds_recovery_token(
    client: AsyncClient, placed_order: dict
) -> None:
    """Verify payment attempt creates an approval URL containing recovery_token."""
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]

    approval_url = data["approval_url"]
    assert "recovery_token=" in approval_url

    # Extract recovery_token
    from urllib.parse import parse_qs, urlparse
    parsed = urlparse(approval_url)
    qs = parse_qs(parsed.fragment.split("?")[1] if "?" in parsed.fragment else parsed.query)
    assert "recovery_token" in qs
    rec_token = qs["recovery_token"][0]

    settings = get_settings()
    payload = verify_recovery_token(settings.app_secret_key, rec_token)
    assert payload is not None
    assert payload["order_id"] == order_id
    assert payload["session_id"] == placed_order["session_id"]


@pytest.mark.asyncio
async def test_resolve_return_from_blank_storage(
    client: AsyncClient, placed_order: dict
) -> None:
    """Verify an isolated browser window (empty storage) can resolve return and recover session."""
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # 1. Create payment attempt
    p_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    payment_data = p_resp.json()["data"]
    approval_url = payment_data["approval_url"]
    paypal_order_id = payment_data["paypal_order_id"]

    # Extract recovery token
    from urllib.parse import parse_qs, urlparse
    parsed = urlparse(approval_url)
    qs = parse_qs(parsed.fragment.split("?")[1] if "?" in parsed.fragment else parsed.query)
    rec_token = qs["recovery_token"][0]

    # 2. Call resolve-return with NO Authorization header (representing fresh/Incognito window)
    resolve_resp = await client.post(
        "/api/v1/payments/paypal/resolve-return",
        json={
            "recovery_token": rec_token,
            "paypal_order_id": paypal_order_id,
            "payer_id": "TEST_PAYER_123",
        },
    )
    assert resolve_resp.status_code == 200
    res_data = resolve_resp.json()["data"]

    assert res_data["session_id"] == placed_order["session_id"]
    new_token = res_data["access_token"]
    assert new_token.startswith("pp_sess_")
    assert res_data["order"]["id"] == order_id
    assert res_data["attempt"]["paypal_order_id"] == paypal_order_id

    # 3. Verify newly issued token has full access to the order
    order_resp = await client.get(
        f"/api/v1/orders/{order_id}",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert order_resp.status_code == 200
    assert order_resp.json()["data"]["id"] == order_id


@pytest.mark.asyncio
async def test_resolve_return_mismatched_paypal_id_fails(
    client: AsyncClient, placed_order: dict
) -> None:
    """Verify presenting an mismatched PayPal order ID is rejected."""
    order_id = placed_order["order"]["id"]
    p_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=placed_order["headers"])
    approval_url = p_resp.json()["data"]["approval_url"]

    from urllib.parse import parse_qs, urlparse
    parsed = urlparse(approval_url)
    qs = parse_qs(parsed.fragment.split("?")[1] if "?" in parsed.fragment else parsed.query)
    rec_token = qs["recovery_token"][0]

    resp = await client.post(
        "/api/v1/payments/paypal/resolve-return",
        json={
            "recovery_token": rec_token,
            "paypal_order_id": "MISMATCHED-PAYPAL-ID",
        },
    )
    assert resp.status_code in (400, 401, 404, 502)


@pytest.mark.asyncio
async def test_capture_re_reserves_expired_stock_when_available(
    client: AsyncClient, placed_order: dict, db_session: AsyncSession
) -> None:
    """Verify an approved order with an expired reservation atomically re-reserves stock and captures."""
    order_id = UUID(placed_order["order"]["id"])
    headers = placed_order["headers"]

    # 1. Create payment attempt & simulate approval
    p_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    attempt_id = p_resp.json()["data"]["attempt_id"]

    appr_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/approve",
        headers=headers,
    )
    assert appr_resp.status_code == 200

    # 2. Simulate expiration of the reservation by backdating stock_reserved_until & releasing hold
    await StockService.release_reservations_for_order(db_session, order_id)
    order_rec = await db_session.get(Order, order_id)
    order_rec.status = "cancelled"
    order_rec.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=10)
    await db_session.commit()

    # 3. Execute capture in demo/mock mode
    cap_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture",
        headers=headers,
    )
    assert cap_resp.status_code == 200
    cap_data = cap_resp.json()["data"]
    assert cap_data["status"] == "captured"

    # 4. Verify order is paid and reservation is committed
    refreshed_order = await db_session.get(Order, order_id)
    assert refreshed_order.status == "paid"

    res_stmt = select(StockReservation).where(StockReservation.order_id == order_id)
    reservations = (await db_session.execute(res_stmt)).scalars().all()
    committed = [r for r in reservations if r.status == "committed"]
    assert len(committed) >= 1


@pytest.mark.asyncio
async def test_capture_fails_safely_when_stock_exhausted(
    client: AsyncClient, placed_order: dict, db_session: AsyncSession
) -> None:
    """Verify that if stock was depleted while hold expired, capture fails without charging."""
    order_id = UUID(placed_order["order"]["id"])
    product_id = UUID(placed_order["product_id"])
    headers = placed_order["headers"]

    # 1. Create payment attempt & simulate approval
    p_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    attempt_id = p_resp.json()["data"]["attempt_id"]

    appr_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/approve",
        headers=headers,
    )
    assert appr_resp.status_code == 200

    # 2. Expire hold and deplete catalog stock to 0
    await StockService.release_reservations_for_order(db_session, order_id)
    order_rec = await db_session.get(Order, order_id)
    order_rec.status = "cancelled"
    order_rec.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=10)

    prod = await db_session.get(Product, product_id)
    prod.stock_qty = 0
    await db_session.commit()

    # 3. Execute capture: MUST fail with 409 / InsufficientStock
    cap_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture",
        headers=headers,
    )
    assert cap_resp.status_code in (400, 409)

    # 4. Verify order remains NOT paid
    refreshed_order = await db_session.get(Order, order_id)
    assert refreshed_order.status != "paid"


@pytest.mark.asyncio
async def test_capture_idempotency(
    client: AsyncClient, placed_order: dict
) -> None:
    """Verify multiple capture calls return the identical captured state without side-effects."""
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    p_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    attempt_id = p_resp.json()["data"]["attempt_id"]

    # First capture
    cap1 = await client.post(f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture", headers=headers)
    assert cap1.status_code == 200
    data1 = cap1.json()["data"]
    assert data1["status"] == "captured"

    # Second capture (idempotent)
    cap2 = await client.post(f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture", headers=headers)
    assert cap2.status_code == 200
    data2 = cap2.json()["data"]
    assert data2["status"] == "captured"
    assert data2["attempt_id"] == data1["attempt_id"]
