"""
Integration tests for Payment Attempt endpoints and retry state machine.

Tests idempotency keys, multi-attempt retries, capture idempotency,
stock reservation commit on capture, and webhook reconciliation.
"""

from __future__ import annotations

import logging

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.stock import StockReservation
from app.services.payment_service import PaymentService, clear_paypal_token_cache


@pytest.fixture
async def placed_order(client: AsyncClient) -> dict:
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
        "headers": headers,
    }


@pytest.mark.asyncio
async def test_create_payment_attempt_happy_path(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_test_123"},
    )
    assert resp.status_code == 200
    payment = resp.json()["data"]

    assert payment["attempt_number"] == 1
    assert payment["idempotency_key"] == "ik_test_123"
    assert payment["status"] == "created"
    assert payment["paypal_order_id"].startswith(("DEMO-PAYPAL-ORD-", "PAYPAL-ORD-"))
    assert payment.get("is_demo") is True
    assert "Demo payment" in payment.get("demo_notice", "")


@pytest.mark.asyncio
async def test_idempotency_key_replay_returns_same_attempt(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]
    ik = "ik_replay_test"

    resp1 = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": ik},
    )
    att1 = resp1.json()["data"]

    resp2 = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": ik},
    )
    att2 = resp2.json()["data"]

    assert att1["attempt_id"] == att2["attempt_id"]
    assert att1["paypal_order_id"] == att2["paypal_order_id"]
    assert att1["approval_url"] is not None
    assert att2["approval_url"] == att1["approval_url"]


@pytest.mark.asyncio
async def test_capture_payment_happy_path_commits_stock(
    client: AsyncClient, placed_order: dict, db_session: AsyncSession
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # 1. Create payment
    create_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    attempt_id = create_resp.json()["data"]["attempt_id"]

    # 2. Capture payment
    cap_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture",
        headers=headers,
    )
    assert cap_resp.status_code == 200
    capture_data = cap_resp.json()["data"]
    assert capture_data["status"] == "captured"
    assert capture_data["captured_at"] is not None

    # 3. Verify order status is paid
    order_resp = await client.get(f"/api/v1/orders/{order_id}", headers=headers)
    assert order_resp.json()["data"]["status"] == "paid"

    # 4. Verify stock reservation is now committed
    res_stmt = select(StockReservation).where(StockReservation.order_id == order_id)
    reservation = (await db_session.execute(res_stmt)).scalar_one()
    assert reservation.status == "committed"


@pytest.mark.asyncio
async def test_capture_idempotency(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    create_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    attempt_id = create_resp.json()["data"]["attempt_id"]

    # First capture
    cap1 = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture",
        headers=headers,
    )
    assert cap1.status_code == 200
    assert cap1.json()["data"]["status"] == "captured"

    # Second capture returns same result idempotently
    cap2 = await client.post(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture",
        headers=headers,
    )
    assert cap2.status_code == 200
    assert cap2.json()["data"]["status"] == "captured"


@pytest.mark.asyncio
async def test_retry_flow_after_capture_failure(
    client: AsyncClient, placed_order: dict, db_session: AsyncSession
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # 1. Attempt 1
    att1_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_att_1"},
    )
    att1_id = att1_resp.json()["data"]["attempt_id"]

    # Simulate capture failure
    await PaymentService.capture_payment_attempt(
        db=db_session,
        order_id=order_id,
        attempt_id=att1_id,
        simulated_failure_reason="CARD_DECLINED",
    )

    # Verify order transitioned to payment_failed
    order_stmt = select(Order).where(Order.id == order_id)
    order = (await db_session.execute(order_stmt)).scalar_one()
    assert order.status == "payment_failed"

    # 2. Reusing ik_att_1 should be rejected with IDEMPOTENCY_KEY_REUSED
    dup_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_att_1"},
    )
    assert dup_resp.status_code == 422
    assert dup_resp.json()["errors"][0]["code"] == "IDEMPOTENCY_KEY_REUSED"

    # 3. Create fresh attempt 2 with new idempotency key
    att2_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_att_2"},
    )
    assert att2_resp.status_code == 200
    att2_data = att2_resp.json()["data"]
    assert att2_data["attempt_number"] == 2
    att2_id = att2_data["attempt_id"]

    # 4. Attempt 2 captures successfully
    cap2 = await client.post(
        f"/api/v1/orders/{order_id}/payments/{att2_id}/capture",
        headers=headers,
    )
    assert cap2.status_code == 200
    assert cap2.json()["data"]["status"] == "captured"

    # Order is now paid
    order_after = (await db_session.execute(order_stmt)).scalar_one()
    assert order_after.status == "paid"


