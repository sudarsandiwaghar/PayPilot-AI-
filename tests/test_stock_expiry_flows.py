"""
Comprehensive end-to-end tests for stock reservation expiry flows:
1. Abandoned-cart scenario swept by background sweeper
2. In-flow payment attempt creation rejected on overdue stock hold
3. In-flow payment capture rejected on overdue stock hold
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartItem
from app.models.order import Order
from app.models.product import Product
from app.models.session import ShoppingSession
from app.services.payment_service import PaymentService
from app.services.stock_service import StockService
from app.utils.exceptions import StockReservationExpired


async def _create_test_session_and_order(db: AsyncSession) -> tuple[ShoppingSession, Order]:
    session = ShoppingSession(access_token_hash=f"hash_{uuid4().hex}")
    db.add(session)
    await db.flush()

    order = Order(
        session_id=session.id,
        order_number=f"EXP-{uuid4().hex[:8]}",
        status="pending_payment",
        subtotal_minor=5000,
        tax_minor=0,
        total_minor=5000,
        currency="USD",
        confirmed_by_shopper=True,
    )
    db.add(order)
    await db.flush()
    return session, order


@pytest.mark.asyncio
async def test_abandoned_cart_swept_by_background_worker(db_session: AsyncSession) -> None:
    """Verify that an abandoned cart with expired reservations is released by the sweeper,

    restoring catalog stock and transitioning order status to 'cancelled'.
    """
    stmt = select(Product).where(Product.stock_qty >= 5).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    _, order = await _create_test_session_and_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=3,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # Simulate reservation that expired 10 minutes ago (abandoned cart)
    reservations = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=-10,
    )
    order.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=10)
    await db_session.flush()

    assert product.stock_qty == initial_stock - 3
    assert reservations[0].status == "held"

    # Background sweeper runs
    released = await StockService.sweep_expired_reservations(db_session)
    assert released >= 1

    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(reservations[0])

    assert product.stock_qty == initial_stock
    assert reservations[0].status == "released"
    assert order.status == "cancelled"


@pytest.mark.asyncio
async def test_payment_initiation_rejected_on_overdue_hold(db_session: AsyncSession) -> None:
    """Verify that in-flow payment initiation synchronously rejects an overdue hold,

    releasing stock and cancelling the order on-demand without waiting for the background sweeper.
    """
    stmt = select(Product).where(Product.stock_qty >= 4).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    session, order = await _create_test_session_and_order(db_session)
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
        ttl_minutes=-5,  # Overdue
    )
    order.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.flush()

    assert product.stock_qty == initial_stock - 2

    # Shopper attempts to initiate payment
    with pytest.raises(StockReservationExpired):
        await PaymentService.create_payment_attempt(
            db=db_session,
            order_id=order.id,
        )

    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(reservations[0])

    assert product.stock_qty == initial_stock
    assert reservations[0].status == "released"
    assert order.status == "cancelled"


@pytest.mark.asyncio
async def test_payment_capture_rejected_on_overdue_hold(db_session: AsyncSession) -> None:
    """Verify that in-flow payment capture synchronously rejects an overdue hold,

    marking the payment attempt 'expired', the order 'cancelled', and releasing stock.
    """
    stmt = select(Product).where(Product.stock_qty >= 4).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    session, order = await _create_test_session_and_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # First reserve with valid hold so payment attempt can be created
    reservations = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=15,
    )
    order.stock_reserved_until = datetime.now(UTC) + timedelta(minutes=15)
    await db_session.flush()

    attempt, _ = await PaymentService.create_payment_attempt(
        db=db_session,
        order_id=order.id,
    )
    assert attempt.status == "created"

    # Now simulate time elapsing past the 15-minute hold TTL before capture
    order.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=2)
    for res in reservations:
        res.expires_at = datetime.now(UTC) - timedelta(minutes=2)
    await db_session.flush()

    # Shopper attempts to capture payment after hold expired
    with pytest.raises(StockReservationExpired):
        await PaymentService.capture_payment_attempt(
            db=db_session,
            order_id=order.id,
            attempt_id=attempt.id,
        )

    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    await db_session.refresh(reservations[0])

    assert product.stock_qty == initial_stock
    assert reservations[0].status == "released"
    assert order.status == "cancelled"
    assert attempt.status == "expired"


@pytest.mark.asyncio
async def test_new_reservation_reclaims_unswept_expired_hold_without_false_rejection(
    db_session: AsyncSession,
) -> None:
    """Verify that when a backend has been sleeping or the sweeper hasn't run yet,

    a new checkout reservation safely reclaims an expired hold on-demand under the row lock,
    preventing false 'InsufficientStock' rejections while preventing overselling.
    """
    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()

    # Normalize product stock to exactly 2 units for deterministic math
    product.stock_qty = 2
    await db_session.flush()

    # 1. Customer A reserves all 2 units, leaving 0 in stock
    _, order_a = await _create_test_session_and_order(db_session)
    item_a = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    res_a = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order_a.id,
        items=[item_a],
        ttl_minutes=15,
    )
    await db_session.flush()
    assert product.stock_qty == 0
    assert res_a[0].status == "held"

    # 2. Simulate 30 minutes passing while backend slept — Customer A's hold expired
    res_a[0].expires_at = datetime.now(UTC) - timedelta(minutes=15)
    order_a.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=15)
    await db_session.flush()

    # Verify that the background sweeper has NOT run yet: stock_qty is still 0 in DB
    assert product.stock_qty == 0
    assert res_a[0].status == "held"

    # 3. Customer B arrives (waking backend) and attempts to reserve 1 unit of the same product
    _, order_b = await _create_test_session_and_order(db_session)
    item_b = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=1,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # Customer B's reservation must NOT be rejected by the unswept expired hold
    res_b = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order_b.id,
        items=[item_b],
        ttl_minutes=15,
    )
    await db_session.flush()

    # Customer B successfully reserved 1 unit
    assert len(res_b) == 1
    assert res_b[0].status == "held"
    assert res_b[0].quantity == 1

    # Verify state of Customer A's order and product stock
    await db_session.refresh(product)
    await db_session.refresh(order_a)
    await db_session.refresh(res_a[0])

    # Reclaimed 2 from A, gave 1 to B -> remaining stock is 1
    assert product.stock_qty == 1
    assert res_a[0].status == "released"
    assert order_a.status == "cancelled"


@pytest.mark.asyncio
async def test_new_reservation_safely_rejects_if_insufficient_even_after_reclaiming(
    db_session: AsyncSession,
) -> None:
    """Verify that reclaiming expired stock does not bypass real stock limits (no overselling)."""
    stmt = select(Product).where(Product.stock_qty >= 1).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()

    # Set product stock to 1
    product.stock_qty = 1
    await db_session.flush()

    # Customer A reserves the 1 unit
    _, order_a = await _create_test_session_and_order(db_session)
    item_a = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=1,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    res_a = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order_a.id,
        items=[item_a],
        ttl_minutes=-5,  # already expired
    )
    await db_session.flush()
    assert product.stock_qty == 0

    # Customer B requests 5 units (even after reclaiming 1, only 1 is available)
    from app.utils.exceptions import InsufficientStock

    _, order_b = await _create_test_session_and_order(db_session)
    item_b = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=5,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    with pytest.raises(InsufficientStock) as exc_info:
        await StockService.reserve_stock_for_order(
            db=db_session,
            order_id=order_b.id,
            items=[item_b],
        )

    assert exc_info.value.code == "INSUFFICIENT_STOCK"
    assert "1 units available but 5 were requested" in exc_info.value.message

    # Customer A's expired hold was reclaimed
    await db_session.refresh(product)
    await db_session.refresh(res_a[0])
    assert product.stock_qty == 1
    assert res_a[0].status == "released"


@pytest.mark.asyncio
async def test_startup_wake_up_sweeper_runs_immediately(
    db_session: AsyncSession,
    session_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify that _stock_sweep_worker immediately reclaims expired reservations on launch,

    without waiting for the 600-second interval to elapse.
    """
    from app.main import _stock_sweep_worker

    monkeypatch.setattr("app.main.async_session_factory", session_factory)

    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    _, order = await _create_test_session_and_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    res = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=-10,  # expired while backend was asleep
    )
    await db_session.commit()

    # Launch worker with a long interval (e.g. 600s / 10 minutes)
    task = asyncio.create_task(_stock_sweep_worker(interval_seconds=600))

    # Wait for the startup sweep to finish (well before the 600s interval sleep)
    for _ in range(25):
        await asyncio.sleep(0.1)
        await db_session.refresh(res[0])
        if res[0].status == "released":
            break

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    # Confirm the expired reservation was swept immediately on startup
    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(res[0])

    assert product.stock_qty == initial_stock
    assert res[0].status == "released"
    assert order.status == "cancelled"


