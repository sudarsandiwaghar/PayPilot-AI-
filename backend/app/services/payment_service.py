"""
Payment service.

Manages the payment attempt lifecycle for orders:
- Idempotent PayPal order creation.
- Multiple attempts per order on payment failure.
- Stock hold verification before creating attempts.
- Committing stock reservations upon successful capture.
- PayPal REST API v2 communication and webhook reconciliation.
"""

from __future__ import annotations

import base64
import logging
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.order import Order
from app.models.payment import PaymentAttempt
from app.services.stock_service import StockService
from app.utils.exceptions import (
    ActivePaymentExists,
    IdempotencyKeyReused,
    InsufficientStock,
    OrderNotConfirmed,
    OrderNotFound,
    PaymentAttemptNotFound,
    PaymentCaptureFailed,
    PayPalWebhookInvalid,
    PayPalWebhookNotConfigured,
    StockReservationExpired,
)
from app.utils.security import (
    generate_session_token,
    hash_token,
    sign_recovery_token,
    verify_recovery_token,
)

logger = logging.getLogger("paypilot.payment_service")
TERMINAL_STATES = {"captured", "capture_failed", "cancelled", "expired"}

# In-memory OAuth token cache: (base_url, client_id) -> (access_token, expiry_monotonic)
_paypal_token_cache: dict[tuple[str, str], tuple[str, float]] = {}


def clear_paypal_token_cache() -> None:
    """Clear cached PayPal access tokens (used in testing)."""
    _paypal_token_cache.clear()


