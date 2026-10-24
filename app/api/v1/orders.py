"""
Order history and detail API endpoints (v1).

- GET /sessions/{session_id}/orders: List orders for this session.
- GET /orders/{order_id}: Retrieve order detail.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import verify_order_access, verify_session_token
from app.database import get_db
from app.models.order import Order
from app.schemas.common import ApiResponse
from app.schemas.order import OrderOut
from app.services.checkout_service import CheckoutService

router = APIRouter(tags=["Orders"])


def _build_meta(request: Request) -> dict:
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get(
    "/sessions/{session_id}/orders",
    response_model=ApiResponse[list[OrderOut]],
    summary="List session orders",
    description="Retrieve all orders placed in this shopping session.",
)
async def list_session_orders(
    request: Request,
    session_id: UUID = Depends(verify_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OrderOut]]:
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment_attempts),
            selectinload(Order.stock_reservations),
        )
        .where(Order.session_id == session_id)
        .order_by(Order.created_at.desc())
    )
    result = await db.execute(stmt)
    orders = list(result.scalars().all())

    data = [CheckoutService.serialize_order_out(o) for o in orders]
    return ApiResponse(data=data, meta=_build_meta(request))


@router.get(
    "/orders/{order_id}",
    response_model=ApiResponse[OrderOut],
    summary="Get order detail",
    description="Retrieve full details for an order including items and payment attempts. Requires session Bearer token.",
)
async def get_order_detail(
    request: Request,
    order_id: UUID,
    order: Order = Depends(verify_order_access),
) -> ApiResponse[OrderOut]:
    return ApiResponse(
        data=CheckoutService.serialize_order_out(order),
        meta=_build_meta(request),
    )
