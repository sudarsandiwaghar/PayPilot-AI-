"""
Integration and unit tests for Stock Reservations.

Tests row locking, oversell prevention, reservation release, and TTL expiry.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartItem
from app.models.order import Order
from app.models.product import Product
from app.models.session import ShoppingSession
from app.services.stock_service import StockService
from app.utils.exceptions import InsufficientStock


async def _create_test_order(db: AsyncSession) -> Order:
    session = ShoppingSession(access_token_hash="testhash123")
    db.add(session)
    await db.flush()

    order = Order(
        session_id=session.id,
        order_number=f"TEST-{uuid4().hex[:8]}",
        status="pending_payment",
        subtotal_minor=1000,
        tax_minor=0,
        total_minor=1000,
        currency="USD",
        confirmed_by_shopper=True,
    )
    db.add(order)
    await db.flush()
    return order


@pytest.mark.asyncio
async def test_stock_reservation_and_release(db_session: AsyncSession) -> None:
    # 1. Fetch a product
    stmt = select(Product).where(Product.stock_qty >= 5).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    # 2. Create a test order
    order = await _create_test_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=3,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # 3. Reserve stock
    reservations = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=15,
    )
    await db_session.flush()

    assert len(reservations) == 1
    assert reservations[0].status == "held"
    assert product.stock_qty == initial_stock - 3

    # 4. Release stock
    released_count = await StockService.release_reservations_for_order(
        db=db_session,
        order_id=order.id,
    )
    await db_session.flush()

    assert released_count == 1
    assert reservations[0].status == "released"
    assert product.stock_qty == initial_stock


@pytest.mark.asyncio
async def test_stock_reservation_insufficient_stock(db_session: AsyncSession) -> None:
    stmt = select(Product).where(Product.stock_qty > 0).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    order = await _create_test_order(db_session)

    # Request more than stock_qty
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=product.stock_qty + 10,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    with pytest.raises(InsufficientStock):
        await StockService.reserve_stock_for_order(
            db=db_session,
            order_id=order.id,
            items=[item],
        )


@pytest.mark.asyncio
async def test_stock_reservation_expiry_release(db_session: AsyncSession) -> None:
    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    order = await _create_test_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # Reserve with negative TTL so it is immediately overdue
    reservations = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=-5,
    )
    await db_session.flush()
    assert product.stock_qty == initial_stock - 2

    # Check and expire overdue reservations
    expired = await StockService.expire_order_reservations_if_overdue(db_session, order.id)
    await db_session.flush()

    assert expired is True
    assert product.stock_qty == initial_stock
    assert reservations[0].status == "released"


@pytest.mark.asyncio
async def test_sweep_expired_reservations_releases_stock_and_cancels_order(
    db_session: AsyncSession,
) -> None:
    """Ensure idempotent sweep releases held stock on abandoned checkouts without double release."""
    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    order = await _create_test_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # Reserve with negative TTL so it is already overdue/expired
    reservations = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=-10,
    )
    await db_session.flush()
    assert product.stock_qty == initial_stock - 2
    assert reservations[0].status == "held"

    # First sweep: releases stock, cancels order, returns count
    released_count = await StockService.sweep_expired_reservations(db_session)
    assert released_count >= 1

    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(reservations[0])

    assert product.stock_qty == initial_stock
    assert reservations[0].status == "released"
    assert order.status == "cancelled"

    # Second sweep: idempotent no-op, cannot release stock more than once
    second_count = await StockService.sweep_expired_reservations(db_session)
    assert second_count == 0

    await db_session.refresh(product)
    assert product.stock_qty == initial_stock


@pytest.mark.asyncio
async def test_concurrent_overlapping_stock_sweeps_are_safe(
    db_session: AsyncSession, session_factory
) -> None:
    """Ensure concurrent or overlapping sweep calls never double-release stock or crash."""
    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    order = await _create_test_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    reservations = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=-10,
    )
    await db_session.commit()
    assert product.stock_qty == initial_stock - 2

    # Run two overlapping sweeps concurrently using distinct DB connections
    async with session_factory() as s1, session_factory() as s2:
        sweep1 = StockService.sweep_expired_reservations(s1)
        sweep2 = StockService.sweep_expired_reservations(s2)
        results = await asyncio.gather(sweep1, sweep2)

    # Exactly one sweep processes the reservation; the other releases 0
    assert sum(results) >= 1
    assert 0 in results

    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(reservations[0])

    assert product.stock_qty == initial_stock
    assert reservations[0].status == "released"
    assert order.status == "cancelled"


@pytest.mark.asyncio
async def test_stock_sweep_worker_task_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure the background worker task runs and shuts down cleanly on cancellation."""
    from app.main import _stock_sweep_worker

    called_count = 0

    async def _mock_sweep(db: AsyncSession) -> int:
        nonlocal called_count
        called_count += 1
        return 0

    monkeypatch.setattr(StockService, "sweep_expired_reservations", _mock_sweep)

    task = asyncio.create_task(_stock_sweep_worker(interval_seconds=1))
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