class PaymentService:
    """Service handling payment attempt creation, capture, and webhooks."""

    @staticmethod
    def is_demo_mode(settings=None) -> bool:
        """Check if payment service is explicitly in mock/demo mode."""
        if settings is None:
            settings = get_settings()
        mode = getattr(settings, "paypal_mode", "mock")
        return mode in ("mock", "demo")

    @staticmethod
    async def _get_paypal_access_token(settings) -> str | None:
        """Fetch OAuth2 token from PayPal REST API with TTL caching and safe error logging."""
        if getattr(settings, "paypal_mode", "mock") in ("mock", "demo"):
            return None
        if not getattr(settings, "paypal_client_id", "") or not getattr(settings, "paypal_client_secret", ""):
            return None

        cache_key = (settings.paypal_base_url, settings.paypal_client_id)
        now_mono = time.monotonic()
        cached = _paypal_token_cache.get(cache_key)
        if cached:
            token, expiry = cached
            if now_mono < expiry:
                return token

        auth_str = f"{settings.paypal_client_id}:{settings.paypal_client_secret}"
        encoded_auth = base64.b64encode(auth_str.encode()).decode()

        url = f"{settings.paypal_base_url}/v1/oauth2/token"
        headers = {
            "Authorization": f"Basic {encoded_auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {"grant_type": "client_credentials"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, data=data)
                if resp.status_code == 200:
                    payload = resp.json()
                    access_token = payload.get("access_token")
                    expires_in = payload.get("expires_in", 32400)
                    if access_token:
                        # Safety buffer of 60 seconds
                        ttl = max(float(expires_in) - 60.0, 30.0)
                        _paypal_token_cache[cache_key] = (access_token, now_mono + ttl)
                        return access_token
                    logger.warning("PayPal OAuth token response missing access_token field.")
                    return None
                else:
                    logger.error(
                        "PayPal OAuth token request failed with status HTTP %d from %s",
                        resp.status_code,
                        url,
                    )
                    return None
        except httpx.RequestError as exc:
            logger.error("PayPal OAuth network request error to %s: %s", url, type(exc).__name__)
            return None
        except Exception as exc:
            logger.error(
                "Unexpected error during PayPal OAuth token retrieval: %s",
                type(exc).__name__,
            )
            return None

    @staticmethod
    async def create_payment_attempt(
        db: AsyncSession,
        order_id: UUID,
        idempotency_key: str | None = None,
        return_url_base: str | None = None,
    ) -> tuple[PaymentAttempt, str]:
        """Create a new payment attempt for an order.

        Returns:
            (payment_attempt, approval_url)
        """
        settings = get_settings()

        # 1. Fetch order
        stmt = (
            select(Order)
            .options(selectinload(Order.payment_attempts))
            .where(Order.id == order_id)
        )
        order = (await db.execute(stmt)).scalar_one_or_none()
        if order is None:
            raise OrderNotFound(str(order_id))

        if not order.confirmed_by_shopper:
            raise OrderNotConfirmed()

        # 2. Verify stock reservation is still valid
        if order.stock_reserved_until and datetime.now(UTC) > order.stock_reserved_until:
            await StockService.expire_order_reservations_if_overdue(db, order_id)
            order.status = "cancelled"
            await db.commit()
            raise StockReservationExpired(str(order_id))

        # Check if overdue
        is_expired = await StockService.expire_order_reservations_if_overdue(db, order_id)
        if is_expired:
            order.status = "cancelled"
            await db.commit()
            raise StockReservationExpired(str(order_id))

        # 3. Handle Idempotency Key
        if not idempotency_key:
            idempotency_key = f"ik_{secrets.token_urlsafe(24)}"

        key_stmt = select(PaymentAttempt).where(PaymentAttempt.idempotency_key == idempotency_key)
        existing_with_key = (await db.execute(key_stmt)).scalar_one_or_none()
        if existing_with_key:
            if existing_with_key.status in TERMINAL_STATES:
                raise IdempotencyKeyReused()
            # Return active attempt with actual stored approval URL
            return existing_with_key, existing_with_key.approval_url or ""

        # 4. Check that no other attempt is currently in non-terminal state
        for existing_att in order.payment_attempts:
            if existing_att.status not in TERMINAL_STATES:
                raise ActivePaymentExists(str(order_id))

        # 5. Determine next attempt number and pre-generate attempt_id
        attempt_number = len(order.payment_attempts) + 1
        attempt_id = uuid.uuid4()

        # Generate tamper-proof recovery token for return redirect
        secret_key = getattr(settings, "app_secret_key", None) or "fallback_secret_min_16_bytes"
        recovery_ttl = getattr(settings, "paypal_recovery_token_ttl_minutes", 45)
        recovery_token, _ = sign_recovery_token(
            secret_key=secret_key,
            order_id=str(order.id),
            attempt_id=str(attempt_id),
            session_id=str(order.session_id),
            ttl_minutes=recovery_ttl,
        )

        base_frontend = (return_url_base or "http://localhost:5174").rstrip("/")
        return_url = f"{base_frontend}/#/checkout/complete?recovery_token={recovery_token}"
        cancel_url = f"{base_frontend}/#/checkout/cancel"

        # 6. Call PayPal Create Order (or mock/demo if configured)
        is_demo = PaymentService.is_demo_mode(settings)
        paypal_order_id: str
        approval_url: str

        if not is_demo:
            access_token = await PaymentService._get_paypal_access_token(settings)
            if not access_token:
                raise PaymentCaptureFailed(
                    "PayPal OAuth authentication failed: Unable to obtain access token in sandbox/live mode."
                )
            amount_val = f"{order.total_minor / 100:.2f}"
            payload = {
                "intent": "CAPTURE",
                "purchase_units": [
                    {
                        "reference_id": str(order.id),
                        "amount": {
                            "currency_code": order.currency,
                            "value": amount_val,
                        },
                    }
                ],
                "application_context": {
                    "brand_name": "PayPilot AI",
                    "landing_page": "NO_PREFERENCE",
                    "user_action": "PAY_NOW",
                    "return_url": return_url,
                    "cancel_url": cancel_url,
                },
            }
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{settings.paypal_base_url}/v2/checkout/orders",
                    headers=headers,
                    json=payload,
                )
                if res.status_code == 201:
                    data = res.json()
                    paypal_order_id = data["id"]
                    approval_url = next(
                        (lnk["href"] for lnk in data.get("links", []) if lnk.get("rel") in ("approve", "payer-action")),
                        f"https://www.sandbox.paypal.com/checkoutnow?token={paypal_order_id}",
                    )
                else:
                    raise PaymentCaptureFailed(f"PayPal order creation failed: {res.text}")
        else:
            # Deterministic synthetic demo order ID
            paypal_order_id = f"DEMO-PAYPAL-ORD-{secrets.token_hex(8).upper()}"
            approval_url = f"{base_frontend}/#/checkout/complete?recovery_token={recovery_token}&token={paypal_order_id}&demo=true"

        # 7. Create PaymentAttempt record
        attempt = PaymentAttempt(
            id=attempt_id,
            order_id=order.id,
            attempt_number=attempt_number,
            idempotency_key=idempotency_key,
            paypal_order_id=paypal_order_id,
            approval_url=approval_url,
            status="created",
            amount_minor=order.total_minor,
            currency=order.currency,
        )
        db.add(attempt)
        order.status = "payment_processing"

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="payment.attempt_created",
            actor="shopper",
            session_id=order.session_id,
            order_id=order.id,
            payload={
                "attempt_id": str(attempt.id),
                "attempt_number": attempt_number,
                "amount_minor": order.total_minor,
                "currency": order.currency,
                "idempotency_key": idempotency_key,
            },
        )

        await db.commit()
        await db.refresh(attempt)

        return attempt, approval_url

    @staticmethod
    async def approve_payment_attempt(
        db: AsyncSession,
        order_id: UUID,
        attempt_id: UUID,
        payer_id: str | None = None,
    ) -> PaymentAttempt:
        """Simulate buyer approval for a payment attempt in demo mode."""
        stmt = (
            select(PaymentAttempt)
            .options(selectinload(PaymentAttempt.order))
            .where(
                PaymentAttempt.id == attempt_id,
                PaymentAttempt.order_id == order_id,
            )
        )
        attempt = (await db.execute(stmt)).scalar_one_or_none()
        if attempt is None:
            raise PaymentAttemptNotFound(str(attempt_id))

        if attempt.status in TERMINAL_STATES:
            raise PaymentCaptureFailed(f"Cannot approve attempt in terminal state: {attempt.status}")

        settings = get_settings()
        is_demo = PaymentService.is_demo_mode(settings)
        attempt.paypal_payer_id = payer_id or f"DEMO-PAYER-{secrets.token_hex(4).upper()}"
        attempt.status = "approved"

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="payment.buyer_approved",
            actor="shopper",
            session_id=attempt.order.session_id if attempt.order else None,
            order_id=order_id,
            payload={
                "attempt_id": str(attempt.id),
                "paypal_order_id": attempt.paypal_order_id,
                "payer_id": attempt.paypal_payer_id,
                "is_demo": is_demo,
            },
        )
        await db.commit()
        await db.refresh(attempt)
        return attempt

    @staticmethod
    async def resolve_paypal_return(
        db: AsyncSession,
        recovery_token: str,
        paypal_order_id: str,
        payer_id: str | None = None,
        existing_token: str | None = None,
    ) -> dict[str, Any]:
        """Resolve an offsite PayPal return redirect and re-hydrate session context.

        Validates the tamper-proof HMAC recovery token against server secret,
        verifies PayPal authoritative status, re-reserves expired stock if needed,
        and generates an authorized session token for the returning browser.
        """
        settings = get_settings()
        secret_key = getattr(settings, "app_secret_key", None) or "fallback_secret_min_16_bytes"
        payload = verify_recovery_token(secret_key, recovery_token)
        if not payload:
            raise PaymentCaptureFailed("Invalid or expired checkout recovery token.")

        if "paypal_order_id" in payload and payload["paypal_order_id"] != paypal_order_id:
            raise PaymentCaptureFailed(
                f"PayPal order ID mismatch: token belongs to {payload['paypal_order_id']}, got {paypal_order_id}"
            )

        order_id = UUID(payload["order_id"])
        attempt_id = UUID(payload["attempt_id"])
        session_id = UUID(payload["session_id"])

        stmt = (
            select(PaymentAttempt)
            .options(
                selectinload(PaymentAttempt.order).selectinload(Order.session),
                selectinload(PaymentAttempt.order).selectinload(Order.items),
                selectinload(PaymentAttempt.order).selectinload(Order.stock_reservations),
            )
            .where(
                PaymentAttempt.id == attempt_id,
                PaymentAttempt.order_id == order_id,
            )
        )
        attempt = (await db.execute(stmt)).scalar_one_or_none()
        if not attempt:
            raise PaymentAttemptNotFound(str(attempt_id))

        if attempt.paypal_order_id and attempt.paypal_order_id != paypal_order_id:
            raise PaymentCaptureFailed(
                f"PayPal order ID mismatch: attempt has {attempt.paypal_order_id}, got {paypal_order_id}"
            )

        order = attempt.order
        session = order.session
        is_demo = PaymentService.is_demo_mode(settings)

        # In sandbox/live, verify PayPal status is APPROVED or COMPLETED
        if not is_demo:
            access_token = await PaymentService._get_paypal_access_token(settings)
            if not access_token:
                raise PaymentCaptureFailed("Unable to verify PayPal order: authorization failed.")
            headers = {"Authorization": f"Bearer {access_token}"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{settings.paypal_base_url}/v2/checkout/orders/{paypal_order_id}",
                    headers=headers,
                )
                if res.status_code != 200:
                    raise PaymentCaptureFailed(f"Authoritative PayPal order lookup failed (HTTP {res.status_code})")
                paypal_data = res.json()
                status = paypal_data.get("status")
                if status not in ("APPROVED", "COMPLETED"):
                    raise PaymentCaptureFailed(f"PayPal order not approved: status is {status}")
                if payer_id and not attempt.paypal_payer_id:
                    attempt.paypal_payer_id = payer_id

        # If order was cancelled / hold expired, attempt re-reservation
        stock_re_reserved = False
        now = datetime.now(UTC)
        is_expired = (order.stock_reserved_until and now > order.stock_reserved_until) or order.status == "cancelled"

        if is_expired and attempt.status != "captured":
            re_reserved = await StockService.re_reserve_stock_for_order(
                db=db,
                order_id=order.id,
                ttl_minutes=settings.stock_reservation_ttl_minutes,
            )
            if not re_reserved:
                raise InsufficientStock(
                    product_id="order_items",
                    available=0,
                    requested=1,
                )
            order.status = "payment_processing"
            order.stock_reserved_until = now + timedelta(minutes=settings.stock_reservation_ttl_minutes)
            stock_re_reserved = True
            from app.services.audit_service import AuditService
            await AuditService.emit_event(
                db=db,
                event_type="payment.stock_re_reserved",
                actor="system",
                session_id=session.id,
                order_id=order.id,
                payload={"order_id": str(order.id), "paypal_order_id": paypal_order_id},
            )

        # Issue fresh raw access token for cold/Incognito tabs, or preserve existing valid token if present
        if existing_token and hash_token(existing_token) == session.access_token_hash and session.status == "active":
            token_for_response = existing_token
        else:
            token_for_response = generate_session_token()
            session.access_token_hash = hash_token(token_for_response)
            session.status = "active"

        await db.commit()
        await db.refresh(order)
        await db.refresh(attempt)

        return {
            "session_id": session.id,
            "access_token": token_for_response,
            "order": order,
            "attempt": attempt,
            "stock_re_reserved": stock_re_reserved,
        }

    @staticmethod
    async def capture_payment_attempt(
        db: AsyncSession,
        order_id: UUID,
        attempt_id: UUID,
        simulated_failure_reason: str | None = None,
    ) -> PaymentAttempt:
        """Capture payment for an attempt.

        Idempotent: if already captured, returns existing attempt.
        On success: transitions stock reservations to committed and order to paid.
        On failure: marks attempt capture_failed and order back to payment_failed for retry.
        """
        stmt = (
            select(PaymentAttempt)
            .options(selectinload(PaymentAttempt.order))
            .where(
                PaymentAttempt.id == attempt_id,
                PaymentAttempt.order_id == order_id,
            )
        )
        attempt = (await db.execute(stmt)).scalar_one_or_none()
        if attempt is None:
            raise PaymentAttemptNotFound(str(attempt_id))

        # Idempotency check: already captured
        if attempt.status == "captured":
            return attempt

        order = attempt.order

        # Stock hold check and safe re-reservation for approved orders
        now = datetime.now(UTC)
        is_hold_expired = (order.stock_reserved_until and now > order.stock_reserved_until) or order.status == "cancelled"

        if is_hold_expired:
            settings = get_settings()
            is_demo = PaymentService.is_demo_mode(settings)
            is_approved = False

            if is_demo:
                is_approved = attempt.status == "approved"
            else:
                access_token = await PaymentService._get_paypal_access_token(settings)
                if access_token and attempt.paypal_order_id:
                    headers = {"Authorization": f"Bearer {access_token}"}
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            res = await client.get(
                                f"{settings.paypal_base_url}/v2/checkout/orders/{attempt.paypal_order_id}",
                                headers=headers,
                            )
                            if res.status_code == 200:
                                paypal_data = res.json()
                                is_approved = paypal_data.get("status") in ("APPROVED", "COMPLETED")
                    except Exception:
                        is_approved = False

            if is_approved:
                # Attempt atomic re-reservation under row lock
                re_reserved = await StockService.re_reserve_stock_for_order(
                    db=db,
                    order_id=order.id,
                    ttl_minutes=settings.stock_reservation_ttl_minutes,
                )
                if re_reserved:
                    order.status = "payment_processing"
                    order.stock_reserved_until = now + timedelta(minutes=settings.stock_reservation_ttl_minutes)
                    from app.services.audit_service import AuditService
                    await AuditService.emit_event(
                        db=db,
                        event_type="payment.stock_re_reserved_at_capture",
                        actor="system",
                        session_id=order.session_id,
                        order_id=order.id,
                        payload={"order_id": str(order.id), "attempt_id": str(attempt.id)},
                    )
                else:
                    # Stock exhausted while hold was expired: CANNOT CAPTURE!
                    order.status = "cancelled"
                    attempt.status = "expired"
                    attempt.failure_reason = "Stock reservation expired and inventory is no longer available"
                    await db.commit()
                    raise InsufficientStock(product_id="order_items", available=0, requested=1)
            else:
                await StockService.expire_order_reservations_if_overdue(db, order_id)
                order.status = "cancelled"
                attempt.status = "expired"
                attempt.failure_reason = "Stock reservation expired before capture"
                await db.commit()
                raise StockReservationExpired(str(order_id))

        settings = get_settings()
        is_demo = PaymentService.is_demo_mode(settings)
        access_token = None if is_demo else await PaymentService._get_paypal_access_token(settings)

        # Simulation or Live PayPal capture
        if simulated_failure_reason:
            attempt.status = "capture_failed"
            attempt.failure_reason = simulated_failure_reason
            order.status = "payment_failed"

            from app.services.audit_service import AuditService

            await AuditService.emit_event(
                db=db,
                event_type="payment.capture_failed",
                actor="shopper",
                session_id=order.session_id,
                order_id=order.id,
                payload={
                    "attempt_id": str(attempt.id),
                    "reason": simulated_failure_reason,
                    "is_demo": is_demo,
                },
            )

            await db.commit()
            return attempt

        if not is_demo:
            if not access_token or not attempt.paypal_order_id:
                attempt.status = "capture_failed"
                attempt.failure_reason = "PayPal authentication failed in sandbox/live mode"
                order.status = "payment_failed"
                await db.commit()
                raise PaymentCaptureFailed("PayPal authentication failed. Cannot capture in sandbox/live mode.")
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{settings.paypal_base_url}/v2/checkout/orders/{attempt.paypal_order_id}/capture",
                    headers=headers,
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    status = data.get("status")
                    if status == "COMPLETED":
                        attempt.status = "captured"
                        attempt.captured_at = datetime.now(UTC)
                        captures = (
                            data.get("purchase_units", [{}])[0]
                            .get("payments", {})
                            .get("captures", [])
                        )
                        capture_id = captures[0].get("id") if captures else None
                        attempt.paypal_capture_id = capture_id
                        order.status = "paid"
                        await StockService.commit_reservations_for_order(db, order.id)
                    else:
                        attempt.status = "capture_failed"
                        attempt.failure_reason = f"PayPal returned status: {status}"
                        order.status = "payment_failed"
                else:
                    attempt.status = "capture_failed"
                    attempt.failure_reason = res.text
                    order.status = "payment_failed"
        else:
            # Synthetic demo capture success (strictly forbidden in production)
            if getattr(settings, "app_env", "") == "production":
                attempt.status = "capture_failed"
                attempt.failure_reason = "Mock payment captures are strictly forbidden in production"
                order.status = "payment_failed"
                await db.commit()
                raise PaymentCaptureFailed("Mock payment captures are strictly forbidden in production.")

            attempt.status = "captured"
            attempt.captured_at = datetime.now(UTC)
            if not attempt.paypal_payer_id:
                attempt.paypal_payer_id = f"DEMO-PAYER-{secrets.token_hex(4).upper()}"
            if not attempt.paypal_capture_id:
                attempt.paypal_capture_id = f"DEMO-CAP-{secrets.token_hex(8).upper()}"
            order.status = "paid"
            await StockService.commit_reservations_for_order(db, order.id)

        from app.services.audit_service import AuditService

        event_name = "payment.captured" if attempt.status == "captured" else "payment.capture_failed"
        await AuditService.emit_event(
            db=db,
            event_type=event_name,
            actor="shopper",
            session_id=order.session_id,
            order_id=order.id,
            payload={
                "attempt_id": str(attempt.id),
                "status": attempt.status,
                "failure_reason": attempt.failure_reason,
            },
        )

        await db.commit()
        await db.refresh(attempt)
        return attempt

    @staticmethod
    async def list_attempts_for_order(db: AsyncSession, order_id: UUID) -> list[PaymentAttempt]:
        """List all payment attempts for an order in attempt_number order."""
        stmt = (
            select(PaymentAttempt)
            .where(PaymentAttempt.order_id == order_id)
            .order_by(PaymentAttempt.attempt_number.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_attempt(db: AsyncSession, order_id: UUID, attempt_id: UUID) -> PaymentAttempt:
        """Get a single payment attempt."""
        stmt = select(PaymentAttempt).where(
            PaymentAttempt.order_id == order_id,
            PaymentAttempt.id == attempt_id,
        )
        attempt = (await db.execute(stmt)).scalar_one_or_none()
        if attempt is None:
            raise PaymentAttemptNotFound(str(attempt_id))
        return attempt

    @staticmethod
    async def verify_paypal_webhook_signature(
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> bool:
        """Verify webhook signature against PayPal REST API v2.

        Checks headers:
            - paypal-auth-algo
            - paypal-cert-url
            - paypal-transmission-id
            - paypal-transmission-sig
            - paypal-transmission-time

        Raises:
            PayPalWebhookNotConfigured: If webhook verification is not configured.
            PayPalWebhookInvalid: If verification headers are missing or signature verification fails.
        """
        settings = get_settings()

        if not settings.paypal_webhook_id or not settings.paypal_client_id or not settings.paypal_client_secret:
            raise PayPalWebhookNotConfigured()

        norm_headers = {k.lower(): v for k, v in headers.items()}
        auth_algo = norm_headers.get("paypal-auth-algo")
        cert_url = norm_headers.get("paypal-cert-url")
        transmission_id = norm_headers.get("paypal-transmission-id")
        transmission_sig = norm_headers.get("paypal-transmission-sig")
        transmission_time = norm_headers.get("paypal-transmission-time")

        if not all([auth_algo, cert_url, transmission_id, transmission_sig, transmission_time]):
            raise PayPalWebhookInvalid("Missing required PayPal verification headers.")

        access_token = await PaymentService._get_paypal_access_token(settings)
        if not access_token:
            raise PayPalWebhookInvalid("Failed to authenticate with PayPal to verify webhook signature.")

        verify_url = f"{settings.paypal_base_url}/v1/notifications/verify-webhook-signature"
        verify_body = {
            "auth_algo": auth_algo,
            "cert_url": cert_url,
            "transmission_id": transmission_id,
            "transmission_sig": transmission_sig,
            "transmission_time": transmission_time,
            "webhook_id": settings.paypal_webhook_id,
            "webhook_event": payload,
        }
        req_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(verify_url, headers=req_headers, json=verify_body)
                if res.status_code == 200:
                    status_val = res.json().get("verification_status")
                    if status_val == "SUCCESS":
                        return True
                    raise PayPalWebhookInvalid(f"PayPal reported status: {status_val}")
                raise PayPalWebhookInvalid(f"PayPal verification endpoint error: {res.text}")
        except (PayPalWebhookInvalid, PayPalWebhookNotConfigured):
            raise
        except Exception as e:
            raise PayPalWebhookInvalid(f"Webhook signature verification error: {e}") from e
