"""
SQLAlchemy ORM models for Orders and Order Items.

Represents confirmed purchases with locked unit prices, human-readable order numbers,
and order state machine transitions.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.payment import PaymentAttempt
    from app.models.product import Product
    from app.models.session import ShoppingSession
    from app.models.stock import StockReservation


class Order(Base):
    """Customer purchase order created upon checkout confirmation."""

    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shopping_sessions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    order_number: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="pending_payment",
        index=True,
    )
    subtotal_minor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    tax_minor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_minor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="USD",
    )
    confirmed_by_shopper: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    stock_reserved_until: Mapped[datetime | None] = mapped_column(
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
    session: Mapped[ShoppingSession] = relationship("ShoppingSession")
    items: Mapped[list[OrderItem]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="OrderItem.created_at",
    )
    stock_reservations: Mapped[list[StockReservation]] = relationship(
        "StockReservation",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    payment_attempts: Mapped[list[PaymentAttempt]] = relationship(
        "PaymentAttempt",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PaymentAttempt.attempt_number",
    )

    __table_args__ = (
        CheckConstraint("subtotal_minor >= 0", name="chk_orders_subtotal_non_negative"),
        CheckConstraint("tax_minor >= 0", name="chk_orders_tax_non_negative"),
        CheckConstraint("total_minor >= 0", name="chk_orders_total_non_negative"),
    )


class OrderItem(Base):
    """Line item in a confirmed order with snapshotted product name and price."""

    __tablename__ = "order_items"

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
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    product_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    unit_price_minor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
    )
    line_total_minor: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    order: Mapped[Order] = relationship("Order", back_populates="items")
    product: Mapped[Product] = relationship("Product", lazy="joined")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_order_items_quantity_positive"),
        CheckConstraint("unit_price_minor >= 0", name="chk_order_items_unit_price_non_negative"),
        CheckConstraint("line_total_minor >= 0", name="chk_order_items_line_total_non_negative"),
    )