@pytest.mark.asyncio
async def test_active_payment_exists_rejected(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # Create attempt 1
    await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_active_1"},
    )

    # Trying to create attempt 2 while attempt 1 is still active
    resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_active_2"},
    )
    assert resp.status_code == 409
    assert resp.json()["errors"][0]["code"] == "ACTIVE_PAYMENT_EXISTS"


@pytest.mark.asyncio
async def test_create_payment_rejected_for_inactive_session(
    client: AsyncClient, placed_order: dict
) -> None:
    session_id = placed_order["session_id"]
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # End session
    end_resp = await client.post(f"/api/v1/sessions/{session_id}/end", headers=headers)
    assert end_resp.status_code == 200

    # Attempt to create payment on inactive session
    resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    assert resp.status_code == 403
    assert resp.json()["errors"][0]["code"] == "SESSION_INACTIVE"


@pytest.mark.asyncio
async def test_paypal_webhook_reconciliation(
    client: AsyncClient, placed_order: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # Create payment attempt
    create_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    paypal_order_id = create_resp.json()["data"]["paypal_order_id"]

    # Post simulated PayPal capture completed webhook with verified signature mock
    webhook_payload = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": paypal_order_id},
    }

    async def _mock_verify_signature(headers: dict, payload: dict) -> bool:
        return True

    monkeypatch.setattr(
        PaymentService, "verify_paypal_webhook_signature", _mock_verify_signature
    )

    wh_resp = await client.post(
        "/api/v1/webhooks/paypal",
        json=webhook_payload,
        headers={"paypal-transmission-id": "test-transmission-123"},
    )
    assert wh_resp.status_code == 200
    assert wh_resp.json()["status"] == "received"

    # Order should now be reconciled to paid (requires auth header)
    order_resp = await client.get(f"/api/v1/orders/{order_id}", headers=headers)
    assert order_resp.status_code == 200
    assert order_resp.json()["data"]["status"] == "paid"


@pytest.mark.asyncio
async def test_paypal_webhook_unconfigured_rejected_never_marks_order_paid(
    client: AsyncClient, placed_order: dict
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    create_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    paypal_order_id = create_resp.json()["data"]["paypal_order_id"]

    webhook_payload = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": paypal_order_id},
    }
    # Unconfigured credentials / webhook ID in test environment causes rejection
    wh_resp = await client.post("/api/v1/webhooks/paypal", json=webhook_payload)
    assert wh_resp.status_code == 400
    assert wh_resp.json()["errors"][0]["code"] in (
        "PAYPAL_WEBHOOK_NOT_CONFIGURED",
        "PAYPAL_WEBHOOK_INVALID",
    )

    # Order MUST remain payment_processing, NEVER marked paid from unverified webhook
    order_resp = await client.get(f"/api/v1/orders/{order_id}", headers=headers)
    assert order_resp.status_code == 200
    assert order_resp.json()["data"]["status"] != "paid"
    assert order_resp.json()["data"]["status"] == "payment_processing"


@pytest.mark.asyncio
async def test_paypal_webhook_invalid_signature_rejected_never_marks_order_paid(
    client: AsyncClient, placed_order: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    create_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers=headers,
    )
    paypal_order_id = create_resp.json()["data"]["paypal_order_id"]

    webhook_payload = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": paypal_order_id},
    }

    from app.utils.exceptions import PayPalWebhookInvalid

    async def _mock_fail_verify(headers: dict, payload: dict) -> bool:
        raise PayPalWebhookInvalid("Invalid transmission signature")

    monkeypatch.setattr(
        PaymentService, "verify_paypal_webhook_signature", _mock_fail_verify
    )

    wh_resp = await client.post(
        "/api/v1/webhooks/paypal",
        json=webhook_payload,
        headers={"paypal-transmission-sig": "fakesig"},
    )
    assert wh_resp.status_code == 400
    assert wh_resp.json()["errors"][0]["code"] == "PAYPAL_WEBHOOK_INVALID"

    # Order MUST remain payment_processing, NEVER marked paid from unverified webhook
    order_resp = await client.get(f"/api/v1/orders/{order_id}", headers=headers)
    assert order_resp.status_code == 200
    assert order_resp.json()["data"]["status"] != "paid"
    assert order_resp.json()["data"]["status"] == "payment_processing"