@pytest.mark.asyncio
async def test_concurrent_reservation_and_sweeper_transaction_safety(
    db_session: AsyncSession,
    session_factory,
) -> None:
    """Verify that a concurrent reservation and background sweeper on separate database

    transactions do not deadlock and cannot double-restore stock.
    """
    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()

    # Set product stock to 2
    product.stock_qty = 2
    await db_session.flush()

    # Customer A reserves both units, leaving 0 in stock
    _, order_a = await _create_test_session_and_order(db_session)
    item_a = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    res_a = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order_a.id,
        items=[item_a],
        ttl_minutes=-10,  # expired
    )
    order_a.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=10)
    await db_session.commit()

    # Verify baseline in DB: 0 stock, reservation is held (expired)
    assert product.stock_qty == 0
    assert res_a[0].status == "held"

    # Setup Customer B's order in db_session
    _, order_b = await _create_test_session_and_order(db_session)
    await db_session.commit()

    item_b = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=1,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    # Concurrently execute Customer B's reservation in session 1 and sweep in session 2
    async def _do_reserve() -> list:
        async with session_factory() as s1:
            res = await StockService.reserve_stock_for_order(
                db=s1,
                order_id=order_b.id,
                items=[item_b],
                ttl_minutes=15,
            )
            await s1.commit()
            return res

    async def _do_sweep() -> int:
        async with session_factory() as s2:
            count = await StockService.sweep_expired_reservations(s2)
            await s2.commit()
            return count

    # Run simultaneously across distinct PostgreSQL connections
    reserve_task = asyncio.create_task(_do_reserve())
    sweep_task = asyncio.create_task(_do_sweep())
    res_b, sweep_count = await asyncio.gather(reserve_task, sweep_task)

    # Customer B succeeded
    assert len(res_b) == 1
    assert res_b[0].status == "held"
    assert res_b[0].quantity == 1

    # Verify database final state
    await db_session.refresh(product)
    await db_session.refresh(order_a)
    await db_session.refresh(res_a[0])

    # Exactly 2 units reclaimed, 1 unit reserved by B -> exactly 1 unit remaining
    # If stock were restored twice, stock_qty would be 3 (2+2-1). Must be exactly 1!
    assert product.stock_qty == 1
    assert res_a[0].status == "released"
    assert order_a.status == "cancelled"


