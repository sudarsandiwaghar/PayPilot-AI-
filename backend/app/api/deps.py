"""
Shared FastAPI dependencies.

- ``verify_session_token``: Validates session ownership using constant-time comparison.
- ``verify_active_session_token``: Validates session ownership AND ensures status == 'active'.
- ``verify_order_access``: Validates that caller owns the session that placed the order.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.order import Order
from app.models.session import ShoppingSession
from app.utils.exceptions import (
    OrderNotFound,
    SessionInactive,
    SessionNotFound,
    SessionTokenInvalid,
    SessionTokenMissing,
)
from app.utils.security import verify_token


def _extract_bearer_token(authorization: str | None) -> str:
    """Extract and validate Bearer token string from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise SessionTokenMissing()

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise SessionTokenMissing()
    return token


async def verify_session_token(
    session_id: UUID,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    """Validate that the caller owns the given session."""
    token = _extract_bearer_token(authorization)

    stmt = select(ShoppingSession).where(ShoppingSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise SessionNotFound(str(session_id))

    if not verify_token(token, session.access_token_hash):
        raise SessionTokenInvalid()

    return session_id


async def verify_active_session_token(
    session_id: UUID,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    """Validate session ownership AND reject completed or abandoned sessions."""
    token = _extract_bearer_token(authorization)

    stmt = select(ShoppingSession).where(ShoppingSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise SessionNotFound(str(session_id))

    if not verify_token(token, session.access_token_hash):
        raise SessionTokenInvalid()

    if session.status != "active":
        raise SessionInactive(session.status)

    return session_id


async def verify_order_access(
    order_id: UUID,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> Order:
    """Validate that caller owns the session that placed this order."""
    token = _extract_bearer_token(authorization)

    stmt = (
        select(Order)
        .options(
            selectinload(Order.session),
            selectinload(Order.items),
            selectinload(Order.payment_attempts),
            selectinload(Order.stock_reservations),
        )
        .where(Order.id == order_id)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if order is None:
        raise OrderNotFound(str(order_id))

    session = order.session
    if session is None or not verify_token(token, session.access_token_hash):
        raise SessionTokenInvalid()

    return order
