"""
Stock reservation service.

Manages temporary inventory holds (`held`), committed purchases (`committed`),
and inventory releases (`released`). All product stock mutations use row locks
(`SELECT ... FOR UPDATE`) to prevent overselling under concurrent requests.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartItem
from app.models.order import OrderItem
from app.models.product import Product
from app.models.stock import StockReservation
from app.utils.exceptions import InsufficientStock


class StockService:
    """Service handling atomic inventory reservations and releases."""

    @staticmethod
    async def reserve_stock_for_order(
        db: AsyncSession,
        order_id: UUID,
        items: list[CartItem] | list[OrderItem],
        ttl_minutes: int = 15,
    ) -> list[StockReservation]:
        """Atomically hold stock for an order using FOR UPDATE locks.

        Decrements product.stock_qty and creates StockReservation records.

        Raises:
            InsufficientStock: If any product has fewer available units than requested.
        """
        expires_at = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        reservations: list[StockReservation] = []

        # Sort items by product_id to prevent database deadlocks on concurrent orders
        sorted_items = sorted(items, key=lambda x: str(x.product_id))

        for item in sorted_items:
            stmt = (
                select(Product)
                .where(Product.id == item.product_id)
                .with_for_update()
            )
            product = (await db.execute(stmt)).scalar_one_or_none()
            if product is None:
                raise InsufficientStock(
                    product_id=str(item.product_id),
                    available=0,
                    requested=item.quantity,
                )

            if product.stock_qty < item.quantity:
                raise InsufficientStock(
                    product_id=str(product.id),
                    available=product.stock_qty,
                    requested=item.quantity,
                )

            product.stock_qty -= item.quantity

            res = StockReservation(
                product_id=product.id,
                order_id=order_id,
                quantity=item.quantity,
                status="held",
                expires_at=expires_at,
            )
            db.add(res)
            reservations.append(res)

        return reservations

    @staticmethod
    async def release_reservations_for_order(
        db: AsyncSession,
        order_id: UUID,
    ) -> int:
        """Release all held stock for an order and restore product.stock_qty."""
        stmt = (
            select(StockReservation)
            .where(
                StockReservation.order_id == order_id,
                StockReservation.status == "held",
            )
        )
        reservations = list((await db.execute(stmt)).scalars().all())
        if not reservations:
            return 0

        # Sort to prevent deadlocks
        reservations.sort(key=lambda r: str(r.product_id))

        for res in reservations:
            prod_stmt = (
                select(Product)
                .where(Product.id == res.product_id)
                .with_for_update()
            )
            product = (await db.execute(prod_stmt)).scalar_one_or_none()
            if product:
                product.stock_qty += res.quantity

            res.status = "released"

        return len(reservations)

    @staticmethod
    async def commit_reservations_for_order(
        db: AsyncSession,
        order_id: UUID,
    ) -> int:
        """Commit held stock when payment captures successfully."""
        stmt = (
            select(StockReservation)
            .where(
                StockReservation.order_id == order_id,
                StockReservation.status == "held",
            )
        )
        reservations = list((await db.execute(stmt)).scalars().all())
        for res in reservations:
            res.status = "committed"

        return len(reservations)

    @staticmethod
    async def expire_order_reservations_if_overdue(
        db: AsyncSession,
        order_id: UUID,
    ) -> bool:
        """Check if held reservations for this order are expired; if so, release stock.

        Returns:
            True if reservations were expired and released, False otherwise.
        """
        now = datetime.now(UTC)
        stmt = (
            select(StockReservation)
            .where(
                StockReservation.order_id == order_id,
                StockReservation.status == "held",
                StockReservation.expires_at <= now,
            )
        )
        expired_reservations = list((await db.execute(stmt)).scalars().all())
        if not expired_reservations:
            return False

        # Release stock
        await StockService.release_reservations_for_order(db, order_id)
        return True

    @staticmethod
    async def sweep_expired_reservations(db: AsyncSession) -> int:
        """Idempotently sweep and release all expired held stock reservations.

        Can be scheduled periodically or run via CLI.
        Uses row locks (`with_for_update()`) to prevent concurrent release races.
        Restores product inventory, marks reservations 'released', and cancels abandoned orders.

        Returns:
            Count of reservations released.
        """
        # Attempt to acquire PostgreSQL transaction advisory lock (84729103)
        # to ensure overlapping runs (multi-worker or cron) exit cleanly without race conditions.
        try:
            from sqlalchemy import func

            lock_stmt = select(func.pg_try_advisory_xact_lock(84729103))
            acquired = (await db.execute(lock_stmt)).scalar()
            if acquired is False:
                return 0
        except Exception:
            pass

        now = datetime.now(UTC)
        stmt = (
            select(StockReservation)
            .where(
                StockReservation.status == "held",
                StockReservation.expires_at <= now,
            )
            .with_for_update(skip_locked=True)
        )
        expired_reservations = list((await db.execute(stmt)).scalars().all())
        if not expired_reservations:
            return 0

        # Sort to prevent deadlocks when locking products
        expired_reservations.sort(key=lambda r: str(r.product_id))

        affected_order_ids: set[UUID] = set()

        for res in expired_reservations:
            prod_stmt = (
                select(Product)
                .where(Product.id == res.product_id)
                .with_for_update()
            )
            product = (await db.execute(prod_stmt)).scalar_one_or_none()
            if product:
                product.stock_qty += res.quantity

            res.status = "released"
            affected_order_ids.add(res.order_id)

        # Cancel abandoned orders
        if affected_order_ids:
            from app.models.order import Order

            orders_stmt = (
                select(Order)
                .where(
                    Order.id.in_(affected_order_ids),
                    Order.status.in_(["pending_payment", "payment_processing"]),
                )
                .with_for_update()
            )
            orders = list((await db.execute(orders_stmt)).scalars().all())
            for ord_obj in orders:
                ord_obj.status = "cancelled"

        await db.commit()
        return len(expired_reservations)


if __name__ == "__main__":
    from app.database import async_session_factory

    async def _run_sweep():
        async with async_session_factory() as session:
            count = await StockService.sweep_expired_reservations(session)
            print(f"Stock sweep completed: {count} reservations released.")

    asyncio.run(_run_sweep())
