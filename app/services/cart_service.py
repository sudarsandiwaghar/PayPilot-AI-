"""
Shopping cart service.

Handles cart operations: adding, updating, removing items, calculating totals,
and monotonically incrementing cart version on every mutation.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import Cart, CartItem
from app.models.product import Product
from app.schemas.cart import CartItemOut, CartOut
from app.utils.exceptions import (
    CartItemNotFound,
    InsufficientStock,
    ProductNotFound,
    SessionNotFound,
)


class CartService:
    """Service handling cart lifecycle and line items."""

    @staticmethod
    async def get_or_create_cart(db: AsyncSession, session_id: UUID) -> Cart:
        """Fetch the cart for the given session or create one if missing."""
        stmt = (
            select(Cart)
            .options(selectinload(Cart.items).joinedload(CartItem.product))
            .where(Cart.session_id == session_id)
        )
        result = await db.execute(stmt)
        cart = result.scalar_one_or_none()

        if cart is None:
            # Verify session exists
            from app.models.session import ShoppingSession

            session_exists = (
                await db.execute(select(ShoppingSession.id).where(ShoppingSession.id == session_id))
            ).scalar_one_or_none()
            if not session_exists:
                raise SessionNotFound(str(session_id))

            cart = Cart(session_id=session_id, version=1)
            db.add(cart)
            await db.commit()
            return await CartService.get_or_create_cart(db, session_id)

        return cart

    @staticmethod
    def build_cart_out(cart: Cart) -> CartOut:
        """Convert an ORM Cart into a serialized CartOut schema."""
        item_outs: list[CartItemOut] = []
        subtotal = 0
        total_items = 0
        currency = "USD"

        for item in cart.items:
            product_name = item.product.name if item.product else "Unknown Product"
            currency = item.currency
            line_total = item.quantity * item.unit_price_minor
            subtotal += line_total
            total_items += item.quantity

            item_outs.append(
                CartItemOut(
                    id=item.id,
                    product_id=item.product_id,
                    product_name=product_name,
                    quantity=item.quantity,
                    unit_price_minor=item.unit_price_minor,
                    currency=currency,
                    line_total_minor=line_total,
                )
            )

        return CartOut(
            id=cart.id,
            session_id=cart.session_id,
            version=cart.version,
            items=item_outs,
            subtotal_minor=subtotal,
            currency=currency,
            item_count=total_items,
        )

    @staticmethod
    async def get_cart_view(db: AsyncSession, session_id: UUID) -> CartOut:
        """Get the full serialized cart for a session."""
        cart = await CartService.get_or_create_cart(db, session_id)
        return CartService.build_cart_out(cart)

    @staticmethod
    async def add_item(
        db: AsyncSession,
        session_id: UUID,
        product_id: UUID,
        quantity: int,
    ) -> CartOut:
        """Add a product to the cart or increment quantity if already present.

        Raises:
            ProductNotFound: If product is not active or missing.
            InsufficientStock: If requested quantity exceeds available stock.
        """
        # Validate product and stock
        stmt = select(Product).where(Product.id == product_id, Product.is_active.is_(True))
        product = (await db.execute(stmt)).scalar_one_or_none()
        if product is None:
            raise ProductNotFound(str(product_id))

        cart = await CartService.get_or_create_cart(db, session_id)

        # Check existing item
        existing_item = next((i for i in cart.items if i.product_id == product_id), None)
        new_quantity = quantity if existing_item is None else existing_item.quantity + quantity

        if product.stock_qty < new_quantity:
            raise InsufficientStock(
                product_id=str(product_id),
                available=product.stock_qty,
                requested=new_quantity,
            )

        if existing_item:
            existing_item.quantity = min(new_quantity, 99)
            existing_item.unit_price_minor = product.price_minor
        else:
            new_item = CartItem(
                cart_id=cart.id,
                product_id=product.id,
                quantity=min(new_quantity, 99),
                unit_price_minor=product.price_minor,
                currency=product.currency,
                product=product,
            )
            cart.items.append(new_item)
            db.add(new_item)

        cart.version += 1

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="cart.item_added",
            actor="shopper",
            session_id=session_id,
            payload={"product_id": str(product_id), "quantity": quantity, "new_version": cart.version},
        )

        await db.commit()

        # Build view directly from in-memory cart
        return CartService.build_cart_out(cart)

    @staticmethod
    async def update_item_quantity(
        db: AsyncSession,
        session_id: UUID,
        item_id: UUID,
        quantity: int,
    ) -> CartOut:
        """Update line item quantity.

        Raises:
            CartItemNotFound: If item is not in this cart.
            InsufficientStock: If quantity exceeds stock.
        """
        cart = await CartService.get_or_create_cart(db, session_id)
        item = next((i for i in cart.items if i.id == item_id), None)
        if item is None:
            raise CartItemNotFound(str(item_id))

        # Check stock on product
        product = item.product
        if product and product.stock_qty < quantity:
            raise InsufficientStock(
                product_id=str(product.id),
                available=product.stock_qty,
                requested=quantity,
            )

        item.quantity = quantity
        cart.version += 1

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="cart.item_updated",
            actor="shopper",
            session_id=session_id,
            payload={"item_id": str(item_id), "quantity": quantity, "new_version": cart.version},
        )

        await db.commit()

        return CartService.build_cart_out(cart)

    @staticmethod
    async def remove_item(
        db: AsyncSession,
        session_id: UUID,
        item_id: UUID,
    ) -> CartOut:
        """Remove a single line item from the cart.

        Raises:
            CartItemNotFound: If item is not in this cart.
        """
        cart = await CartService.get_or_create_cart(db, session_id)
        item = next((i for i in cart.items if i.id == item_id), None)
        if item is None:
            raise CartItemNotFound(str(item_id))

        cart.items.remove(item)
        await db.delete(item)
        cart.version += 1

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="cart.item_removed",
            actor="shopper",
            session_id=session_id,
            payload={"item_id": str(item_id), "new_version": cart.version},
        )

        await db.commit()

        return CartService.build_cart_out(cart)

    @staticmethod
    async def clear_cart(
        db: AsyncSession,
        session_id: UUID,
    ) -> CartOut:
        """Remove all items from the cart."""
        cart = await CartService.get_or_create_cart(db, session_id)

        for itm in list(cart.items):
            await db.delete(itm)
        cart.items.clear()
        cart.version += 1

        from app.services.audit_service import AuditService

        await AuditService.emit_event(
            db=db,
            event_type="cart.cleared",
            actor="shopper",
            session_id=session_id,
            payload={"new_version": cart.version},
        )

        await db.commit()

        return CartService.build_cart_out(cart)
