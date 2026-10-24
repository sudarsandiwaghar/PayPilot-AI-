"""
SQLAlchemy ORM model for Shopping Sessions.

Implements anonymous session security using a stored SHA-256 hash of a
CSPRNG bearer token. The plaintext token is never persisted.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.cart import Cart


class ShoppingSession(Base):
    """Anonymous shopping session identified by UUID and authorized by token hash."""

    __tablename__ = "shopping_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    access_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        index=True,
    )
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
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
    cart: Mapped[Cart | None] = relationship(
        "Cart",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_shopping_sessions_token_hash_status", "access_token_hash", "status"),
    )
