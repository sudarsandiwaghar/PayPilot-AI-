"""
Tests for security utilities: session token generation and HMAC preview tokens.
"""

from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.utils.logging import SecretFilter
from app.utils.security import (
    generate_session_token,
    hash_token,
    sign_preview_token,
    verify_preview_token,
    verify_token,
)


def test_session_token_format_and_hashing() -> None:
    token = generate_session_token()
    assert token.startswith("pp_sess_")
    assert len(token) > 20

    h1 = hash_token(token)
    h2 = hash_token(token)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex length
    assert verify_token(token, h1) is True
    assert verify_token("invalid_token", h1) is False


def test_preview_token_signing_and_verification() -> None:
    secret = "test-secret-key-at-least-16-bytes"
    session_id = "11111111-1111-1111-1111-111111111111"
    cart_version = 1
    items = [{"product_id": "p1", "quantity": 2, "price_minor": 1500}]
    currency = "USD"

    token, expires_at = sign_preview_token(
        secret_key=secret,
        session_id=session_id,
        cart_version=cart_version,
        item_fingerprint=items,
        currency=currency,
        ttl_minutes=10,
    )

    payload = verify_preview_token(secret, token)
    assert payload is not None
    assert payload["session_id"] == session_id
    assert payload["cart_version"] == 1
    assert payload["currency"] == "USD"
    assert len(payload["items"]) == 1


def test_preview_token_tampering_rejected() -> None:
    secret = "test-secret-key-at-least-16-bytes"
    token, _ = sign_preview_token(
        secret_key=secret,
        session_id="session-1",
        cart_version=1,
        item_fingerprint=[],
        currency="USD",
        ttl_minutes=10,
    )

    # Tamper with token
    tampered = token[:-2] + "ab"
    assert verify_preview_token(secret, tampered) is None

    # Wrong secret key
    assert verify_preview_token("different-secret-key-here", token) is None


def test_preview_token_expired() -> None:
    secret = "test-secret-key-at-least-16-bytes"
    # Negative TTL to simulate already expired
    token, _ = sign_preview_token(
        secret_key=secret,
        session_id="session-1",
        cart_version=1,
        item_fingerprint=[],
        currency="USD",
        ttl_minutes=-1,
    )
    assert verify_preview_token(secret, token) is None


def test_production_startup_rejected_when_secret_key_is_default() -> None:
    # 1. Default secret key in production raises ValidationError
    with pytest.raises(ValidationError) as exc_info:
        Settings(app_env="production", app_secret_key="change-me-in-production")
    assert "APP_SECRET_KEY" in str(exc_info.value)

    # 2. Key containing change-me in production raises ValidationError
    with pytest.raises(ValidationError) as exc_info:
        Settings(app_env="production", app_secret_key="my-change-me-key-12345")
    assert "APP_SECRET_KEY" in str(exc_info.value)

    # 3. Valid secure secret key in production succeeds with non-mock paypal_mode
    prod_settings = Settings(
        app_env="production",
        app_secret_key="super-secret-unique-production-key-9999",
        paypal_mode="live",
    )
    assert prod_settings.app_env == "production"
    assert prod_settings.app_secret_key == "super-secret-unique-production-key-9999"
    assert prod_settings.paypal_mode == "live"

    # 4. Development environment still permits default key for easy local setup
    dev_settings = Settings(
        app_env="development",
        app_secret_key="change-me-in-production",
    )
    assert dev_settings.app_env == "development"


def test_create_app_rejects_production_with_default_secret_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import main

    class MockInsecureProdSettings:
        app_env = "production"
        app_secret_key = "change-me-in-production"
        app_debug = False
        cors_origins = ["http://localhost:3000"]

    monkeypatch.setattr(main, "get_settings", lambda: MockInsecureProdSettings())

    with pytest.raises(RuntimeError) as exc_info:
        create_app()
    assert "APP_SECRET_KEY is unset or using a development default" in str(exc_info.value)


def test_constant_time_token_hash_verification() -> None:
    from app.utils.security import verify_token_hash

    raw_token = generate_session_token()
    token_h = hash_token(raw_token)

    # Valid matches
    assert verify_token(raw_token, token_h) is True
    assert verify_token_hash(token_h, token_h) is True

    # Invalid / mismatched
    assert verify_token("wrong-token", token_h) is False
    assert verify_token(raw_token, hash_token("other-token")) is False
    assert verify_token_hash(token_h, hash_token("other-token")) is False

    # Non-string / None inputs safely return False
    assert verify_token(None, token_h) is False
    assert verify_token(raw_token, None) is False
    assert verify_token(None, None) is False
    assert verify_token(12345, token_h) is False  # type: ignore[arg-type]
    assert verify_token(raw_token, 67890) is False  # type: ignore[arg-type]

    assert verify_token_hash(None, token_h) is False
    assert verify_token_hash(token_h, None) is False
    assert verify_token_hash(None, None) is False
    assert verify_token_hash(123, token_h) is False  # type: ignore[arg-type]


