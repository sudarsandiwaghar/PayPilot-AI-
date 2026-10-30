"""
Shopping cart API endpoints (v1).

All cart endpoints require Bearer token authorization via `verify_session_token`.
- GET /sessions/{session_id}/cart: View cart
- POST /sessions/{session_id}/cart/items: Add product
- PATCH /sessions/{session_id}/cart/items/{item_id}: Update quantity
- DELETE /sessions/{session_id}/cart/items/{item_id}: Remove item
- DELETE /sessions/{session_id}/cart: Clear cart
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import verify_active_session_token
from app.database import get_db
from app.schemas.cart import CartItemCreate, CartItemUpdate, CartOut
from app.schemas.common import ApiResponse
from app.services.cart_service import CartService

router = APIRouter(prefix="/sessions/{session_id}/cart", tags=["Carts"])


def _build_meta(request: Request) -> dict:
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get(
    "",
    response_model=ApiResponse[CartOut],
    summary="View shopping cart",
    description="Retrieve current cart contents, line totals, subtotal, and cart version.",
)
async def view_cart(
    request: Request,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CartOut]:
    cart_out = await CartService.get_cart_view(db, session_id)
    return ApiResponse(data=cart_out, meta=_build_meta(request))


@router.post(
    "/items",
    response_model=ApiResponse[CartOut],
    summary="Add item to cart",
    description="Add a product with quantity to the cart. Increments cart version.",
)
async def add_item(
    request: Request,
    body: CartItemCreate,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CartOut]:
    cart_out = await CartService.add_item(
        db=db,
        session_id=session_id,
        product_id=body.product_id,
        quantity=body.quantity,
    )
    return ApiResponse(data=cart_out, meta=_build_meta(request))


@router.patch(
    "/items/{item_id}",
    response_model=ApiResponse[CartOut],
    summary="Update cart item quantity",
    description="Update the quantity of a line item. Increments cart version.",
)
async def update_item(
    request: Request,
    item_id: UUID,
    body: CartItemUpdate,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CartOut]:
    cart_out = await CartService.update_item_quantity(
        db=db,
        session_id=session_id,
        item_id=item_id,
        quantity=body.quantity,
    )
    return ApiResponse(data=cart_out, meta=_build_meta(request))


@router.delete(
    "/items/{item_id}",
    response_model=ApiResponse[CartOut],
    summary="Remove item from cart",
    description="Remove an item from the cart. Increments cart version.",
)
async def remove_item(
    request: Request,
    item_id: UUID,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CartOut]:
    cart_out = await CartService.remove_item(
        db=db,
        session_id=session_id,
        item_id=item_id,
    )
    return ApiResponse(data=cart_out, meta=_build_meta(request))


@router.delete(
    "",
    response_model=ApiResponse[CartOut],
    summary="Clear shopping cart",
    description="Remove all items from the cart. Increments cart version.",
)
async def clear_cart(
    request: Request,
    session_id: UUID = Depends(verify_active_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CartOut]:
    cart_out = await CartService.clear_cart(
        db=db,
        session_id=session_id,
    )
    return ApiResponse(data=cart_out, meta=_build_meta(request))