@pytest.mark.asyncio
async def test_paypal_oauth_token_caching(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_paypal_token_cache()

    class FakeSettings:
        paypal_client_id = "test-client-id"
        paypal_client_secret = "super-secret-paypal-key"
        paypal_base_url = "https://api-m.sandbox.paypal.com"
        paypal_mode = "sandbox"

    settings = FakeSettings()
    call_count = 0

    class MockResponse:
        status_code = 200

        def json(self):
            return {"access_token": "cached-access-token-12345", "expires_in": 3600}

    async def mock_post(url, headers, data):
        nonlocal call_count
        call_count += 1
        return MockResponse()

    import httpx

    monkeypatch.setattr(httpx.AsyncClient, "post", lambda self, url, **kwargs: mock_post(url, kwargs.get("headers"), kwargs.get("data")))

    # First call: makes HTTP request
    token1 = await PaymentService._get_paypal_access_token(settings)
    assert token1 == "cached-access-token-12345"
    assert call_count == 1

    # Second call: uses cache, no additional HTTP request
    token2 = await PaymentService._get_paypal_access_token(settings)
    assert token2 == "cached-access-token-12345"
    assert call_count == 1

    clear_paypal_token_cache()


@pytest.mark.asyncio
async def test_paypal_oauth_token_failure_safe_logging(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    clear_paypal_token_cache()

    secret = "DO-NOT-LEAK-THIS-SECRET-TOKEN"
    class FakeSettings:
        paypal_client_id = "test-client-id"
        paypal_client_secret = secret
        paypal_base_url = "https://api-m.sandbox.paypal.com"
        paypal_mode = "sandbox"

    settings = FakeSettings()

    class MockFailResponse:
        status_code = 401
        text = "Unauthorized credentials"

    import httpx

    async def mock_fail_post(url, **kwargs):
        return MockFailResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", lambda self, url, **kwargs: mock_fail_post(url, **kwargs))

    with caplog.at_level(logging.ERROR):
        token = await PaymentService._get_paypal_access_token(settings)
        assert token is None

    # Check logs: must log failure but NEVER leak the client_secret
    assert secret not in caplog.text
    assert "PayPal OAuth token request failed with status HTTP 401" in caplog.text

    clear_paypal_token_cache()


@pytest.mark.asyncio
async def test_demo_mode_does_not_call_paypal_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """In mock/demo mode, _get_paypal_access_token must return None without contacting PayPal."""
    clear_paypal_token_cache()
    network_called = False

    class DemoSettings:
        paypal_client_id = "placeholder-id"
        paypal_client_secret = "placeholder-secret"
        paypal_base_url = "https://api-m.sandbox.paypal.com"
        paypal_mode = "mock"

    settings = DemoSettings()

    async def fake_post(*args, **kwargs):
        nonlocal network_called
        network_called = True
        raise RuntimeError("PayPal network call attempted in demo mode!")

    import httpx
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    token = await PaymentService._get_paypal_access_token(settings)
    assert token is None
    assert network_called is False
    assert PaymentService.is_demo_mode(settings) is True


@pytest.mark.asyncio
async def test_demo_buyer_approval_simulation(
    client: AsyncClient, placed_order: dict
) -> None:
    """Buyer approval in demo mode transitions attempt to 'approved' with simulated payer ID."""
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # 1. Create attempt
    c_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    att_id = c_resp.json()["data"]["attempt_id"]

    # 2. Simulate buyer approval
    appr_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{att_id}/approve",
        headers=headers,
    )
    assert appr_resp.status_code == 200
    appr_data = appr_resp.json()["data"]
    assert appr_data["status"] == "approved"
    assert appr_data["paypal_payer_id"].startswith("DEMO-PAYER-")
    assert appr_data["is_demo"] is True
    assert "Demo payment" in appr_data["demo_notice"]

    # 3. Capture succeeds from approved status
    cap_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{att_id}/capture",
        headers=headers,
    )
    assert cap_resp.status_code == 200
    assert cap_resp.json()["data"]["status"] == "captured"