def test_production_startup_rejected_when_paypal_mode_is_mock_or_demo() -> None:
    """Regression test: Reject startup when APP_ENV=production and PAYPAL_MODE is mock or demo."""
    # 1. Pydantic Settings validator rejects mock/demo in production
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            app_env="production",
            app_secret_key="secure-production-secret-key-12345",
            paypal_mode="mock",
        )
    assert "PAYPAL_MODE cannot be 'mock' or 'demo'" in str(exc_info.value)

    with pytest.raises(ValidationError) as exc_info:
        Settings(
            app_env="production",
            app_secret_key="secure-production-secret-key-12345",
            paypal_mode="demo",
        )
    assert "PAYPAL_MODE cannot be 'mock' or 'demo'" in str(exc_info.value)

    # 2. create_app() runtime startup check rejects mock in production
    from app import main

    class MockProdSettingsWithMockPayPal:
        app_env = "production"
        app_secret_key = "secure-production-secret-key-12345"
        paypal_mode = "mock"
        app_debug = False
        cors_origins = ["http://localhost:3000"]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(main, "get_settings", lambda: MockProdSettingsWithMockPayPal())
    try:
        with pytest.raises(RuntimeError) as exc_info:
            create_app()
        assert "PAYPAL_MODE cannot be 'mock' or 'demo' in production" in str(exc_info.value)
    finally:
        monkeypatch.undo()


@pytest.mark.asyncio
async def test_sandbox_and_live_mode_never_falls_back_to_mock(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression test: sandbox or live PayPal failures must never silently fall back to mock mode."""
    import uuid

    from app.models.order import Order
    from app.services.payment_service import PaymentService
    from app.utils.exceptions import PaymentCaptureFailed

    # 1. Fake settings with paypal_mode='sandbox' but missing credentials
    class SandboxSettings:
        app_env = "development"
        paypal_mode = "sandbox"
        paypal_client_id = ""
        paypal_client_secret = ""
        paypal_base_url = "https://api-m.sandbox.paypal.com"

    s = SandboxSettings()
    assert PaymentService.is_demo_mode(s) is False

    # 2. Attempting to create order in sandbox mode without access token must raise PaymentCaptureFailed
    # and NEVER return a synthetic DEMO- order ID
    dummy_order = Order(
        id=uuid.uuid4(),
        order_number="ORD-TEST-123",
        status="pending_payment",
        total_minor=5000,
        currency="USD",
        confirmed_by_shopper=True,
    )
    dummy_order.payment_attempts = []

    class MockAsyncSession:
        def add(self, item): pass
        async def commit(self): pass
        async def refresh(self, item): pass
        async def execute(self, stmt):
            class ScalarResult:
                def scalar_one_or_none(self):
                    if "payment_attempts" in str(stmt) and "idempotency_key" in str(stmt):
                        return None
                    return dummy_order

                def scalars(self):
                    class ScalList:
                        def all(self): return []
                    return ScalList()
            return ScalarResult()

    async def fake_expire(*args, **kwargs): return False
    monkeypatch.setattr("app.services.stock_service.StockService.expire_order_reservations_if_overdue", fake_expire)

    monkeypatch.setattr("app.services.payment_service.get_settings", lambda: s)
    mock_db = MockAsyncSession()

    with pytest.raises(PaymentCaptureFailed) as exc_info:
        await PaymentService.create_payment_attempt(
            db=mock_db,  # type: ignore[arg-type]
            order_id=dummy_order.id,
            idempotency_key="ik_test_no_fallback",
        )
    assert "PayPal OAuth authentication failed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_mock_payment_capture_never_marks_order_paid_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression test: Mock payment capture must never mark an order as paid in production."""
    import uuid

    from app.models.order import Order
    from app.models.payment import PaymentAttempt
    from app.services.payment_service import PaymentService
    from app.utils.exceptions import PaymentCaptureFailed

    class ProductionMockSettings:
        app_env = "production"
        paypal_mode = "mock"

    prod_settings = ProductionMockSettings()

    dummy_order = Order(
        id=uuid.uuid4(),
        order_number="ORD-PROD-TEST",
        status="payment_processing",
        total_minor=5000,
        currency="USD",
        confirmed_by_shopper=True,
    )
    dummy_attempt = PaymentAttempt(
        id=uuid.uuid4(),
        order_id=dummy_order.id,
        attempt_number=1,
        idempotency_key="ik_prod_mock_capture",
        paypal_order_id="DEMO-PAYPAL-ORD-TEST",
        status="approved",
        amount_minor=5000,
        currency="USD",
    )
    dummy_attempt.order = dummy_order

    class MockAsyncSession:
        def add(self, item): pass
        async def commit(self): pass
        async def refresh(self, item): pass
        async def execute(self, stmt):
            class ScalarResult:
                def scalar_one_or_none(self):
                    return dummy_attempt
            return ScalarResult()

    monkeypatch.setattr("app.services.payment_service.get_settings", lambda: prod_settings)
    mock_db = MockAsyncSession()

    with pytest.raises(PaymentCaptureFailed) as exc_info:
        await PaymentService.capture_payment_attempt(
            db=mock_db,  # type: ignore[arg-type]
            order_id=dummy_order.id,
            attempt_id=dummy_attempt.id,
        )

    assert "Mock payment captures are strictly forbidden in production" in str(exc_info.value)
    assert dummy_order.status == "payment_failed"
    assert dummy_order.status != "paid"
    assert dummy_attempt.status == "capture_failed"


def test_secret_filter_scrubs_sensitive_values() -> None:
    """SecretFilter must scrub PayPal client secrets, bearer tokens, passwords, and API keys."""
    sf = SecretFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="Error with paypal_client_secret=supersecret123 and api_key=gemini-key-xyz and password=mypassword",
        args=(),
        exc_info=None,
    )
    sf.filter(record)
    assert "supersecret123" not in record.msg
    assert "gemini-key-xyz" not in record.msg
    assert "mypassword" not in record.msg
    assert "***REDACTED***" in record.msg