@pytest.mark.asyncio
async def test_concurrent_reservations_competing_for_unswept_expired_stock(
    db_session: AsyncSession,
    session_factory,
) -> None:
    """Verify that when two concurrent checkout reservations compete for the same unswept

    expired stock, exactly one succeeds and overselling is strictly prevented without deadlocks.
    """
    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()

    # Product has 2 units total
    product.stock_qty = 2
    await db_session.flush()

    # Customer A reserves both units, then lets them expire
    _, order_a = await _create_test_session_and_order(db_session)
    item_a = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    res_a = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order_a.id,
        items=[item_a],
        ttl_minutes=-10,  # expired
    )
    order_a.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=10)
    await db_session.commit()

    # Create orders for Customer B and Customer C
    _, order_b = await _create_test_session_and_order(db_session)
    _, order_c = await _create_test_session_and_order(db_session)
    await db_session.commit()

    # Both B and C request 2 units (full stock)
    item_b = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    item_c = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )

    from app.utils.exceptions import InsufficientStock

    async def _try_reserve(order_id, item) -> str:
        async with session_factory() as s:
            try:
                await StockService.reserve_stock_for_order(
                    db=s,
                    order_id=order_id,
                    items=[item],
                    ttl_minutes=15,
                )
                await s.commit()
                return "succeeded"
            except InsufficientStock:
                await s.rollback()
                return "insufficient_stock"

    # Run B and C concurrently
    results = await asyncio.gather(
        _try_reserve(order_b.id, item_b),
        _try_reserve(order_c.id, item_c),
    )

    # Exactly one must succeed, and the other must be rejected for insufficient stock
    assert sorted(results) == ["insufficient_stock", "succeeded"]

    # Final DB stock must be 0 (all 2 units held by winner)
    await db_session.refresh(product)
    await db_session.refresh(order_a)
    await db_session.refresh(res_a[0])

    assert product.stock_qty == 0
    assert res_a[0].status == "released"
    assert order_a.status == "cancelled"


