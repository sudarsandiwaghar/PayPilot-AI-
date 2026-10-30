"""
Checkout API endpoints (v1).

- POST /sessions/{session_id}/checkout/preview: Revalidate prices & stock, return HMAC-bound preview.
- POST /sessions/{session_id}/checkout/confirm: Confirm checkout, revalidate server-side, hold stock.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import verify_active_session_token
from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.order import CheckoutConfirmRequest, CheckoutPreview, OrderOut
from app.services.checkout_service import CheckoutService

router = APIRouter(prefix="/sessions/{session_id}/checkout", tags=["Checkout"])


def _build_meta(request: Request) -> dict:
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.post(
    "/preview",
    response_model=ApiResponse[CheckoutPreview],
    summary="Checkout preview",
    description="Revalidate current prices and stock availability, and return an HMAC preview token.",
)
async def checkout_preview(
    request: Request,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CheckoutPreview]:
    preview = await CheckoutService.create_preview(db, session_id)
    return ApiResponse(data=preview, meta=_build_meta(request))


@router.post(
    "/confirm",
    response_model=ApiResponse[OrderOut],
    summary="Confirm checkout and create order",
    description="Validates preview token, revalidates stock and prices on the server, atomically holds stock, and creates an order.",
)
async def checkout_confirm(
    request: Request,
    body: CheckoutConfirmRequest,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[OrderOut]:
    order = await CheckoutService.confirm_checkout(
        db=db,
        session_id=session_id,
        preview_token=body.preview_token,
    )
    return ApiResponse(
        data=CheckoutService.serialize_order_out(order),
        meta=_build_meta(request),
    )
