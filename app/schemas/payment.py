"""
Pydantic schemas for Payment Attempts.

Supports multi-attempt payment tracking, idempotency keys, and PayPal response envelopes.
Includes explicit demo/mock mode indicators to separate simulated from live PayPal verification.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreateResponse(BaseModel):
    """Response returned upon creating a payment attempt."""

    attempt_id: UUID
    attempt_number: int
    idempotency_key: str
    paypal_order_id: str
    approval_url: str
    status: str
    is_demo: bool = Field(default=True, description="True if generated in synthetic mock/demo mode.")
    demo_notice: str | None = Field(
        default="Demo payment — no real payment processed",
        description="Notice shown when using demo/mock mode.",
    )


class PaymentCaptureRequest(BaseModel):
    """Optional request payload for payment capture."""

    simulate_failure: bool = Field(default=False, description="Simulate a gateway payment failure.")
    failure_reason: str | None = Field(default=None, description="Optional custom simulated failure reason.")


class PaymentApproveResponse(BaseModel):
    """Response returned upon simulating or recording buyer approval."""

    attempt_id: UUID
    status: str
    paypal_payer_id: str | None = None
    is_demo: bool = Field(default=True)
    demo_notice: str | None = Field(default="Demo payment — no real payment processed")


class PaymentCaptureResponse(BaseModel):
    """Response returned upon capturing a payment."""

    attempt_id: UUID
    status: str = Field(description="'captured' or 'capture_failed'")
    failure_reason: str | None = None
    captured_at: datetime | None = None
    is_demo: bool = Field(default=True, description="True if processed in synthetic mock/demo mode.")
    demo_notice: str | None = Field(
        default="Demo payment — no real payment processed",
        description="Notice shown when using demo/mock mode.",
    )


class PaymentAttemptOut(BaseModel):
    """Full detail of a payment attempt."""

    model_config = ConfigDict(from_attributes=True)

    attempt_id: UUID
    attempt_number: int
    idempotency_key: str
    paypal_order_id: str | None = None
    approval_url: str | None = None
    status: str
    amount_minor: int
    currency: str
    failure_reason: str | None = None
    captured_at: datetime | None = None
    created_at: datetime
    is_demo: bool = Field(default=True)
    demo_notice: str | None = Field(default="Demo payment — no real payment processed")
