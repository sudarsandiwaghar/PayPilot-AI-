"""
SQLAlchemy ORM models for Products and Product Sources.

Represents items in the catalog along with external source evidence (claims,
prices, verification timestamps). All seed data is explicitly flagged with
`is_demo_data=True` and `verified_at=None`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    """Product catalog item."""

    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    sku: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    brand: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    price_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
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
    sources: Mapped[list[ProductSource]] = relationship(
        "ProductSource",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint("price_minor > 0", name="chk_products_price_positive"),
        CheckConstraint("stock_qty >= 0", name="chk_products_stock_non_negative"),
        CheckConstraint(
            "rating IS NULL OR (rating >= 0 AND rating <= 5)",
            name="chk_products_rating_range",
        ),
        Index("ix_products_category_is_active", "category", "is_active"),
    )


class ProductSource(Base):
    """External source evidence backing a product claim or price."""

    __tablename__ = "product_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_name: Mapped[str] = mapped_column(String(128), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    price_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    product: Mapped[Product] = relationship("Product", back_populates="sources")
