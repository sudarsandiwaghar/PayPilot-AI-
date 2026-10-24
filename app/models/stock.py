"""
SQLAlchemy ORM model for Stock Reservations.

Tracks temporary inventory holds (`held`), finalized sales (`committed`),
and refunded/expired/cancelled inventory releases (`released`).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.product import Product


class StockReservation(Base):
    """Temporary or committed inventory hold tied to an order."""

    __tablename__ = "stock_reservations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="held",
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
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
    order: Mapped[Order] = relationship("Order", back_populates="stock_reservations")
    product: Mapped[Product] = relationship("Product")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_stock_reservations_quantity_positive"),
    )
