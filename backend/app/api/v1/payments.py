"""
Payment API endpoints (v1).

- POST /orders/{order_id}/payments: Create a PayPal payment attempt (idempotent).
- POST /orders/{order_id}/payments/{attempt_id}/capture: Capture payment.
- GET /orders/{order_id}/payments: List all payment attempts for this order.
- GET /orders/{order_id}/payments/{attempt_id}: Get specific attempt status.
- POST /webhooks/paypal: Async PayPal webhook notification receiver.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import verify_order_access
from app.database import get_db
from app.models.order import Order
from app.models.payment import PaymentAttempt
from app.schemas.common import ApiResponse
from app.schemas.payment import (
    PaymentApproveResponse,
    PaymentAttemptOut,
    PaymentCaptureRequest,
    PaymentCaptureResponse,
    PaymentCreateResponse,
)
from app.services.payment_service import PaymentService
from app.services.stock_service import StockService
from app.utils.exceptions import SessionInactive

router = APIRouter(tags=["Payments"])


def _build_meta(request: Request) -> dict:
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.post(
    "/orders/{order_id}/payments",
    response_model=ApiResponse[PaymentCreateResponse],
    summary="Create payment attempt",
    description="Initiate a PayPal order. Idempotent via optional Idempotency-Key header. Multiple attempts allowed on previous failure.",
)
async def create_payment(
    request: Request,
    order_id: UUID,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    order: Order = Depends(verify_order_access),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaymentCreateResponse]:
    if order.session and order.session.status != "active":
        raise SessionInactive(order.session.status)

    attempt, approval_url = await PaymentService.create_payment_attempt(
        db=db,
        order_id=order_id,
        idempotency_key=idempotency_key,
    )
    is_demo = PaymentService.is_demo_mode()
    data = PaymentCreateResponse(
        attempt_id=attempt.id,
        attempt_number=attempt.attempt_number,
        idempotency_key=attempt.idempotency_key,
        paypal_order_id=attempt.paypal_order_id or "",
        approval_url=approval_url,
        status=attempt.status,
        is_demo=is_demo,
        demo_notice="Demo payment — no real payment processed" if is_demo else None,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.post(
    "/orders/{order_id}/payments/{attempt_id}/approve",
    response_model=ApiResponse[PaymentApproveResponse],
    summary="Simulate or record buyer approval",
    description="Simulates buyer approval on a PayPal payment attempt (demo mode or sandbox approval).",
)
async def approve_payment(
    request: Request,
    order_id: UUID,
    attempt_id: UUID,
    order: Order = Depends(verify_order_access),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaymentApproveResponse]:
    if order.session and order.session.status != "active":
        raise SessionInactive(order.session.status)

    attempt = await PaymentService.approve_payment_attempt(
        db=db,
        order_id=order_id,
        attempt_id=attempt_id,
    )
    is_demo = PaymentService.is_demo_mode()
    data = PaymentApproveResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        paypal_payer_id=attempt.paypal_payer_id,
        is_demo=is_demo,
        demo_notice="Demo payment — no real payment processed" if is_demo else None,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.post(
    "/orders/{order_id}/payments/{attempt_id}/capture",
    response_model=ApiResponse[PaymentCaptureResponse],
    summary="Capture payment attempt",
    description="Captures PayPal payment, commits reserved stock, and transitions order to 'paid'. Idempotent.",
)
async def capture_payment(
    request: Request,
    order_id: UUID,
    attempt_id: UUID,
    body: PaymentCaptureRequest | None = None,
    order: Order = Depends(verify_order_access),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaymentCaptureResponse]:
    if order.session and order.session.status != "active":
        raise SessionInactive(order.session.status)

    simulated_failure_reason = None
    if body and body.simulate_failure:
        simulated_failure_reason = body.failure_reason or "Simulated payment failure (insufficient funds in demo mode)"

    attempt = await PaymentService.capture_payment_attempt(
        db=db,
        order_id=order_id,
        attempt_id=attempt_id,
        simulated_failure_reason=simulated_failure_reason,
    )
    is_demo = PaymentService.is_demo_mode()
    data = PaymentCaptureResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        failure_reason=attempt.failure_reason,
        captured_at=attempt.captured_at,
        is_demo=is_demo,
        demo_notice="Demo payment — no real payment processed" if is_demo else None,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.get(
    "/orders/{order_id}/payments",
    response_model=ApiResponse[list[PaymentAttemptOut]],
    summary="List payment attempts",
    description="List all payment attempts for an order.",
)
async def list_payment_attempts(
    request: Request,
    order_id: UUID,
    order: Order = Depends(verify_order_access),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PaymentAttemptOut]]:
    attempts = await PaymentService.list_attempts_for_order(db, order_id)
    is_demo = PaymentService.is_demo_mode()
    data = [
        PaymentAttemptOut(
            attempt_id=att.id,
            attempt_number=att.attempt_number,
            idempotency_key=att.idempotency_key,
            paypal_order_id=att.paypal_order_id,
            approval_url=att.approval_url,
            status=att.status,
            amount_minor=att.amount_minor,
            currency=att.currency,
            failure_reason=att.failure_reason,
            captured_at=att.captured_at,
            created_at=att.created_at,
            is_demo=is_demo,
            demo_notice="Demo payment — no real payment processed" if is_demo else None,
        )
        for att in attempts
    ]
    return ApiResponse(data=data, meta=_build_meta(request))


@router.get(
    "/orders/{order_id}/payments/{attempt_id}",
    response_model=ApiResponse[PaymentAttemptOut],
    summary="Get payment attempt",
    description="Get details of a specific payment attempt.",
)
async def get_payment_attempt(
    request: Request,
    order_id: UUID,
    attempt_id: UUID,
    order: Order = Depends(verify_order_access),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaymentAttemptOut]:
    att = await PaymentService.get_attempt(db, order_id, attempt_id)
    is_demo = PaymentService.is_demo_mode()
    data = PaymentAttemptOut(
        attempt_id=att.id,
        attempt_number=att.attempt_number,
        idempotency_key=att.idempotency_key,
        paypal_order_id=att.paypal_order_id,
        approval_url=att.approval_url,
        status=att.status,
        amount_minor=att.amount_minor,
        currency=att.currency,
        failure_reason=att.failure_reason,
        captured_at=att.captured_at,
        created_at=att.created_at,
        is_demo=is_demo,
        demo_notice="Demo payment — no real payment processed" if is_demo else None,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.post(
    "/webhooks/paypal",
    status_code=status.HTTP_200_OK,
    summary="PayPal webhook receiver",
    description="Receives async payment notifications from PayPal to reconcile local attempt and order states.",
)
async def paypal_webhook(
    request: Request,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    # 1. Cryptographically verify signature with PayPal before processing event
    await PaymentService.verify_paypal_webhook_signature(
        headers=dict(request.headers),
        payload=payload,
    )

    event_type = payload.get("event_type")
    resource = payload.get("resource", {})
    paypal_order_id = resource.get("id")

    if paypal_order_id and event_type in ("PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.APPROVED"):
        stmt = (
            select(PaymentAttempt)
            .options(selectinload(PaymentAttempt.order))
            .where(PaymentAttempt.paypal_order_id == paypal_order_id)
        )
        attempt = (await db.execute(stmt)).scalar_one_or_none()
        if attempt:
            if event_type == "PAYMENT.CAPTURE.COMPLETED" and attempt.status != "captured":
                attempt.status = "captured"
                attempt.captured_at = datetime.now(UTC)
                if attempt.order:
                    attempt.order.status = "paid"
                await StockService.commit_reservations_for_order(db, attempt.order_id)
                await db.commit()
            elif event_type == "CHECKOUT.ORDER.APPROVED" and attempt.status == "created":
                attempt.status = "approved"
                await db.commit()

    return {"status": "received"}
