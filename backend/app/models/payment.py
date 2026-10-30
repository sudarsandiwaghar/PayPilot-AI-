"""
SQLAlchemy ORM model for Payment Attempts.

Supports multiple retry attempts per order, client/server idempotency keys,
and PayPal order synchronization.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order


class PaymentAttempt(Base):
    """An individual payment attempt for an order (multi-attempt model)."""

    __tablename__ = "payment_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempt_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    paypal_order_id: Mapped[str | None] = mapped_column(
        String(64),
        unique=True,
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="created",
        index=True,
    )
    amount_minor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
    )
    paypal_payer_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    approval_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )
    failure_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    captured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    order: Mapped[Order] = relationship("Order", back_populates="payment_attempts")

    __table_args__ = (
        UniqueConstraint("order_id", "attempt_number", name="uq_payment_attempts_order_attempt"),
        CheckConstraint("amount_minor >= 0", name="chk_payment_attempts_amount_non_negative"),
    )
