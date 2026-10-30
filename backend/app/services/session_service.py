"""
Shopping session service.

Handles session creation with CSPRNG bearer token generation, session retrieval,
metadata updates, and session termination.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import Cart
from app.models.session import ShoppingSession
from app.utils.exceptions import SessionNotFound
from app.utils.security import generate_session_token, hash_token


class SessionService:
    """Service handling anonymous shopping sessions."""

    @staticmethod
    async def create_session(
        db: AsyncSession,
        metadata_json: dict[str, Any] | None = None,
    ) -> tuple[ShoppingSession, str]:
        """Create a new session and associated empty cart.

        Returns:
            (session, plaintext_token)
        """
        raw_token = generate_session_token()
        token_hash = hash_token(raw_token)

        session = ShoppingSession(
            access_token_hash=token_hash,
            metadata_json=metadata_json,
            status="active",
        )
        db.add(session)
        await db.flush()

        # Initialize an empty cart for this session
        cart = Cart(session_id=session.id, version=1)
        db.add(cart)

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="session.created",
            actor="shopper",
            session_id=session.id,
            payload={"status": "active"},
        )

        await db.commit()
        await db.refresh(session)

        return session, raw_token

    @staticmethod
    async def get_session(db: AsyncSession, session_id: UUID) -> ShoppingSession:
        """Fetch session by ID.

        Raises:
            SessionNotFound: If session does not exist.
        """
        stmt = select(ShoppingSession).where(ShoppingSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if session is None:
            raise SessionNotFound(str(session_id))
        return session

    @staticmethod
    async def update_session(
        db: AsyncSession,
        session_id: UUID,
        metadata_json: dict[str, Any],
    ) -> ShoppingSession:
        """Update session metadata."""
        session = await SessionService.get_session(db, session_id)
        current = session.metadata_json or {}
        current.update(metadata_json)
        session.metadata_json = current
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def end_session(
        db: AsyncSession,
        session_id: UUID,
        status: str = "completed",
    ) -> ShoppingSession:
        """Mark session as ended."""
        session = await SessionService.get_session(db, session_id)
        session.status = status
        session.ended_at = datetime.now(UTC)

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="session.ended",
            actor="shopper",
            session_id=session.id,
            payload={"status": status},
        )

        await db.commit()
        await db.refresh(session)
        return session
