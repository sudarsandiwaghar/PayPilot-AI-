"""
Checkout service.

Handles price revalidation, HMAC preview token generation, and two-stage
checkout confirmation with atomic stock reservation.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.schemas.order import (
    CheckoutLineItem,
    CheckoutPreview,
    OrderItemOut,
    OrderOut,
    PaymentAttemptSummary,
    PriceChangeWarning,
    StockWarning,
)
from app.services.cart_service import CartService
from app.services.stock_service import StockService
from app.utils.exceptions import (
    CartEmpty,
    CartModified,
    PreviewExpired,
    PreviewInvalid,
    PriceChanged,
)
from app.utils.security import (
    decode_preview_token_signature,
    sign_preview_token,
)


class CheckoutService:
    """Service handling checkout previews and order confirmation."""

    @staticmethod
    async def create_preview(db: AsyncSession, session_id: UUID) -> CheckoutPreview:
        """Generate a tamper-proof preview bound to cart version, items, and current prices.

        Raises:
            CartEmpty: If cart has no items.
        """
        cart = await CartService.get_or_create_cart(db, session_id)
        if not cart.items:
            raise CartEmpty()

        settings = get_settings()
        currency = settings.default_currency
        summary: list[CheckoutLineItem] = []
        price_changes: list[PriceChangeWarning] = []
        stock_warnings: list[StockWarning] = []
        item_fingerprint: list[dict] = []
        subtotal = 0

        for item in cart.items:
            # Re-fetch live product price and stock
            prod_stmt = (
                select(Product)
                .where(Product.id == item.product_id)
                .execution_options(populate_existing=True)
            )
            product = (await db.execute(prod_stmt)).scalar_one()

            live_price = product.price_minor
            if item.unit_price_minor != live_price:
                price_changes.append(
                    PriceChangeWarning(
                        product_id=product.id,
                        product_name=product.name,
                        old_price_minor=item.unit_price_minor,
                        new_price_minor=live_price,
                    )
                )

            if product.stock_qty < item.quantity:
                stock_warnings.append(
                    StockWarning(
                        product_id=product.id,
                        product_name=product.name,
                        requested_qty=item.quantity,
                        available_qty=product.stock_qty,
                    )
                )

            line_total = item.quantity * live_price
            subtotal += line_total
            currency = product.currency

            summary.append(
                CheckoutLineItem(
                    product_id=product.id,
                    product_name=product.name,
                    quantity=item.quantity,
                    unit_price_minor=live_price,
                    currency=currency,
                    line_total_minor=line_total,
                )
            )

            item_fingerprint.append(
                {
                    "product_id": str(product.id),
                    "quantity": item.quantity,
                    "price_minor": live_price,
                }
            )

        preview_token, expires_at = sign_preview_token(
            secret_key=settings.app_secret_key,
            session_id=str(session_id),
            cart_version=cart.version,
            item_fingerprint=item_fingerprint,
            currency=currency,
            ttl_minutes=settings.preview_token_ttl_minutes,
        )

        tax = 0  # Phase 1 tax placeholder
        total = subtotal + tax

        return CheckoutPreview(
            order_summary=summary,
            subtotal_minor=subtotal,
            tax_minor=tax,
            total_minor=total,
            currency=currency,
            price_changes=price_changes,
            stock_warnings=stock_warnings,
            preview_token=preview_token,
            expires_at=expires_at,
            cart_version=cart.version,
        )

    @staticmethod
    async def confirm_checkout(
        db: AsyncSession,
        session_id: UUID,
        preview_token: str,
    ) -> Order:
        """Confirm checkout, validate preview token, revalidate stock and prices, and reserve stock.

        Raises:
            PreviewInvalid: If signature verification fails or session mismatches.
            PreviewExpired: If token expiry has passed.
            CartModified: If cart was mutated after the preview was generated.
            PriceChanged: If any product price changed after the preview was generated.
            InsufficientStock: If available stock is insufficient.
        """
        settings = get_settings()

        # 1. Verify token HMAC signature and structural format
        payload = decode_preview_token_signature(settings.app_secret_key, preview_token)
        if payload is None:
            raise PreviewInvalid()

        # Check session binding
        if payload.get("session_id") != str(session_id):
            raise PreviewInvalid()

        # Check expiry explicitly to return PREVIEW_EXPIRED (410) instead of PREVIEW_INVALID (400)
        try:
            expires_at = datetime.fromisoformat(payload["expires_at"])
        except Exception:
            raise PreviewInvalid() from None

        if datetime.now(UTC) > expires_at:
            raise PreviewExpired()

        # 2. Verify cart version has not changed
        cart = await CartService.get_or_create_cart(db, session_id)
        if not cart.items:
            raise CartEmpty()

        if cart.version != payload.get("cart_version"):
            raise CartModified()

        # 3. Server-side revalidation of prices against token fingerprint
        token_items = {item["product_id"]: item for item in payload.get("items", [])}
        validated_prices: dict[UUID, int] = {}
        for cart_item in cart.items:
            p_id_str = str(cart_item.product_id)
            if p_id_str not in token_items:
                raise CartModified()

            expected_price = token_items[p_id_str]["price_minor"]

            # Query current live price from DB (bypass identity map cache)
            prod_stmt = (
                select(Product)
                .where(Product.id == cart_item.product_id)
                .execution_options(populate_existing=True)
            )
            current_product = (await db.execute(prod_stmt)).scalar_one()

            if current_product.price_minor != expected_price:
                raise PriceChanged(product_id=str(current_product.id))

            validated_prices[cart_item.product_id] = current_product.price_minor

        # 4. Create Order & OrderItems using the validated live price approved in preview
        date_str = datetime.now(UTC).strftime("%Y%m%d")
        rand_suffix = secrets.token_hex(4).upper()
        order_number = f"PP-{date_str}-{rand_suffix}"

        subtotal = 0
        order_items: list[OrderItem] = []
        currency = settings.default_currency

        order = Order(
            session_id=session_id,
            order_number=order_number,
            status="pending_payment",
            subtotal_minor=0,
            tax_minor=0,
            total_minor=0,
            currency=currency,
            confirmed_by_shopper=True,
            stock_reserved_until=datetime.now(UTC)
            + timedelta(minutes=settings.stock_reservation_ttl_minutes),
        )
        db.add(order)
        await db.flush()  # assign order.id

        for cart_item in cart.items:
            live_price = validated_prices[cart_item.product_id]
            line_total = cart_item.quantity * live_price
            subtotal += line_total
            currency = cart_item.currency

            oi = OrderItem(
                order_id=order.id,
                product_id=cart_item.product_id,
                product_name=cart_item.product.name if cart_item.product else "Product",
                quantity=cart_item.quantity,
                unit_price_minor=live_price,
                currency=currency,
                line_total_minor=line_total,
            )
            db.add(oi)
            order_items.append(oi)

        order.subtotal_minor = subtotal
        order.tax_minor = 0
        order.total_minor = subtotal
        order.currency = currency

        # 5. Atomically reserve stock (with SELECT ... FOR UPDATE)
        await StockService.reserve_stock_for_order(
            db=db,
            order_id=order.id,
            items=cart.items,
            ttl_minutes=settings.stock_reservation_ttl_minutes,
        )

        # 6. Clear shopping cart
        for itm in list(cart.items):
            await db.delete(itm)
        cart.items.clear()
        cart.version += 1

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="checkout.confirmed",
            actor="shopper",
            session_id=session_id,
            order_id=order.id,
            payload={
                "order_number": order.order_number,
                "total_minor": order.total_minor,
                "currency": order.currency,
                "item_count": len(order_items),
            },
        )

        await db.commit()

        # Re-fetch order with items and attempts loaded
        return await CheckoutService.get_order_by_id(db, order.id)

    @staticmethod
    async def get_order_by_id(db: AsyncSession, order_id: UUID) -> Order:
        """Fetch order with items and payment attempts eagerly loaded."""
        stmt = (
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.payment_attempts),
                selectinload(Order.stock_reservations),
            )
            .where(Order.id == order_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one()

    @staticmethod
    def serialize_order_out(order: Order) -> OrderOut:
        """Serialize an ORM Order into an OrderOut schema."""
        item_outs = [
            OrderItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                quantity=item.quantity,
                unit_price_minor=item.unit_price_minor,
                currency=item.currency,
                line_total_minor=item.line_total_minor,
            )
            for item in order.items
        ]

        from app.services.payment_service import PaymentService

        is_demo = PaymentService.is_demo_mode()
        attempt_outs = [
            PaymentAttemptSummary(
                attempt_id=att.id,
                attempt_number=att.attempt_number,
                status=att.status,
                created_at=att.created_at,
                is_demo=is_demo,
                demo_notice="Demo payment — no real payment processed" if is_demo else None,
            )
            for att in getattr(order, "payment_attempts", [])
        ]

        return OrderOut(
            id=order.id,
            order_number=order.order_number,
            status=order.status,
            subtotal_minor=order.subtotal_minor,
            tax_minor=order.tax_minor,
            total_minor=order.total_minor,
            currency=order.currency,
            confirmed_by_shopper=order.confirmed_by_shopper,
            stock_reserved_until=order.stock_reserved_until,
            items=item_outs,
            payment_attempts=attempt_outs,
            created_at=order.created_at,
            is_demo_payment=is_demo,
            demo_notice="Demo payment — no real payment processed" if is_demo else None,
        )
