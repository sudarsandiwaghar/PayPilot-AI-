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

            # Reclaim any expired reservations for this product under the row lock
            # so stale/unswept holds (e.g. while backend was asleep) never falsely reject new orders
            now = datetime.now(UTC)
            exp_stmt = (
                select(StockReservation)
                .where(
                    StockReservation.product_id == product.id,
                    StockReservation.status == "held",
                    StockReservation.expires_at <= now,
                )
                .with_for_update()
            )
            expired_res = list((await db.execute(exp_stmt)).scalars().all())
            if expired_res:
                reclaimed_qty = sum(r.quantity for r in expired_res)
                product.stock_qty += reclaimed_qty
                affected_order_ids: set[UUID] = set()
                for r in expired_res:
                    r.status = "released"
                    affected_order_ids.add(r.order_id)

                if affected_order_ids:
                    from app.models.order import Order

                    ord_stmt = (
                        select(Order)
                        .where(
                            Order.id.in_(sorted(affected_order_ids, key=str)),
                            Order.status.in_(["pending_payment", "payment_processing"]),
                        )
                        .with_for_update()
                    )
                    orders = list((await db.execute(ord_stmt)).scalars().all())
                    for ord_obj in orders:
                        ord_obj.status = "cancelled"

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
        """Release all held stock for an order and restore product.stock_qty.

        Follows strict hierarchical lock ordering (Product -> StockReservation)
        to prevent deadlocks and ensure idempotent, exact-once stock restoration.
        """
        cand_stmt = (
            select(StockReservation.product_id)
            .where(
                StockReservation.order_id == order_id,
                StockReservation.status == "held",
            )
            .distinct()
        )
        product_ids = list((await db.execute(cand_stmt)).scalars().all())
        if not product_ids:
            return 0

        # Sort product IDs to strictly guarantee lock ordering across all transactions
        sorted_product_ids = sorted(product_ids, key=str)
        total_released = 0

        for prod_id in sorted_product_ids:
            # 1. Lock Product first
            prod_stmt = (
                select(Product)
                .where(Product.id == prod_id)
                .with_for_update()
            )
            product = (await db.execute(prod_stmt)).scalar_one_or_none()
            if product is None:
                continue

            # 2. Under the Product lock, lock and fetch held reservations for this order
            res_stmt = (
                select(StockReservation)
                .where(
                    StockReservation.order_id == order_id,
                    StockReservation.product_id == prod_id,
                    StockReservation.status == "held",
                )
                .with_for_update()
            )
            held_res = list((await db.execute(res_stmt)).scalars().all())
            if not held_res:
                continue

            reclaimed_qty = sum(r.quantity for r in held_res)
            product.stock_qty += reclaimed_qty
            for r in held_res:
                r.status = "released"
            total_released += len(held_res)

        return total_released

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
            .with_for_update()
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
        Uses hierarchical row locks (`Product` -> `StockReservation` -> `Order`)
        to eliminate deadlocks with concurrent checkouts, prevent double-releases,
        restore product inventory, and cancel abandoned orders.

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
        cand_stmt = (
            select(StockReservation.product_id)
            .where(
                StockReservation.status == "held",
                StockReservation.expires_at <= now,
            )
            .distinct()
        )
        candidate_product_ids = list((await db.execute(cand_stmt)).scalars().all())
        if not candidate_product_ids:
            return 0

        # Sort product IDs to strictly guarantee lock ordering across all transactions
        sorted_product_ids = sorted(candidate_product_ids, key=str)
        total_released = 0
        affected_order_ids: set[UUID] = set()

        for prod_id in sorted_product_ids:
            # 1. Lock Product first (identical lock ordering as reserve_stock_for_order)
            prod_stmt = (
                select(Product)
                .where(Product.id == prod_id)
                .with_for_update()
            )
            product = (await db.execute(prod_stmt)).scalar_one_or_none()
            if product is None:
                continue

            # 2. Under the Product lock, lock and fetch expired StockReservations
            exp_stmt = (
                select(StockReservation)
                .where(
                    StockReservation.product_id == prod_id,
                    StockReservation.status == "held",
                    StockReservation.expires_at <= now,
                )
                .with_for_update()
            )
            expired_res = list((await db.execute(exp_stmt)).scalars().all())
            if not expired_res:
                continue

            reclaimed_qty = sum(r.quantity for r in expired_res)
            product.stock_qty += reclaimed_qty
            for r in expired_res:
                r.status = "released"
                affected_order_ids.add(r.order_id)
            total_released += len(expired_res)

        # 3. Lock and cancel abandoned orders (sorted by order_id)
        if affected_order_ids:
            from app.models.order import Order

            sorted_order_ids = sorted(affected_order_ids, key=str)
            orders_stmt = (
                select(Order)
                .where(
                    Order.id.in_(sorted_order_ids),
                    Order.status.in_(["pending_payment", "payment_processing"]),
                )
                .with_for_update()
            )
            orders = list((await db.execute(orders_stmt)).scalars().all())
            for ord_obj in orders:
                ord_obj.status = "cancelled"

        await db.commit()
        return total_released


if __name__ == "__main__":
    from app.database import async_session_factory

    async def _run_sweep():
        async with async_session_factory() as session:
            count = await StockService.sweep_expired_reservations(session)
            print(f"Stock sweep completed: {count} reservations released.")

    asyncio.run(_run_sweep())
