"""
SQLAlchemy ORM model for Audit Events.

Append-only audit trail recording all domain actions (cart additions,
checkout previews, confirms, stock holds, releases, payment captures).
Sensitive fields (secrets, tokens) are never stored in payload_json.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditEvent(Base):
    """Append-only domain audit log entry."""

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    actor: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shopping_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payload_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    __table_args__ = (
        Index("ix_audit_events_type_created", "event_type", "created_at"),
    )