@pytest.mark.asyncio
async def test_demo_capture_simulated_failure_and_retry_flow(
    client: AsyncClient, placed_order: dict, db_session: AsyncSession
) -> None:
    """Simulating capture failure in demo mode marks attempt failed and allows retry."""
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # 1. Create attempt 1
    c1 = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_demo_fail_1"},
    )
    att1_id = c1.json()["data"]["attempt_id"]

    # 2. Capture with simulated failure
    fail_resp = await client.post(
        f"/api/v1/orders/{order_id}/payments/{att1_id}/capture",
        json={"simulate_failure": True, "failure_reason": "SIMULATED_INSUFFICIENT_FUNDS"},
        headers=headers,
    )
    assert fail_resp.status_code == 200
    fail_data = fail_resp.json()["data"]
    assert fail_data["status"] == "capture_failed"
    assert fail_data["failure_reason"] == "SIMULATED_INSUFFICIENT_FUNDS"
    assert fail_data["is_demo"] is True

    # 3. Verify order transitioned to payment_failed
    order_stmt = select(Order).where(Order.id == order_id)
    order = (await db_session.execute(order_stmt)).scalar_one()
    assert order.status == "payment_failed"

    # 4. Attempt 2 retries and captures successfully
    c2 = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": "ik_demo_retry_2"},
    )
    att2_id = c2.json()["data"]["attempt_id"]
    assert c2.json()["data"]["attempt_number"] == 2

    cap2 = await client.post(
        f"/api/v1/orders/{order_id}/payments/{att2_id}/capture",
        headers=headers,
    )
    assert cap2.status_code == 200
    assert cap2.json()["data"]["status"] == "captured"


@pytest.mark.asyncio
async def test_demo_repeated_capture_idempotent(
    client: AsyncClient, placed_order: dict
) -> None:
    """Repeated capture of an already captured attempt returns captured status without re-committing."""
    order_id = placed_order["order"]["id"]
    headers = placed_order["headers"]

    # 1. Create & capture
    c_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    att_id = c_resp.json()["data"]["attempt_id"]

    cap1 = await client.post(f"/api/v1/orders/{order_id}/payments/{att_id}/capture", headers=headers)
    assert cap1.status_code == 200
    data1 = cap1.json()["data"]
    assert data1["status"] == "captured"
    captured_time = data1["captured_at"]

    # 2. Repeated capture call returns same captured result idempotently
    cap2 = await client.post(f"/api/v1/orders/{order_id}/payments/{att_id}/capture", headers=headers)
    assert cap2.status_code == 200
    data2 = cap2.json()["data"]
    assert data2["status"] == "captured"
    assert data2["captured_at"] == captured_time


@pytest.mark.asyncio
async def test_demo_order_receipt_and_history_shows_demo_notice(
    client: AsyncClient, placed_order: dict
) -> None:
    """Order detail and session order list include demo notice and demo flags."""
    order_id = placed_order["order"]["id"]
    session_id = placed_order["session_id"]
    headers = placed_order["headers"]

    # Capture payment
    c_resp = await client.post(f"/api/v1/orders/{order_id}/payments", headers=headers)
    att_id = c_resp.json()["data"]["attempt_id"]
    await client.post(f"/api/v1/orders/{order_id}/payments/{att_id}/capture", headers=headers)

    # Check GET /orders/{order_id}
    ord_resp = await client.get(f"/api/v1/orders/{order_id}", headers=headers)
    ord_data = ord_resp.json()["data"]
    assert ord_data["is_demo_payment"] is True
    assert "Demo payment" in ord_data["demo_notice"]

    # Check GET /sessions/{session_id}/orders
    sess_ord_resp = await client.get(f"/api/v1/sessions/{session_id}/orders", headers=headers)
    sess_orders = sess_ord_resp.json()["data"]
    assert len(sess_orders) >= 1
    assert sess_orders[0]["is_demo_payment"] is True
    assert "Demo payment" in sess_orders[0]["demo_notice"]