@pytest.mark.asyncio
async def test_startup_sweeper_failure_resilience_and_recovery(
    db_session: AsyncSession,
    session_factory,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify that if startup stock sweep raises an exception (e.g. DB connection error),

    the failure is logged with a traceback and the worker stays alive for subsequent sweeps.
    """
    from app.main import _stock_sweep_worker

    monkeypatch.setattr("app.main.async_session_factory", session_factory)

    stmt = select(Product).where(Product.stock_qty >= 2).limit(1)
    product = (await db_session.execute(stmt)).scalar_one()
    initial_stock = product.stock_qty

    _, order = await _create_test_session_and_order(db_session)
    item = CartItem(
        cart_id=uuid4(),
        product_id=product.id,
        quantity=2,
        unit_price_minor=product.price_minor,
        currency=product.currency,
    )
    res = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=[item],
        ttl_minutes=-10,
    )
    await db_session.commit()

    # Simulate startup failure on the first sweep attempt
    real_sweep = StockService.sweep_expired_reservations
    attempt_count = 0

    async def _failing_first_sweep(db: AsyncSession) -> int:
        nonlocal attempt_count
        attempt_count += 1
        if attempt_count == 1:
            raise RuntimeError("Simulated Neon cold-start connection timeout")
        return await real_sweep(db)

    monkeypatch.setattr(StockService, "sweep_expired_reservations", _failing_first_sweep)

    # Launch worker with very short interval (0.1s) so the second sweep happens quickly
    task = asyncio.create_task(_stock_sweep_worker(interval_seconds=1))

    # Give time for startup attempt (fails) and subsequent interval attempt (succeeds)
    for _ in range(30):
        await asyncio.sleep(0.1)
        await db_session.refresh(res[0])
        if res[0].status == "released":
            break

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    # Confirm the first failure was logged with traceback and message
    assert "Startup stock sweep encountered an error" in caplog.text
    assert "Simulated Neon cold-start connection timeout" in caplog.text

    # Confirm the worker did not die and recovered on the next iteration
    await db_session.refresh(product)
    await db_session.refresh(order)
    await db_session.refresh(res[0])

    assert product.stock_qty == initial_stock
    assert res[0].status == "released"
    assert order.status == "cancelled"


@pytest.mark.asyncio
async def test_multi_product_order_reclamation_and_lock_ordering(
    db_session: AsyncSession,
) -> None:
    """Verify that multi-product orders with expired reservations across multiple products

    are reclaimed in strict sorted lock order without deadlocks or missed stock.
    """
    stmt = select(Product).where(Product.stock_qty >= 3).limit(2)
    products = list((await db_session.execute(stmt)).scalars().all())
    assert len(products) == 2

    p1, p2 = products[0], products[1]
    p1_initial, p2_initial = p1.stock_qty, p2.stock_qty

    _, order = await _create_test_session_and_order(db_session)
    items = [
        CartItem(
            cart_id=uuid4(),
            product_id=p1.id,
            quantity=2,
            unit_price_minor=p1.price_minor,
            currency=p1.currency,
        ),
        CartItem(
            cart_id=uuid4(),
            product_id=p2.id,
            quantity=1,
            unit_price_minor=p2.price_minor,
            currency=p2.currency,
        ),
    ]

    res = await StockService.reserve_stock_for_order(
        db=db_session,
        order_id=order.id,
        items=items,
        ttl_minutes=-5,  # expired
    )
    order.stock_reserved_until = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.flush()

    assert len(res) == 2
    assert p1.stock_qty == p1_initial - 2
    assert p2.stock_qty == p2_initial - 1

    # Run sweeper to reclaim both products
    released = await StockService.sweep_expired_reservations(db_session)
    assert released == 2

    await db_session.refresh(p1)
    await db_session.refresh(p2)
    await db_session.refresh(order)

    assert p1.stock_qty == p1_initial
    assert p2.stock_qty == p2_initial
    assert order.status == "cancelled"


